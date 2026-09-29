/**
 * POST /api/admin/products/bulk
 *
 * Admin-only bulk edit of several items at once.
 * Body: { item_ids: number[], updates: { type?, secondary_type?, supplier_id?,
 *         global_supplier?, assigned_locations? } }
 *
 * `assigned_locations` replaces the set of locations each item is stocked at;
 * removing a location deletes that location's stock row, exactly like the
 * single-item edit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { item_ids, updates } = body as {
        item_ids: number[];
        updates: {
            type?: string;
            secondary_type?: string;
            supplier_id?: number | null;
            global_supplier?: string | null;
            assigned_locations?: number[];
        };
    };

    if (!item_ids?.length) {
        return NextResponse.json({ error: 'No items selected' }, { status: 400 });
    }

    // Verify all items belong to this org
    const owned = await db.query(
        `SELECT id FROM items WHERE id = ANY($1::int[]) AND organization_id = $2`,
        [item_ids, session.organizationId]
    );
    if (owned.length !== item_ids.length) {
        return NextResponse.json({ error: 'Some items not found' }, { status: 404 });
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.type !== undefined) {
        setClauses.push(`type = $${pIdx++}`);
        params.push(updates.type);
    }
    if (updates.secondary_type !== undefined) {
        setClauses.push(`secondary_type = $${pIdx++}`);
        params.push(updates.secondary_type || null);
    }
    if ('supplier_id' in updates) {
        setClauses.push(`supplier_id = $${pIdx++}`);
        params.push(updates.supplier_id ?? null);
    }
    if ('global_supplier' in updates) {
        setClauses.push(`supplier = $${pIdx++}`);
        params.push(updates.global_supplier || null);
    }

    if (setClauses.length === 0 && !('assigned_locations' in updates)) {
        return NextResponse.json({ error: 'No updates specified' }, { status: 400 });
    }

    // Location assignments are represented by `inventory` rows (one per item per
    // location), matching the single-item edit in PUT /api/inventory.
    let assignedLocationIds: number[] | null = null;
    if (Array.isArray(updates.assigned_locations) && updates.assigned_locations.length > 0) {
        const requested = updates.assigned_locations.map(Number);
        const valid = await db.query(
            'SELECT id FROM locations WHERE id = ANY($1::int[]) AND organization_id = $2',
            [requested, session.organizationId]
        );
        if (valid.length !== new Set(requested).size) {
            return NextResponse.json({ error: 'Some locations not found' }, { status: 404 });
        }
        assignedLocationIds = valid.map((l: any) => Number(l.id));
    }

    await db.transaction(async (tx) => {
        if (setClauses.length > 0) {
            params.push(item_ids, session.organizationId);
            await tx.execute(
                `UPDATE items SET ${setClauses.join(', ')} WHERE id = ANY($${pIdx}::int[]) AND organization_id = $${pIdx + 1}`,
                params
            );
        }

        if (assignedLocationIds) {
            // Add a zero-stock row at each newly assigned location...
            await tx.execute(
                `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                 SELECT i, l, 0, $3 FROM unnest($1::int[]) AS i CROSS JOIN unnest($2::int[]) AS l
                 ON CONFLICT (item_id, location_id) DO NOTHING`,
                [item_ids, assignedLocationIds, session.organizationId]
            );
            // ...and remove the item from locations no longer assigned.
            await tx.execute(
                `DELETE FROM inventory
                 WHERE item_id = ANY($1::int[]) AND organization_id = $2 AND NOT (location_id = ANY($3::int[]))`,
                [item_ids, session.organizationId, assignedLocationIds]
            );
        }
    });

    return NextResponse.json({ success: true, updated: item_ids.length });
}
