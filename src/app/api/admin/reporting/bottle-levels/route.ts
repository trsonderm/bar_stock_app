import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { dateRange, userId, categoryId, locationId, shiftId } = await req.json();

        // 1. Fetch available options for this org
        const optionsRes = await db.query(
            'SELECT label FROM bottle_level_options WHERE organization_id = $1 ORDER BY display_order',
            [session.organizationId]
        );
        const configuredOptions = optionsRes.map((o: any) => o.label);

        // 2. Build Query for Bottle Level Logs
        let query = `
            SELECT 
                al.details->>'itemId' as item_id,
                al.details->>'itemName' as item_name,
                bll.option_label,
                COUNT(bll.id) as count
            FROM bottle_level_logs bll
            JOIN activity_logs al ON bll.activity_log_id = al.id
            WHERE al.organization_id = $1
        `;
        const params: any[] = [session.organizationId];

        // Apply filters
        if (dateRange?.start) {
            query += ` AND al.timestamp >= $${params.length + 1}::timestamp`;
            params.push(dateRange.start);
        }
        if (dateRange?.end) {
            query += ` AND al.timestamp <= $${params.length + 1}::timestamp + INTERVAL '1 day'`;
            params.push(dateRange.end);
        }
        if (userId) {
            query += ` AND al.user_id = $${params.length + 1}`;
            params.push(userId);
        }
        if (locationId) {
            query += ` AND (al.details->>'locationId')::int = $${params.length + 1}`;
            params.push(locationId);
        }
        // Category filtering requires a small subquery or assumption that category isn't in details
        // To keep it simple, if categoryId is provided, we filter items
        if (categoryId) {
            query += ` AND (al.details->>'itemId')::int IN (SELECT id FROM items WHERE category_id = $${params.length + 1})`;
            params.push(categoryId);
        }

        query += ` GROUP BY al.details->>'itemId', al.details->>'itemName', bll.option_label`;

        const logsRes = await db.query(query, params);

        // 3. Process into grouped data format
        // Expected out: [{ id: 123, name: "Grey Goose", 'Empty Bottle': 2, 'Half': 1 }]
        const itemMap = new Map<string, any>();
        const foundOptions = new Set(configuredOptions);

        logsRes.forEach((row: any) => {
            const itemId = row.item_id;
            const itemName = row.item_name || 'Unknown Item';
            const opt = row.option_label;
            const cnt = Number(row.count);

            foundOptions.add(opt);

            if (!itemMap.has(itemId)) {
                itemMap.set(itemId, { id: itemId, name: itemName, total: 0 });
            }

            const itemEntry = itemMap.get(itemId);
            itemEntry[opt] = (itemEntry[opt] || 0) + cnt;
            itemEntry.total += cnt;
        });

        const reportData = Array.from(itemMap.values()).sort((a, b) => b.total - a.total);

        // Include any options found in logs but not active in settings
        const allOptions = Array.from(foundOptions);
        // maintain order from settings where possible
        allOptions.sort((a: string, b: string) => {
            const idxA = configuredOptions.indexOf(a);
            const idxB = configuredOptions.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        return NextResponse.json({
            data: reportData,
            options: allOptions
        });

    } catch (e: any) {
        console.error('Bottle Level Report Error:', e);
        return NextResponse.json({ error: 'Failed to generate report', details: e.message }, { status: 500 });
    }
}

