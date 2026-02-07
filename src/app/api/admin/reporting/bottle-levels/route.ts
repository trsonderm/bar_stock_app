import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { dateRange, userId, categoryId, shiftId } = await req.json();

        // 1. Fetch Configuration (Shifts & Workday)
        const shifts = await db.query(
            'SELECT * FROM shifts WHERE organization_id = $1 ORDER BY start_time ASC',
            [session.organizationId]
        );
        const settingsRes = await db.query(
            'SELECT value FROM settings WHERE organization_id = $1 AND key = \'workday_start\'',
            [session.organizationId]
        );
        const workdayStart = settingsRes[0]?.value || '06:00';

        // 2. Build Query
        let query = `
            SELECT 
                al.id, 
                al.created_at, 
                al.user_name,
                al.details->>'itemName' as item_name,
                al.details->>'remainingLevel' as remaining_level,
                c.name as category_name
            FROM activity_logs al
            JOIN items i ON (al.details->>'itemId')::int = i.id
            JOIN categories c ON i.category_id = c.id
            WHERE al.organization_id = $1 
            AND al.action = 'SUBTRACT_STOCK'
            AND al.details->>'remainingLevel' IS NOT NULL
            AND c.enable_low_stock_reporting = true
        `;
        const params: any[] = [session.organizationId];

        if (userId) {
            query += ` AND al.user_id = $${params.length + 1}`;
            params.push(userId);
        }

        if (categoryId) {
            query += ` AND i.category_id = $${params.length + 1}`;
            params.push(categoryId);
        }

        // Fetch Raw Data first, then filter/group in JS (easier for shift complex logic)
        // Alternatively we can filter by date range in SQL if we adjust for workday
        // Let's filter broadly by date first to avoid fetching everything
        if (dateRange?.start) {
            // Subtract 1 day from start to catch early morning shifts belonging to previous day
            query += ` AND al.created_at >= $${params.length + 1}::timestamp - INTERVAL '1 day'`;
            params.push(dateRange.start);
        }
        if (dateRange?.end) {
            // Add 1 day to end to catch overlaps
            query += ` AND al.created_at <= $${params.length + 1}::timestamp + INTERVAL '2 day'`;
            params.push(dateRange.end);
        }

        query += ` ORDER BY al.created_at DESC`;

        const logs = await db.query(query, params);

        // 3. Process Data (Assign Shifts and Filter by Workday Date)
        const processed = logs.map(log => {
            const date = new Date(log.created_at);

            // Adjust for Workday (if before workday start, counts as previous day)
            const [wdH, wdM] = workdayStart.split(':').map(Number);
            const logH = date.getHours();
            const logM = date.getMinutes();

            let businessDate = new Date(date);
            if (logH < wdH || (logH === wdH && logM < wdM)) {
                businessDate.setDate(businessDate.getDate() - 1);
            }
            const dateStr = businessDate.toISOString().split('T')[0];

            // Determine Shift
            // Simple logic: Find matching shift interval. 
            // Handles midnight overlap: Start > End (e.g. 20:00 - 04:00)
            const timeStr = `${logH.toString().padStart(2, '0')}:${logM.toString().padStart(2, '0')}`;
            let shiftLabel = 'Other';

            for (const s of shifts) {
                if (s.start_time <= s.end_time) {
                    // Standard shift (e.g. 08:00 - 16:00)
                    if (timeStr >= s.start_time && timeStr <= s.end_time) {
                        shiftLabel = s.label;
                        break;
                    }
                } else {
                    // Overlapping shift (e.g. 20:00 - 04:00)
                    if (timeStr >= s.start_time || timeStr <= s.end_time) {
                        shiftLabel = s.label;
                        break;
                    }
                }
            }

            return { ...log, businessDate, dateStr, shiftLabel };
        });

        // 4. Strict Date Filter & Shift Filter (Post-processing)
        const filtered = processed.filter(p => {
            if (dateRange?.start && p.dateStr < dateRange.start) return false;
            if (dateRange?.end && p.dateStr > dateRange.end) return false;

            // Shift ID Filter
            if (shiftId) {
                // Find config for this shift
                const targetShift = shifts.find((s: any) => s.id == shiftId); // fuzzy match id
                if (!targetShift || p.shiftLabel !== targetShift.label) return false;
            }

            return true;
        });

        return NextResponse.json({ data: filtered });

    } catch (e) {
        console.error('Bottle Level Report Error:', e);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
