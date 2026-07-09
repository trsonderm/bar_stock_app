import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';

async function ensureGlobalProductColumns() {
    await db.execute(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS bottle_size_amount NUMERIC(10,2)`).catch(() => {});
    await db.execute(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS bottle_size_unit TEXT`).catch(() => {});
    await db.execute(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]'`).catch(() => {});
    await db.execute(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS is_alcohol BOOLEAN DEFAULT TRUE`).catch(() => {});
    await db.execute(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {});
    await db.execute(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS updated_by INTEGER`).catch(() => {});
    await db.execute(`
        CREATE TABLE IF NOT EXISTS item_global_links (
            id SERIAL PRIMARY KEY,
            item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            global_product_id INTEGER NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            linked_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(item_id)
        )
    `).catch(() => {});
    await db.execute(`
        CREATE TABLE IF NOT EXISTS global_product_notifications (
            id SERIAL PRIMARY KEY,
            global_product_id INTEGER NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
            changes JSONB NOT NULL,
            notification_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            resolved_at TIMESTAMPTZ,
            UNIQUE(global_product_id, organization_id, notification_key)
        )
    `).catch(() => {});
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    await ensureGlobalProductColumns();

    const { searchParams } = req.nextUrl;
    const q = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q) {
        conditions.push(`(name ILIKE $${idx} OR aliases::text ILIKE $${idx})`);
        params.push(`%${q}%`);
        idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRow] = await Promise.all([
        db.query(
            `SELECT gp.*,
                (SELECT COUNT(*) FROM item_global_links igl WHERE igl.global_product_id = gp.id) AS linked_count
             FROM global_products gp ${where} ORDER BY gp.name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
            [...params, limit, offset]
        ),
        db.one(`SELECT COUNT(*) AS total FROM global_products ${where}`, params),
    ]);

    return NextResponse.json({ rows, total: parseInt(countRow?.total || '0') });
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    await ensureGlobalProductColumns();

    const body = await req.json();
    const { id, name, category_name, order_size, barcodes, bottle_size_amount, bottle_size_unit, aliases, is_alcohol } = body;
    if (!id || !name) return NextResponse.json({ error: 'Missing id or name' }, { status: 400 });

    const existing = await db.one('SELECT * FROM global_products WHERE id = $1', [id]);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const newOrderSize = order_size ?? existing.order_size;
    const newBarcodes = barcodes ?? existing.barcodes;
    const newAliases = aliases ?? existing.aliases ?? [];
    const newIsAlcohol = is_alcohol !== undefined ? is_alcohol : (existing.is_alcohol !== false);
    const newBottleAmount = bottle_size_amount !== undefined ? bottle_size_amount : existing.bottle_size_amount;
    const newBottleUnit = bottle_size_unit !== undefined ? bottle_size_unit : existing.bottle_size_unit;

    // Compute diff for notifications
    const changes: Record<string, { from: any; to: any }> = {};
    const compareJSON = (a: any, b: any) => JSON.stringify(a) !== JSON.stringify(b);

    if (existing.name !== name) changes.name = { from: existing.name, to: name };
    if (existing.category_name !== category_name) changes.category_name = { from: existing.category_name, to: category_name };
    if (compareJSON(existing.bottle_size_amount, newBottleAmount)) changes.bottle_size_amount = { from: existing.bottle_size_amount, to: newBottleAmount };
    if (existing.bottle_size_unit !== newBottleUnit) changes.bottle_size_unit = { from: existing.bottle_size_unit, to: newBottleUnit };
    if (compareJSON(existing.order_size, newOrderSize)) changes.order_size = { from: existing.order_size, to: newOrderSize };
    if (compareJSON(existing.aliases ?? [], newAliases)) changes.aliases = { from: existing.aliases ?? [], to: newAliases };
    if (existing.is_alcohol !== newIsAlcohol) changes.is_alcohol = { from: existing.is_alcohol, to: newIsAlcohol };
    if (compareJSON(existing.barcodes ?? [], newBarcodes)) changes.barcodes = { from: existing.barcodes ?? [], to: newBarcodes };

    const notificationKey = new Date().toISOString();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE global_products SET
                name = $1, category_name = $2, order_size = $3, barcodes = $4,
                bottle_size_amount = $5, bottle_size_unit = $6, aliases = $7,
                is_alcohol = $8, updated_at = NOW(), updated_by = $9
             WHERE id = $10`,
            [name.trim(), category_name ?? null,
             JSON.stringify(newOrderSize), JSON.stringify(newBarcodes),
             newBottleAmount ?? null, newBottleUnit ?? null,
             JSON.stringify(newAliases), newIsAlcohol,
             session.id, id]
        );

        // Only create notifications if something actually changed
        if (Object.keys(changes).length > 0) {
            const links = await client.query(
                'SELECT item_id, organization_id FROM item_global_links WHERE global_product_id = $1',
                [id]
            );
            for (const link of links.rows) {
                await client.query(
                    `INSERT INTO global_product_notifications
                        (global_product_id, organization_id, item_id, changes, notification_key, status)
                     VALUES ($1, $2, $3, $4, $5, 'pending')
                     ON CONFLICT (global_product_id, organization_id, notification_key) DO NOTHING`,
                    [id, link.organization_id, link.item_id, JSON.stringify(changes), notificationKey]
                );
            }
        }

        await client.query('COMMIT');
        return NextResponse.json({ ok: true, notified: Object.keys(changes).length > 0 });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    await ensureGlobalProductColumns();

    const body = await req.json();
    const { action } = body;

    if (action === 'import_from_org') {
        const { orgId } = body;
        if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

        const items = await db.query(`
            SELECT i.name, i.type AS category_name, i.order_size, i.bottle_size_amount, i.bottle_size_unit,
                   COALESCE(i.aliases, '[]'::jsonb) AS aliases,
                   COALESCE(i.is_alcohol, true) AS is_alcohol,
                   COALESCE(
                     (SELECT jsonb_agg(DISTINCT b.barcode)
                      FROM jsonb_array_elements_text(
                        CASE WHEN i.barcodes IS NOT NULL THEN i.barcodes ELSE '[]'::jsonb END
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
                INSERT INTO global_products (name, category_name, order_size, barcodes, bottle_size_amount, bottle_size_unit, aliases, is_alcohol)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (name) DO UPDATE SET
                    category_name = EXCLUDED.category_name,
                    order_size = EXCLUDED.order_size,
                    barcodes = CASE
                        WHEN EXCLUDED.barcodes = '[]'::jsonb THEN global_products.barcodes
                        ELSE EXCLUDED.barcodes
                    END,
                    bottle_size_amount = COALESCE(EXCLUDED.bottle_size_amount, global_products.bottle_size_amount),
                    bottle_size_unit = COALESCE(EXCLUDED.bottle_size_unit, global_products.bottle_size_unit),
                    aliases = COALESCE(EXCLUDED.aliases, global_products.aliases),
                    is_alcohol = EXCLUDED.is_alcohol
            `, [item.name.trim(), item.category_name,
                item.order_size ?? '[{"label":"Unit","amount":1}]', item.barcodes ?? '[]',
                item.bottle_size_amount ?? null, item.bottle_size_unit ?? null,
                item.aliases ?? '[]', item.is_alcohol !== false]);
            inserted++;
        }

        return NextResponse.json({ inserted });
    }

    if (action === 'add') {
        const { name, category_name, order_size, barcodes, bottle_size_amount, bottle_size_unit, aliases, is_alcohol } = body;
        if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });
        const row = await db.one(`
            INSERT INTO global_products (name, category_name, order_size, barcodes, bottle_size_amount, bottle_size_unit, aliases, is_alcohol, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (name) DO UPDATE SET
                category_name = EXCLUDED.category_name,
                order_size = EXCLUDED.order_size,
                barcodes = EXCLUDED.barcodes,
                bottle_size_amount = EXCLUDED.bottle_size_amount,
                bottle_size_unit = EXCLUDED.bottle_size_unit,
                aliases = EXCLUDED.aliases,
                is_alcohol = EXCLUDED.is_alcohol,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            RETURNING *
        `, [name.trim(), category_name ?? null,
            JSON.stringify(order_size ?? [{ label: 'Unit', amount: 1 }]),
            JSON.stringify(barcodes ?? []),
            bottle_size_amount ?? null, bottle_size_unit ?? null,
            JSON.stringify(aliases ?? []), is_alcohol !== false, session.id]);
        return NextResponse.json({ row });
    }

    // legacy upsert action
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
