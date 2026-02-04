
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const reportId = searchParams.get('reportId');
        const organizationId = session.organizationId;

        if (!reportId) return NextResponse.json({ error: 'Missing reportId' }, { status: 400 });

        const rows = await db.query(
            'SELECT * FROM report_schedules WHERE report_id = $1 AND organization_id = $2',
            [reportId, organizationId]
        );
        const schedule = rows[0] || null;
        return NextResponse.json({ schedule });
    } catch (error) {
        console.error('Error fetching schedule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { reportId, frequency, recipients, active } = body;
        const organizationId = session.organizationId;

        // Check if exists
        const rows = await db.query(
            'SELECT id FROM report_schedules WHERE report_id = $1 AND organization_id = $2',
            [reportId, organizationId]
        );
        const existing = rows[0] || null;

        let nextRun = new Date();
        nextRun.setHours(8, 0, 0, 0); // Default 8am
        if (frequency === 'daily') nextRun.setDate(nextRun.getDate() + 1);
        if (frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
        if (frequency === 'monthly') {
            nextRun.setMonth(nextRun.getMonth() + 1);
            nextRun.setDate(1); // 1st of next month
        }

        if (existing) {
            await db.query(
                'UPDATE report_schedules SET frequency = $1, recipients = $2, active = $3, next_run_at = $4 WHERE id = $5',
                [frequency, recipients, active, nextRun, existing.id]
            );
        } else {
            await db.query(
                'INSERT INTO report_schedules (report_id, organization_id, frequency, recipients, next_run_at, active) VALUES ($1, $2, $3, $4, $5, $6)',
                [reportId, organizationId, frequency, recipients, nextRun, active]
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving schedule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
