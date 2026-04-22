import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const row = await db.one(
        `SELECT value FROM settings WHERE organization_id = $1 AND key = 'shift_calculator_template'`,
        [session.organizationId]
    );

    const template = row?.value ? JSON.parse(row.value) : null;
    return NextResponse.json({ template });
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { template } = await req.json();

    await db.execute(
        `INSERT INTO settings (organization_id, key, value)
         VALUES ($1, 'shift_calculator_template', $2)
         ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
        [session.organizationId, JSON.stringify(template)]
    );

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await db.execute(
        `DELETE FROM settings WHERE organization_id = $1 AND key = 'shift_calculator_template'`,
        [session.organizationId]
    );

    return NextResponse.json({ success: true });
}
