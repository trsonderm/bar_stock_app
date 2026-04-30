import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const q = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q) {
        conditions.push(`name ILIKE $${idx++}`);
        params.push(`%${q}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRow] = await Promise.all([
        db.query(`SELECT * FROM global_products ${where} ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
            [...params, limit, offset]),
        db.one(`SELECT COUNT(*) AS total FROM global_products ${where}`, params),
    ]);

    return NextResponse.json({ rows, total: parseInt(countRow?.total || '0') });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'import_from_org') {
        const { orgId } = body;
        if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

        const items = await db.query(`
            SELECT i.name, i.type AS category_name, i.order_size,
                   COALESCE(
                     (SELECT jsonb_agg(DISTINCT b.barcode)
                      FROM jsonb_array_elements_text(
                        CASE WHEN i.order_size IS NOT NULL THEN i.order_size ELSE '[]'::jsonb END
                      ) AS b(barcode)
                      WHERE b.barcode ~ '^[0-9]{8,14}$'
                     ), '[]'::jsonb
                   ) AS barcodes
            FROM items i
            WHERE i.organization_id = $1
        `, [parseInt(orgId)]);

        let inserted = 0;
        for (const item of items) {
            if (!item.name?.trim()) continue;
            await db.execute(`
                INSERT INTO global_products (name, category_name, order_size, barcodes)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (name) DO UPDATE SET
                    category_name = EXCLUDED.category_name,
                    order_size = EXCLUDED.order_size,
                    barcodes = CASE
                        WHEN EXCLUDED.barcodes = '[]'::jsonb THEN global_products.barcodes
                        ELSE EXCLUDED.barcodes
                    END
            `, [item.name.trim(), item.category_name, item.order_size ?? '[{"label":"Unit","amount":1}]', item.barcodes ?? '[]']);
            inserted++;
        }

        return NextResponse.json({ inserted });
    }

    if (action === 'upsert') {
        const { name, category_name, order_size, barcodes } = body;
        if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });
        const row = await db.one(`
            INSERT INTO global_products (name, category_name, order_size, barcodes)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (name) DO UPDATE SET
                category_name = EXCLUDED.category_name,
                order_size = EXCLUDED.order_size,
                barcodes = EXCLUDED.barcodes
            RETURNING *
        `, [name.trim(), category_name ?? null, JSON.stringify(order_size ?? [{ label: 'Unit', amount: 1 }]), JSON.stringify(barcodes ?? [])]);
        return NextResponse.json({ row });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.execute('DELETE FROM global_products WHERE id = $1', [parseInt(id)]);
    return NextResponse.json({ ok: true });
}
