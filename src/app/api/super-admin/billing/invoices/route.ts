import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureBillingTables } from '@/lib/stripe';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await ensureBillingTables();

    const { searchParams } = req.nextUrl;
    const orgId = searchParams.get('orgId');
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (orgId) { conditions.push(`i.organization_id=$${pIdx++}`); params.push(parseInt(orgId)); }
    if (status) { conditions.push(`i.status=$${pIdx++}`); params.push(status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows, countRow] = await Promise.all([
        db.query(`
            SELECT i.*, o.name AS org_name
            FROM invoices i
            JOIN organizations o ON i.organization_id = o.id
            ${where}
            ORDER BY i.created_at DESC
            LIMIT $${pIdx} OFFSET $${pIdx + 1}
        `, [...params, limit, offset]),
        db.one(`SELECT COUNT(*) AS total FROM invoices i ${where}`, params),
    ]);

    return NextResponse.json({ invoices: rows, total: parseInt(countRow?.total || '0'), page, limit });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await ensureBillingTables();

    const { organization_id, amount, due_date, notes, status = 'PENDING', period_start, period_end } = await req.json();
    if (!organization_id || !amount) {
        return NextResponse.json({ error: 'organization_id and amount required' }, { status: 400 });
    }

    const row = await db.one(
        `INSERT INTO invoices (organization_id, amount, status, due_date, notes, period_start, period_end, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING *`,
        [organization_id, parseFloat(amount), status, due_date || null, notes || null, period_start || null, period_end || null]
    );

    return NextResponse.json({ invoice: row }, { status: 201 });
}
