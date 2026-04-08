import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET all saved reports for org
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.subscriptionPlan !== 'pro' && !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
    }

    try {
        const reports = await db.query(`
            SELECT sr.*, u.first_name || ' ' || u.last_name AS created_by_name
            FROM saved_reports sr
            LEFT JOIN users u ON sr.created_by = u.id
            WHERE sr.organization_id = $1
            ORDER BY sr.updated_at DESC
        `, [session.organizationId]);

        return NextResponse.json({ reports: reports || [] });
    } catch (e) {
        console.error('Saved reports GET error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// POST create a new saved report
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.subscriptionPlan !== 'pro' && !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
    }
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    try {
        const { name, description, config, is_scheduled, schedule_config } = await req.json();
        if (!name || !config) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

        const result = await db.query(`
            INSERT INTO saved_reports (organization_id, name, description, config, is_scheduled, schedule_config, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [
            session.organizationId,
            name,
            description || null,
            JSON.stringify(config),
            is_scheduled || false,
            schedule_config ? JSON.stringify(schedule_config) : null,
            session.id
        ]);

        return NextResponse.json({ success: true, id: result[0]?.id });
    } catch (e) {
        console.error('Saved report POST error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
