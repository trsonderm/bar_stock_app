import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { action, startDate, endDate } = body;
        const organizationId = session.organizationId;

        if (action === 'clear_week') {
            if (!startDate || !endDate) {
                return NextResponse.json({ error: 'startDate and endDate required for clear_week' }, { status: 400 });
            }
            await db.query(`
                DELETE FROM user_schedules
                WHERE organization_id = $1 AND date >= $2 AND date <= $3
            `, [organizationId, startDate, endDate]);

        } else if (action === 'clear_after_today') {
            // Get today's date in YYYY-MM-DD
            const today = new Date().toISOString().split('T')[0];
            await db.query(`
                DELETE FROM user_schedules
                WHERE organization_id = $1 AND date >= $2
            `, [organizationId, today]);

        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in bulk schedule operation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
