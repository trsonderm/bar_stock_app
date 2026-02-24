import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { logActivity } from '@/lib/logger';
import { checkAndTriggerSmartOrder } from '@/lib/smart-order';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const organizationId = session.organizationId;

        const { searchParams } = new URL(req.url);
        const sort = searchParams.get('sort') || 'usage';

        // Determine Location Context
        const cookieLoc = req.cookies.get('current_location_id')?.value;
        let locationId = cookieLoc ? parseInt(cookieLoc) : null;

        // Validate location belongs to org
        if (locationId) {
            const validLoc = await db.one('SELECT id FROM locations WHERE id = $1 AND organization_id = $2', [locationId, organizationId]);
            if (!validLoc) {
                locationId = null; // Reset if invalid
            }
        }

        if (!locationId) {
            const defaultLoc = await db.one('SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [organizationId]);
            locationId = defaultLoc ? defaultLoc.id : 0;
        }

        // Refactored Query for Multi-tenancy
        // Usage of $1 for organizationId (reused) and $2 for LocationId
        let query = `
      SELECT 
        i.id, i.name, i.type, i.secondary_type, i.unit_cost, i.supplier,
        i.order_size, i.low_stock_threshold,
        COALESCE(i.stock_options, '[]') as stock_options,
        COALESCE(i.include_in_audit, true) as include_in_audit,
        MAX(isp.supplier_id) as supplier_id,
        COALESCE(SUM(inv.quantity), 0) as quantity,
        COALESCE(MAX(usage_stats.usage_count), 0) as usage_count
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
      WHERE (
        i.organization_id = $1 
        OR (i.organization_id IS NULL AND NOT EXISTS (
            SELECT 1 FROM items i2 WHERE i2.name = i.name AND i2.organization_id = $1
        ))
      )
      GROUP BY i.id, usage_stats.usage_count
    `;

        if (sort === 'usage') {
            query += ` ORDER BY usage_count DESC, i.name ASC`;
        } else {
            query += ` ORDER BY i.name ASC`;
        }

        const items = await db.query(query, [organizationId, locationId]);
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

        const organizationId = session.organizationId;
        const canAddName = session.role === 'admin' || session.permissions.includes('add_item_name') || session.permissions.includes('all');

        if (!canAddName) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await req.json();
        const { name, type, secondary_type, supplier, supplier_id, low_stock_threshold, order_size, stock_options, include_in_audit, quantity } = body;

        if (!name || !type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        // Check for duplicate IN THIS ORG
        const existing = await db.one('SELECT id FROM items WHERE name = $1 AND organization_id = $2', [name, organizationId]);
        if (existing) {
            return NextResponse.json({ error: 'Item already exists' }, { status: 400 });
        }

        const validCat = await db.one('SELECT name FROM categories WHERE name = $1 AND organization_id = $2', [type, organizationId]);

        if (!validCat) {
            // Logic kept from previous: Warn or ignore
        }

        // Insert and Return ID
        const res = await db.one(
            'INSERT INTO items (name, type, secondary_type, supplier, organization_id, low_stock_threshold, order_size, stock_options, include_in_audit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
            [name, type, secondary_type || null, supplier || null, organizationId, low_stock_threshold !== undefined ? low_stock_threshold : 5, JSON.stringify(Array.isArray(order_size) ? order_size : [order_size || 1]), stock_options ? JSON.stringify(stock_options) : null, include_in_audit !== undefined ? include_in_audit : true]
        );
        const itemId = res.id;

        // Auto-link Supplier if provided
        if (supplier_id) {
            const sup = await db.one('SELECT supplier_sku FROM item_suppliers WHERE item_id = $1 AND is_preferred = true', [itemId]);
            // Since it's new, we just insert
            await db.execute(`
                INSERT INTO item_suppliers(item_id, supplier_id, is_preferred)
        VALUES($1, $2, true)
                ON CONFLICT(item_id, supplier_id) DO UPDATE SET is_preferred = true
            `, [itemId, supplier_id]);
        }

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
            await db.execute(
                'INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES ($1, $2, $3, $4)',
                [itemId, location.id, quantity || 0, organizationId]
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

        const organizationId = session.organizationId;
        const canEdit = session.role === 'admin' || session.permissions.includes('add_item_name') || session.permissions.includes('all');
        const canStock = session.role === 'admin' || session.permissions.includes('add_stock') || session.permissions.includes('all');

        if (!canEdit && !canStock) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

        const { id, unit_cost, name, type, quantity, secondary_type, supplier, supplier_id, low_stock_threshold, order_size, stock_options, include_in_audit } = await req.json();

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

            if (updates.length > 0) {
                params.push(id);
                params.push(organizationId);
                // Last two params are ID and OrgID
                // Indexes are pIdx and pIdx+1
                await db.execute(
                    `UPDATE items SET ${updates.join(', ')} WHERE id = $${pIdx} AND organization_id = $${pIdx + 1} `,
                    params
                );
            }

            // Auto-link logic for Updates
            if (supplier_id) {
                await db.execute(`
                    INSERT INTO item_suppliers(item_id, supplier_id, is_preferred)
        VALUES($1, $2, true)
                    ON CONFLICT(item_id, supplier_id) DO UPDATE SET is_preferred = true
            `, [id, supplier_id]);
            }
        }

        // update Quantity (Set Stock)
        if (quantity !== undefined && canStock) {
            console.log(`[PUT Inventory] STOCK UPDATE START for item ${id}, qty: ${quantity}, org: ${organizationId}`);

            // Determine Location (Match GET logic)
            const cookieLoc = req.cookies.get('current_location_id')?.value;
            let targetLocationId = cookieLoc ? parseInt(cookieLoc) : null;

            if (!targetLocationId) {
                const defaultLoc = await db.one('SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [organizationId]);
                targetLocationId = defaultLoc ? defaultLoc.id : null;
            }

            if (!targetLocationId) {
                console.error('[PUT Inventory] No location found for org', organizationId);
                throw new Error('No location found for org');
            }
            console.log(`[PUT Inventory] Using location ${targetLocationId}`);

            // Get current quantity and threshold
            const itemOwner = await db.one('SELECT id, name, low_stock_threshold FROM items WHERE id = $1 AND organization_id = $2', [id, organizationId]);
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
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (session.role !== 'admin') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        const result = await db.execute('DELETE FROM items WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);

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
