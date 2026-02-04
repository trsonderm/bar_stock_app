import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const signatures = await db.query(`
            SELECT id, label, data, is_active, created_at 
            FROM signatures 
            WHERE organization_id = $1 
            ORDER BY created_at DESC
        `, [session.organizationId]);

        return NextResponse.json({ signatures });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { label, data_url } = await req.json();

        if (!data_url) return NextResponse.json({ error: 'No data provided' }, { status: 400 });

        // Insert new signature
        const res = await db.query(`
            INSERT INTO signatures (organization_id, user_id, label, data, is_active)
            VALUES ($1, $2, $3, $4, false)
            RETURNING id, label, is_active
        `, [session.organizationId, session.id, label || 'Signature', data_url]);

        return NextResponse.json({ signature: res[0] });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { id } = await req.json();

        // 1. Deactivate all others
        await db.query(`UPDATE signatures SET is_active = false WHERE organization_id = $1`, [session.organizationId]);

        // 2. Activate target
        await db.query(`UPDATE signatures SET is_active = true WHERE id = $1 AND organization_id = $2`, [id, session.organizationId]);

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
