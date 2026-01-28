import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Fetch all logs joined with timestamps
        const logs = await db.query(`
            SELECT option_label, timestamp 
            FROM bottle_level_logs 
            ORDER BY timestamp DESC
        `);

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

        // Get all unique options for columns
        const optionsRes = await db.query('SELECT DISTINCT label FROM bottle_level_options ORDER BY display_order');
        const options = optionsRes.map((o: any) => o.label);

        return NextResponse.json({ shifts: result, options });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
