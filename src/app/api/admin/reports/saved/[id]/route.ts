import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const isPro = session.subscriptionPlan === 'pro' || session.subscriptionPlan === 'free_trial' || session.isSuperAdmin;
    if (!isPro) return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });

    const reportId = parseInt(params.id);
    try {
        const report = await db.one(
            'SELECT * FROM saved_reports WHERE id = $1 AND organization_id = $2',
            [reportId, session.organizationId]
        );
        if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ report });
    } catch (e) {
        console.error('Saved report GET error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const isPro = session.subscriptionPlan === 'pro' || session.subscriptionPlan === 'free_trial' || session.isSuperAdmin;
    if (!isPro) {
        return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
    }

    const reportId = parseInt(params.id);
    const { name, description, config, is_scheduled, schedule_config } = await req.json();

    try {
        await db.execute(`
            UPDATE saved_reports
            SET name = $1, description = $2, config = $3, is_scheduled = $4,
                schedule_config = $5, updated_at = NOW()
            WHERE id = $6 AND organization_id = $7
        `, [
            name,
            description || null,
            JSON.stringify(config),
            is_scheduled || false,
            schedule_config ? JSON.stringify(schedule_config) : null,
            reportId,
            session.organizationId
        ]);

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Saved report PUT error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reportId = parseInt(params.id);
    try {
        await db.execute('DELETE FROM saved_reports WHERE id = $1 AND organization_id = $2', [reportId, session.organizationId]);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
