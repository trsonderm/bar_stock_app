import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const unmappedOnly = searchParams.get('unmapped') === 'true';

        // All existing mappings with inventory item name
        const mappings = await db.query(
            `SELECT m.*, i.name as inventory_item_name, i.type as inventory_item_type
             FROM pos_item_mappings m
             LEFT JOIN items i ON m.inventory_item_id = i.id
             WHERE m.organization_id = $1
             ORDER BY m.pos_item_name ASC`,
            [session.organizationId]
        );

        // POS items that have appeared in transactions (aggregated)
        const posItems = await db.query(
            `SELECT ti.pos_item_name, ti.pos_item_id,
                    MIN(t.pos_type) as pos_type,
                    SUM(ti.quantity)::numeric as total_quantity,
                    COUNT(DISTINCT t.id)::int as transaction_count,
                    MAX(t.transaction_at) as last_seen
             FROM pos_transaction_items ti
             JOIN pos_transactions t ON ti.transaction_id = t.id
             WHERE ti.organization_id = $1
             GROUP BY ti.pos_item_name, ti.pos_item_id
             ORDER BY total_quantity DESC`,
            [session.organizationId]
        );

        const mappedNames = new Set(mappings.map((m: any) => m.pos_item_name));
        const unmapped = posItems.filter((p: any) => !mappedNames.has(p.pos_item_name));

        if (unmappedOnly) {
            return NextResponse.json({ items: unmapped });
        }

        return NextResponse.json({ mappings, unmapped, posItems });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { pos_type, pos_item_id, pos_item_name, inventory_item_id, oz_per_serving, servings_per_item, notes } = await req.json();

        if (!pos_item_name) return NextResponse.json({ error: 'pos_item_name required' }, { status: 400 });

        await db.execute(
            `INSERT INTO pos_item_mappings
                (organization_id, pos_type, pos_item_id, pos_item_name, inventory_item_id, oz_per_serving, servings_per_item, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (organization_id, pos_type, pos_item_name) DO UPDATE SET
                pos_item_id       = EXCLUDED.pos_item_id,
                inventory_item_id = EXCLUDED.inventory_item_id,
                oz_per_serving    = EXCLUDED.oz_per_serving,
                servings_per_item = EXCLUDED.servings_per_item,
                notes             = EXCLUDED.notes,
                updated_at        = NOW()`,
            [
                session.organizationId,
                pos_type || 'toast',
                pos_item_id || null,
                pos_item_name,
                inventory_item_id || null,
                oz_per_serving ?? 1.5,
                servings_per_item ?? 1,
                notes || null,
            ]
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Error saving mapping' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await req.json();
        await db.execute(
            `DELETE FROM pos_item_mappings WHERE id = $1 AND organization_id = $2`,
            [id, session.organizationId]
        );
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Error deleting mapping' }, { status: 500 });
    }
}
