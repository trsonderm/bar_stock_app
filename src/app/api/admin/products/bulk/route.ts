import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        let body: any;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const item_ids: number[] = Array.isArray(body?.item_ids) ? body.item_ids.map(Number).filter((n: number) => !isNaN(n)) : [];
        const updates: Record<string, any> = (body?.updates && typeof body.updates === 'object') ? body.updates : {};

        if (item_ids.length === 0) {
            return NextResponse.json({ error: 'No items selected' }, { status: 400 });
        }

        const orgId: number = Number(session.organizationId);

        // Verify all items belong to this org
        const owned = await db.query(
            `SELECT id FROM items WHERE id = ANY($1::int[]) AND organization_id = $2`,
            [item_ids, orgId]
        );
        if (owned.length !== item_ids.length) {
            return NextResponse.json({ error: `${owned.length}/${item_ids.length} items found — some may not belong to this org` }, { status: 404 });
        }

        // Ensure unique indexes exist so ON CONFLICT clauses work on restored databases
        await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS item_suppliers_item_supplier_uniq ON item_suppliers(item_id, supplier_id)`).catch(() => {});
        await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS inventory_item_location_uniq ON inventory(item_id, location_id)`).catch(() => {});

        const hasLocationUpdate = 'assigned_locations' in updates && Array.isArray(updates.assigned_locations);
        const hasSupplierUpdate = 'supplier_id' in updates;
        const newSupplierId = hasSupplierUpdate
            ? (updates.supplier_id != null ? parseInt(String(updates.supplier_id), 10) : null)
            : undefined;
        const validSupplierId = newSupplierId != null && !isNaN(newSupplierId) ? newSupplierId : null;

        if (!hasLocationUpdate && !hasSupplierUpdate && !('type' in updates) && !('secondary_type' in updates) && !('global_supplier' in updates)) {
            return NextResponse.json({ error: 'No updates specified' }, { status: 400 });
        }

        // Look up supplier name so items.supplier text stays in sync with item_suppliers
        let supplierName: string | null = null;
        if (hasSupplierUpdate && validSupplierId) {
            const row = await db.one(`SELECT name FROM suppliers WHERE id = $1 AND organization_id = $2`, [validSupplierId, orgId]);
            supplierName = row?.name ?? null;
        }

        const setClauses: string[] = [];
        const params: any[] = [];
        let pIdx = 1;

        if ('type' in updates && updates.type !== undefined) {
            setClauses.push(`type = $${pIdx++}`);
            params.push(String(updates.type));
        }
        if ('secondary_type' in updates) {
            setClauses.push(`secondary_type = $${pIdx++}`);
            params.push(updates.secondary_type != null ? String(updates.secondary_type) : null);
        }
        if ('global_supplier' in updates) {
            setClauses.push(`supplier = $${pIdx++}`);
            params.push(updates.global_supplier != null ? String(updates.global_supplier) : null);
        } else if (hasSupplierUpdate) {
            // Keep items.supplier text in sync with the linked supplier
            setClauses.push(`supplier = $${pIdx++}`);
            params.push(supplierName);
        }

        if (setClauses.length > 0) {
            params.push(item_ids, orgId);
            await db.execute(
                `UPDATE items SET ${setClauses.join(', ')} WHERE id = ANY($${pIdx}::int[]) AND organization_id = $${pIdx + 1}`,
                params
            );
        }

        // Supplier relationship lives in item_suppliers, not as a column on items
        if (hasSupplierUpdate) {
            try {
                await db.execute(
                    `UPDATE item_suppliers SET is_preferred = false WHERE item_id = ANY($1::int[])`,
                    [item_ids]
                );
                if (validSupplierId) {
                    for (const itemId of item_ids) {
                        await db.execute(
                            `INSERT INTO item_suppliers (item_id, supplier_id, is_preferred)
                             VALUES ($1, $2, true)
                             ON CONFLICT (item_id, supplier_id) DO UPDATE SET is_preferred = true`,
                            [itemId, validSupplierId]
                        );
                    }
                }
            } catch (e: any) {
                console.warn('[bulk] item_suppliers update failed:', e.message);
            }
        }

        if (hasLocationUpdate) {
            const locIds: number[] = (updates.assigned_locations as any[]).map(Number).filter((n: number) => !isNaN(n));

            // Get all location IDs for this org so we only touch what we own
            const orgLocs = await db.query(`SELECT id FROM locations WHERE organization_id = $1`, [orgId]);
            const orgLocIds: number[] = orgLocs.map((r: any) => r.id);

            if (orgLocIds.length > 0) {
                // Remove location rows that are no longer assigned
                const locsToRemove = orgLocIds.filter(id => !locIds.includes(id));
                if (locsToRemove.length > 0) {
                    await db.execute(
                        `DELETE FROM inventory WHERE item_id = ANY($1::int[]) AND location_id = ANY($2::int[]) AND organization_id = $3`,
                        [item_ids, locsToRemove, orgId]
                    );
                }

                if (locIds.length > 0) {
                    const placeholders: string[] = [];
                    const insParams: any[] = [];
                    let insIdx = 1;
                    for (const itemId of item_ids) {
                        for (const locId of locIds) {
                            placeholders.push(`($${insIdx++}, $${insIdx++}, 0, $${insIdx++})`);
                            insParams.push(itemId, locId, orgId);
                        }
                    }
                    await db.execute(
                        `INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES ${placeholders.join(', ')} ON CONFLICT (item_id, location_id) DO NOTHING`,
                        insParams
                    );
                }
            }
        }

        return NextResponse.json({ success: true, updated: item_ids.length });
    } catch (err: any) {
        console.error('Bulk update error:', err);
        return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
    }
}
