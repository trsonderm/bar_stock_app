import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { status, notes, paid_at } = await req.json();
    const id = parseInt(params.id);

    const updates: string[] = ['updated_at=NOW()'];
    const values: any[] = [];
    let idx = 1;

    if (status) { updates.push(`status=$${idx++}`); values.push(status); }
    if (notes !== undefined) { updates.push(`notes=$${idx++}`); values.push(notes); }
    if (paid_at || status === 'PAID') {
        updates.push(`paid_at=$${idx++}`);
        values.push(paid_at || new Date().toISOString());
    }

    values.push(id);
    const row = await db.one(
        `UPDATE invoices SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
    );

    return NextResponse.json({ invoice: row });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const id = parseInt(params.id);
    await db.execute(`UPDATE invoices SET status='VOIDED', updated_at=NOW() WHERE id=$1`, [id]);
    return NextResponse.json({ voided: true });
}
