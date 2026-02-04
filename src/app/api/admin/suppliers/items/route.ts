import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET all items with their supplier info for the current org
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Fetch items joined with item_suppliers and suppliers
        const items = await db.query(`
            SELECT 
                i.id as item_id, 
                i.name as item_name,
                s.id as supplier_id,
                s.name as supplier_name,
                is_sup.cost_per_unit,
                is_sup.is_preferred,
                is_sup.supplier_sku
            FROM items i
            LEFT JOIN item_suppliers is_sup ON i.id = is_sup.item_id
            LEFT JOIN suppliers s ON is_sup.supplier_id = s.id
            WHERE i.Organization_id IS NULL OR i.organization_id = $1
            ORDER BY i.name ASC
        `, [session.organizationId]);

        // Group by item
        const result: Record<number, any> = {};
        for (const row of items) {
            if (!result[row.item_id]) {
                result[row.item_id] = {
                    id: row.item_id,
                    name: row.item_name,
                    suppliers: []
                };
            }
            if (row.supplier_id) {
                result[row.item_id].suppliers.push({
                    id: row.supplier_id,
                    name: row.supplier_name,
                    cost: row.cost_per_unit,
                    is_preferred: row.is_preferred,
                    sku: row.supplier_sku
                });
            }
        }

        return NextResponse.json({ items: Object.values(result) });
    } catch (e) {
        console.error('Get Item Suppliers Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { item_id, supplier_id, cost, supplier_sku, is_preferred } = await req.json();

        if (!item_id || !supplier_id) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        await db.execute('BEGIN');

        // If preferred, unset others for this item (logic: only one preferred?)
        // Let's assume we can have multiple but usually one is primary. 
        // For simplicity, if this is set to preferred, we could uncheck others, but let's leave flexible for now.

        await db.execute(`
            INSERT INTO item_suppliers (item_id, supplier_id, cost_per_unit, supplier_sku, is_preferred)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (item_id, supplier_id) 
            DO UPDATE SET 
                cost_per_unit = EXCLUDED.cost_per_unit,
                supplier_sku = EXCLUDED.supplier_sku,
                is_preferred = EXCLUDED.is_preferred
        `, [item_id, supplier_id, cost || 0, supplier_sku || null, is_preferred || false]);

        await db.execute('COMMIT');
        return NextResponse.json({ success: true });
    } catch (e) {
        await db.execute('ROLLBACK');
        console.error('Link Supplier Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { item_id, supplier_id } = await req.json();
        await db.execute('DELETE FROM item_suppliers WHERE item_id = $1 AND supplier_id = $2', [item_id, supplier_id]);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
