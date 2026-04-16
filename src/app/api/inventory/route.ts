import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logActivity } from '@/lib/logger';
import { checkAndTriggerSmartOrder } from '@/lib/smart-order';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }
        const sort = searchParams.get('sort') || 'usage';

        // Determine Location Context — explicit param wins over cookie
        const locParam = searchParams.get('locationId');
        const cookieLoc = req.cookies.get('current_location_id')?.value;
        let locationId = locParam ? parseInt(locParam) : (cookieLoc ? parseInt(cookieLoc) : null);

        // Validate location belongs to org
        if (locationId) {
            const validLoc = await db.one('SELECT id FROM locations WHERE id = $1 AND organization_id = $2', [locationId, organizationId]);
            if (!validLoc) locationId = null;
        }

        if (!locationId) {
            const defaultLoc = await db.one('SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [organizationId]);
            locationId = defaultLoc ? defaultLoc.id : 0;
        }

        // Refactored Query for Multi-tenancy
        // Usage of $1 for organizationId (reused) and $2 for LocationId
        let query = `
      SELECT
        i.id, i.name, i.type, i.secondary_type, i.unit_cost, i.sale_price, i.supplier,
        i.order_size, i.low_stock_threshold,
        COALESCE(i.barcodes, '[]'::jsonb) as barcodes,
        COALESCE(i.stock_options, '[]') as stock_options,
        COALESCE(i.include_in_audit, true) as include_in_audit,
        COALESCE(i.include_in_low_stock_alerts, true) as include_in_low_stock_alerts,
        COALESCE(i.stock_unit_label, 'unit') as stock_unit_label,
        COALESCE(i.stock_unit_size, 1) as stock_unit_size,
        COALESCE(i.order_unit_label, 'case') as order_unit_label,
        COALESCE(i.order_unit_size, 1) as order_unit_size,
        COALESCE(i.use_category_qty_defaults, true) as use_category_qty_defaults,
        MAX(isp.supplier_id) as supplier_id,
        (SELECT ils.supplier_id FROM item_location_suppliers ils WHERE ils.item_id = i.id AND ils.location_id = $2 LIMIT 1) as location_supplier_id,
        COALESCE(SUM(inv.quantity), 0) as quantity,
        COALESCE(MAX(usage_stats.usage_count), 0) as usage_count,
        (SELECT json_agg(location_id) FROM inventory WHERE item_id = i.id) as assigned_locations,
        (SELECT ilp.sale_price FROM item_location_prices ilp WHERE ilp.item_id = i.id AND ilp.location_id = $2 LIMIT 1) as location_sale_price
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2
      LEFT JOIN item_suppliers isp ON i.id = isp.item_id AND isp.is_preferred = true
      LEFT JOIN (
        SELECT
            (details->>'itemId')::int as item_id,
            COUNT(*) as usage_count
        FROM activity_logs
        WHERE action = 'SUBTRACT_STOCK' AND organization_id = $1
        GROUP BY (details->>'itemId')::int
      ) usage_stats ON i.id = usage_stats.item_id
      WHERE i.organization_id = $1
      GROUP BY i.id, usage_stats.usage_count
    `;

        if (sort === 'usage') {
            query += ` ORDER BY usage_count DESC, i.name ASC`;
        } else {
            query += ` ORDER BY i.name ASC`;
        }

        let items: any[];
        try {
            items = await db.query(query, [organizationId, locationId]);
        } catch (e: any) {
            // If new columns/tables don't exist yet (pre-migration), fall back to a simpler query
            console.warn('[Inventory GET] Full query failed, falling back:', e.message);
            const fallbackQuery = `
              SELECT
                i.id, i.name, i.type, i.secondary_type, i.unit_cost, i.sale_price, i.supplier,
                i.order_size, i.low_stock_threshold,
                '[]'::jsonb as barcodes,
                COALESCE(i.stock_options, '[]') as stock_options,
                COALESCE(i.include_in_audit, true) as include_in_audit,
                true as include_in_low_stock_alerts,
                COALESCE(i.stock_unit_label, 'unit') as stock_unit_label,
                COALESCE(i.stock_unit_size, 1) as stock_unit_size,
                COALESCE(i.order_unit_label, 'case') as order_unit_label,
                COALESCE(i.order_unit_size, 1) as order_unit_size,
                COALESCE(i.use_category_qty_defaults, true) as use_category_qty_defaults,
                MAX(isp.supplier_id) as supplier_id,
                NULL::int as location_supplier_id,
                COALESCE(SUM(inv.quantity), 0) as quantity,
                COALESCE(MAX(usage_stats.usage_count), 0) as usage_count,
                (SELECT json_agg(location_id) FROM inventory WHERE item_id = i.id) as assigned_locations,
                NULL::numeric as location_sale_price
              FROM items i
              LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2
              LEFT JOIN item_suppliers isp ON i.id = isp.item_id AND isp.is_preferred = true
              LEFT JOIN (
                SELECT (details->>'itemId')::int as item_id, COUNT(*) as usage_count
                FROM activity_logs WHERE action = 'SUBTRACT_STOCK' AND organization_id = $1
                GROUP BY (details->>'itemId')::int
              ) usage_stats ON i.id = usage_stats.item_id
              WHERE i.organization_id = $1
              GROUP BY i.id, usage_stats.usage_count
              ${sort === 'usage' ? 'ORDER BY usage_count DESC, i.name ASC' : 'ORDER BY i.name ASC'}
            `;
            items = await db.query(fallbackQuery, [organizationId, locationId]);
        }

        return NextResponse.json({ items });

    } catch (error) {
        console.error('Inventory GET error', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }
        const canAddName = session.role === 'admin' || session.permissions.includes('add_item_name') || session.permissions.includes('manage_products') || session.permissions.includes('all');

        if (!canAddName) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await req.json();
        const { name, type, secondary_type, supplier, supplier_id, low_stock_threshold, order_size, stock_options, include_in_audit, quantity, unit_cost, assignedLocations, add_to_all_locations, barcodes } = body;

        if (!name || !type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        // Check for duplicate IN THIS ORG (use query not one — one throws on no result)
        const existingRows = await db.query('SELECT id FROM items WHERE name = $1 AND organization_id = $2 LIMIT 1', [name, organizationId]);
        if (existingRows.length > 0) {
            return NextResponse.json({ error: 'Item already exists' }, { status: 400 });
        }

        // Insert and Return ID
        const res = await db.one(
            'INSERT INTO items (name, type, secondary_type, supplier, organization_id, low_stock_threshold, order_size, stock_options, include_in_audit, unit_cost, barcodes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
            [name, type, secondary_type || null, supplier || null, organizationId, low_stock_threshold !== undefined ? low_stock_threshold : 5, JSON.stringify(Array.isArray(order_size) ? order_size : [order_size || 1]), stock_options ? JSON.stringify(stock_options) : null, include_in_audit !== undefined ? include_in_audit : true, unit_cost || 0, JSON.stringify(Array.isArray(barcodes) ? barcodes : [])]
        );
        const itemId = res.id;

        // Auto-link Supplier if provided
        if (supplier_id) {
            await db.execute(`
                INSERT INTO item_suppliers(item_id, supplier_id, is_preferred)
                VALUES($1, $2, true)
                ON CONFLICT(item_id, supplier_id) DO UPDATE SET is_preferred = true
            `, [itemId, supplier_id]);
        }

        // Determine locations to init inventory
        let locationsToInit: { id: number }[] = [];

        if (assignedLocations && Array.isArray(assignedLocations) && assignedLocations.length > 0) {
            locationsToInit = assignedLocations.map((id: number) => ({ id }));
        } else if (add_to_all_locations) {
            const assigned = await db.query(`
                SELECT l.id 
                FROM locations l
                JOIN user_locations ul ON l.id = ul.location_id
                WHERE ul.user_id = $1 AND l.organization_id = $2
            `, [session.id, organizationId]);

            if (assigned.length === 0 && session.role === 'admin') {
                const all = await db.query('SELECT id FROM locations WHERE organization_id = $1', [organizationId]);
                locationsToInit = all;
            } else {
                locationsToInit = assigned;
            }
        } else {
            // Also init inventory for current location (or default)
            let initialLocId = 0;
            const cookieLoc = req.cookies.get('current_location_id')?.value;
            if (cookieLoc) initialLocId = parseInt(cookieLoc);

            let location = null;
            if (initialLocId) {
                location = await db.one('SELECT id FROM locations WHERE id = $1 AND organization_id = $2', [initialLocId, organizationId]);
            }

            if (!location) {
                location = await db.one('SELECT id FROM locations WHERE organization_id = $1 LIMIT 1', [organizationId]);
            }

            if (location) {
                locationsToInit.push({ id: location.id });
            }
        }

        // Insert inventory records
        for (const loc of locationsToInit) {
            await db.execute(
                'INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES ($1, $2, $3, $4)',
                [itemId, loc.id, quantity || 0, organizationId]
            );
        }

        // Activity Log
        await db.execute(
            'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'CREATE_ITEM', JSON.stringify({ name, type, itemId, supplier, supplier_id })]
        );

        return NextResponse.json({ success: true, id: itemId });

    } catch (error: any) {
        console.error('Create Item Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }
        const canEdit = session.role === 'admin' || session.permissions.includes('add_item_name') || session.permissions.includes('manage_products') || session.permissions.includes('all');
        const canStock = session.role === 'admin' || session.permissions.includes('add_stock') || session.permissions.includes('all');

        if (!canEdit && !canStock) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

        const { id, unit_cost, sale_price, name, type, quantity, secondary_type, supplier, supplier_id, low_stock_threshold, order_size, stock_options, include_in_audit, include_in_low_stock_alerts, assignedLocations, stock_unit_label, stock_unit_size, order_unit_label, order_unit_size, use_category_qty_defaults, location_supplier_id, location_sale_price, locationId: bodyLocationId, barcodes, abv, bottle_size } = await req.json();

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        // Update Item Details (Name, Type, Cost, Supplier, Threshold, Order Size)
        if (canEdit) {
            const updates = [];
            const params = [];
            let pIdx = 1;

            if (unit_cost !== undefined) {
                updates.push(`unit_cost = $${pIdx++} `);
                params.push(unit_cost);
            }
            if (sale_price !== undefined) {
                updates.push(`sale_price = $${pIdx++} `);
                params.push(sale_price);
            }
            if (stock_unit_label !== undefined) {
                updates.push(`stock_unit_label = $${pIdx++} `);
                params.push(stock_unit_label);
            }
            if (stock_unit_size !== undefined) {
                updates.push(`stock_unit_size = $${pIdx++} `);
                params.push(stock_unit_size);
            }
            if (order_unit_label !== undefined) {
                updates.push(`order_unit_label = $${pIdx++} `);
                params.push(order_unit_label);
            }
            if (order_unit_size !== undefined) {
                updates.push(`order_unit_size = $${pIdx++} `);
                params.push(order_unit_size);
            }
            if (use_category_qty_defaults !== undefined) {
                updates.push(`use_category_qty_defaults = $${pIdx++} `);
                params.push(use_category_qty_defaults);
            }
            if (name !== undefined) {
                updates.push(`name = $${pIdx++} `);
                params.push(name);
            }
            if (type !== undefined) {
                updates.push(`type = $${pIdx++} `);
                params.push(type);
            }
            if (secondary_type !== undefined) {
                updates.push(`secondary_type = $${pIdx++} `);
                params.push(secondary_type);
            }
            if (supplier !== undefined) {
                updates.push(`supplier = $${pIdx++} `);
                params.push(supplier);
            }
            if (order_size !== undefined) {
                updates.push(`order_size = $${pIdx++} `);
                params.push(JSON.stringify(Array.isArray(order_size) ? order_size : [order_size]));
            }
            if (low_stock_threshold !== undefined) {
                updates.push(`low_stock_threshold = $${pIdx++} `);
                params.push(low_stock_threshold); // Can be null
            }
            if (stock_options !== undefined) {
                updates.push(`stock_options = $${pIdx++} `);
                params.push(stock_options ? JSON.stringify(stock_options) : null);
            }
            if (include_in_audit !== undefined) {
                updates.push(`include_in_audit = $${pIdx++} `);
                params.push(include_in_audit);
            }
            if (barcodes !== undefined) {
                updates.push(`barcodes = $${pIdx++} `);
                params.push(JSON.stringify(Array.isArray(barcodes) ? barcodes : []));
            }
            if (abv !== undefined) {
                updates.push(`abv = $${pIdx++} `);
                params.push(abv !== null ? parseFloat(abv) : null);
            }
            if (bottle_size !== undefined) {
                updates.push(`bottle_size = $${pIdx++} `);
                params.push(bottle_size || null);
            }

            if (updates.length > 0) {
                params.push(id);
                params.push(organizationId);
                try {
                    await db.execute(
                        `UPDATE items SET ${updates.join(', ')}
                         WHERE id = $${pIdx}
                           AND organization_id = $${pIdx + 1}`,
                        params
                    );
                } catch (fullUpdateErr: any) {
                    // Full UPDATE failed — likely a migration-added column doesn't exist yet.
                    // Fall back to only the original-schema safe columns.
                    console.warn('[PUT] Full items UPDATE failed, trying safe fallback:', fullUpdateErr.message);
                    const safeUpdates: string[] = [];
                    const safeParams: any[] = [];
                    let sIdx = 1;
                    if (name !== undefined) { safeUpdates.push(`name = $${sIdx++}`); safeParams.push(name); }
                    if (type !== undefined) { safeUpdates.push(`type = $${sIdx++}`); safeParams.push(type); }
                    if (secondary_type !== undefined) { safeUpdates.push(`secondary_type = $${sIdx++}`); safeParams.push(secondary_type); }
                    if (supplier !== undefined) { safeUpdates.push(`supplier = $${sIdx++}`); safeParams.push(supplier); }
                    if (order_size !== undefined) { safeUpdates.push(`order_size = $${sIdx++}`); safeParams.push(JSON.stringify(Array.isArray(order_size) ? order_size : [order_size])); }
                    if (low_stock_threshold !== undefined) { safeUpdates.push(`low_stock_threshold = $${sIdx++}`); safeParams.push(low_stock_threshold); }
                    if (stock_options !== undefined) { safeUpdates.push(`stock_options = $${sIdx++}`); safeParams.push(stock_options ? JSON.stringify(stock_options) : null); }
                    if (include_in_audit !== undefined) { safeUpdates.push(`include_in_audit = $${sIdx++}`); safeParams.push(include_in_audit); }
                    if (unit_cost !== undefined) { safeUpdates.push(`unit_cost = $${sIdx++}`); safeParams.push(unit_cost); }
                    if (barcodes !== undefined) { safeUpdates.push(`barcodes = $${sIdx++}`); safeParams.push(JSON.stringify(Array.isArray(barcodes) ? barcodes : [])); }
                    if (safeUpdates.length > 0) {
                        safeParams.push(id);
                        safeParams.push(organizationId);
                        await db.execute(
                            `UPDATE items SET ${safeUpdates.join(', ')}
                             WHERE id = $${sIdx}
                               AND organization_id = $${sIdx + 1}`,
                            safeParams
                        );
                    }
                }
            }

            // include_in_low_stock_alerts — separate update so pre-migration DBs don't block the whole save
            if (include_in_low_stock_alerts !== undefined) {
                try {
                    await db.execute(
                        `UPDATE items SET include_in_low_stock_alerts = $1
                         WHERE id = $2 AND organization_id = $3`,
                        [include_in_low_stock_alerts, id, organizationId]
                    );
                } catch (e) {
                    console.warn('[PUT] include_in_low_stock_alerts update failed (column may not exist yet):', (e as any).message);
                }
            }

            // Auto-link logic for Updates — clear old preferred first, then set new one
            const validSupplierId = supplier_id && !isNaN(Number(supplier_id)) ? Number(supplier_id) : null;
            if (validSupplierId) {
                try {
                    await db.execute(
                        `UPDATE item_suppliers SET is_preferred = false WHERE item_id = $1`,
                        [id]
                    );
                    await db.execute(`
                        INSERT INTO item_suppliers(item_id, supplier_id, is_preferred)
                        VALUES($1, $2, true)
                        ON CONFLICT(item_id, supplier_id) DO UPDATE SET is_preferred = true
                    `, [id, validSupplierId]);
                } catch (e) {
                    console.warn('[PUT] item_suppliers update failed (table may not exist yet):', (e as any).message);
                }
            }

            // Per-location supplier (non-fatal — table may not exist until migration runs)
            const putLocId = bodyLocationId ? parseInt(bodyLocationId) : (req.cookies.get('current_location_id')?.value ? parseInt(req.cookies.get('current_location_id')!.value) : null);
            if (location_supplier_id !== undefined && putLocId) {
                try {
                    const validLocSupplierId = location_supplier_id && !isNaN(Number(location_supplier_id)) ? Number(location_supplier_id) : null;
                    if (validLocSupplierId) {
                        await db.execute(`
                            INSERT INTO item_location_suppliers (organization_id, item_id, location_id, supplier_id)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (item_id, location_id) DO UPDATE SET supplier_id = $4
                        `, [organizationId, id, putLocId, validLocSupplierId]);
                    } else {
                        await db.execute(
                            'DELETE FROM item_location_suppliers WHERE item_id = $1 AND location_id = $2',
                            [id, putLocId]
                        );
                    }
                } catch (e) {
                    console.warn('[PUT] item_location_suppliers write failed (table may not exist yet):', (e as any).message);
                }
            }

            // Per-location sale price (non-fatal)
            if (location_sale_price !== undefined && putLocId) {
                try {
                    const priceVal = location_sale_price !== null ? parseFloat(location_sale_price) : null;
                    if (priceVal !== null && !isNaN(priceVal)) {
                        await db.execute(`
                            INSERT INTO item_location_prices (organization_id, item_id, location_id, sale_price)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (item_id, location_id) DO UPDATE SET sale_price = $4
                        `, [organizationId, id, putLocId, priceVal]);
                    } else {
                        await db.execute(
                            'DELETE FROM item_location_prices WHERE item_id = $1 AND location_id = $2',
                            [id, putLocId]
                        );
                    }
                } catch (e) {
                    console.warn('[PUT] item_location_prices write failed (table may not exist yet):', (e as any).message);
                }
            }

            // Location Sync logic
            if (assignedLocations !== undefined && Array.isArray(assignedLocations) && assignedLocations.length > 0) {
                try {
                    const currentLocs = await db.query('SELECT location_id FROM inventory WHERE item_id = $1 AND organization_id = $2', [id, organizationId]);
                    const currentLocIds = currentLocs.map((l: any) => Number(l.location_id));
                    const assignedIds = assignedLocations.map(Number);

                    // Add missing
                    for (const locId of assignedIds) {
                        if (!currentLocIds.includes(locId)) {
                            await db.execute(
                                'INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES ($1, $2, 0, $3)',
                                [id, locId, organizationId]
                            );
                        }
                    }

                    // Remove extra (only locations belonging to this org)
                    const locsToRemove = currentLocIds.filter((lid: number) => !assignedIds.includes(lid));
                    if (locsToRemove.length > 0) {
                        await db.execute('DELETE FROM inventory WHERE item_id = $1 AND organization_id = $2 AND location_id = ANY($3::int[])', [id, organizationId, locsToRemove]);
                    }
                } catch (e) {
                    console.warn('[PUT] Location sync failed:', (e as any).message);
                }
            }
        }

        // update Quantity (Set Stock)
        if (quantity !== undefined && canStock) {
            console.log(`[PUT Inventory] STOCK UPDATE START for item ${id}, qty: ${quantity}, org: ${organizationId}`);

            // Determine Location (Match GET logic) — body locationId wins over cookie
            const cookieLoc = req.cookies.get('current_location_id')?.value;
            let targetLocationId: number | null = bodyLocationId ? parseInt(bodyLocationId) : (cookieLoc ? parseInt(cookieLoc) : null);

            if (!targetLocationId) {
                const defaultLoc = await db.one('SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [organizationId]);
                targetLocationId = defaultLoc ? defaultLoc.id : null;
            }

            if (!targetLocationId) {
                console.error('[PUT Inventory] No location found for org', organizationId);
                throw new Error('No location found for org');
            }
            console.log(`[PUT Inventory] Using location ${targetLocationId}`);

            // Get current quantity and threshold (allow global items with org_id IS NULL)
            const itemOwner = await db.one(`
                SELECT id, name, low_stock_threshold FROM items
                WHERE id = $1 AND organization_id = $2
            `, [id, organizationId]);
            if (!itemOwner) {
                console.error('[PUT Inventory] Item not found for org', id, organizationId);
                return NextResponse.json({ error: 'Item not found' }, { status: 404 });
            }

            let current = await db.one('SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2', [id, targetLocationId]);
            console.log(`[PUT Inventory] Current inventory found:`, current);

            // Auto-create inventory record if missing (e.g. for new items)
            if (!current) {
                console.log('[PUT Inventory] Creating new inventory record...');
                await db.one(
                    'INSERT INTO inventory (item_id, location_id, organization_id, quantity) VALUES ($1, $2, $3, 0) RETURNING quantity',
                    [id, targetLocationId, organizationId]
                );
                current = { quantity: 0 };
            }
            const oldQty = current ? current.quantity : 0;

            console.log(`[PUT Inventory] Executing Upsert. Old: ${oldQty}, New: ${quantity}`);
            // Upsert inventory
            await db.execute(
                `INSERT INTO inventory(item_id, location_id, quantity, organization_id)
                VALUES($1, $2, $3, $4) 
                 ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = $3`,
                [id, targetLocationId, quantity, organizationId]
            );

            const diff = quantity - oldQty;
            if (diff !== 0) {
                const action = diff > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';
                let logItemName = name || itemOwner.name || 'Unknown Item';

                await logActivity(session.organizationId, session.id, action, {
                    itemId: id,
                    itemName: logItemName,
                    quantity: Math.abs(diff),
                    method: 'SET_ADMIN',
                    oldQty,
                    newQty: quantity
                });

                // TRIGGER SMART ORDER
                if (itemOwner.low_stock_threshold !== null) {
                    await checkAndTriggerSmartOrder(organizationId, itemOwner, quantity, oldQty);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[PUT Inventory]', e);
        return NextResponse.json({ error: e?.message || 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const canDelete = session.role === 'admin' || session.permissions.includes('manage_products') || session.permissions.includes('all');
        if (!canDelete) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        const result = await db.execute('DELETE FROM items WHERE id = $1 AND organization_id = $2', [id, organizationId]);

        if (result.rowCount === 0) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        await db.execute(
            'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [session.organizationId, session.id, 'DELETE_ITEM', JSON.stringify({ itemId: id })]
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Delete error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
