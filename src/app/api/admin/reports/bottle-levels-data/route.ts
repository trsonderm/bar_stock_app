import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        console.log('[BottleReport] GET Request Started');
        const session = await getSession();

        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch logs for THIS organization only via JOIN with activity_logs
        const query = `
            SELECT bll.option_label, bll.timestamp 
            FROM bottle_level_logs bll
            JOIN activity_logs al ON bll.activity_log_id = al.id
            WHERE al.organization_id = $1
            ORDER BY bll.timestamp DESC
        `;
        const logs = await db.query(query, [session.organizationId]);

        // Process into Shifts (7AM to 5AM)
        const shifts: { [key: string]: { [option: string]: number } } = {};

        logs.forEach((log: any) => {
            const date = new Date(log.timestamp);
            // Adjust for shift: if hour < 5, it belongs to previous day
            const shiftDate = new Date(date);
            if (date.getHours() < 5) {
                shiftDate.setDate(shiftDate.getDate() - 1);
            }
            const dateStr = shiftDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            if (!shifts[dateStr]) shifts[dateStr] = {};
            if (!shifts[dateStr][log.option_label]) shifts[dateStr][log.option_label] = 0;
            shifts[dateStr][log.option_label]++;
        });

        // Convert to array
        const result = Object.entries(shifts).map(([date, counts]) => ({
            date,
            counts
        }));

        // Get all unique options for columns (Scoped to Org)
        const optionsRes = await db.query(
            'SELECT label FROM bottle_level_options WHERE organization_id = $1 ORDER BY display_order',
            [session.organizationId]
        );
        const configuredOptions = optionsRes.map((o: any) => o.label);

        // Find labels in logs that aren't in options (Prevent Data Hiding)
        const foundLabels = new Set(logs.map((l: any) => l.option_label));
        const extraLabels = Array.from(foundLabels).filter((l: string) => !configuredOptions.includes(l));

        const options = [...configuredOptions, ...extraLabels];

        return NextResponse.json({
            shifts: result,
            options,
            debug: {
                orgId: session.organizationId,
                logsFound: logs.length
            }
        });
    } catch (e: any) {
        console.error('[BottleReport] Critical Error:', e);
        return NextResponse.json({ error: e.message || 'Critical API Error', stack: e.stack }, { status: 500 });
    }
}
