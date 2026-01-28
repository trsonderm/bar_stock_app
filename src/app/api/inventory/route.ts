import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { logActivity } from '@/lib/logger';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const organizationId = session.organizationId;
        const { searchParams } = new URL(req.url);
        const sort = searchParams.get('sort') || 'usage';

        // Determine Location Context
        const cookieLoc = req.cookies.get('current_location_id')?.value;
        let locationId = cookieLoc ? parseInt(cookieLoc) : null;

        if (!locationId) {
            const defaultLoc = await db.one('SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [organizationId]);
            locationId = defaultLoc ? defaultLoc.id : 0;
        }

        // Refactored Query for Multi-tenancy
        // Usage of $1 for organizationId (reused) and $2 for LocationId
        let query = `
      SELECT 
        i.id, i.name, i.type, i.secondary_type, i.unit_cost, i.supplier,
        COALESCE(inv.quantity, 0) as quantity,
        COALESCE(usage_stats.usage_count, 0) as usage_count
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2
      LEFT JOIN (
        SELECT 
            (details->>'itemId')::int as item_id, 
            COUNT(*) as usage_count 
        FROM activity_logs 
        WHERE action = 'SUBTRACT_STOCK' AND organization_id = $1
        GROUP BY (details->>'itemId')::int
      ) usage_stats ON i.id = usage_stats.item_id
      WHERE (i.organization_id = $1 OR i.organization_id IS NULL)
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
        const { name, type, secondary_type, supplier } = body;

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
            'INSERT INTO items (name, type, secondary_type, supplier, organization_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, type, secondary_type || null, supplier || null, organizationId]
        );
        const itemId = res.id;

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
                'INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES ($1, $2, 0, $3)',
                [itemId, location.id, organizationId]
            );
        }

        // Activity Log
        await db.execute(
            'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'CREATE_ITEM', JSON.stringify({ name, type, itemId, supplier })]
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

        const { id, unit_cost, name, type, quantity, secondary_type, supplier } = await req.json();

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        // Update Item Details (Name, Type, Cost, Supplier)
        if (canEdit) {
            const updates = [];
            const params = [];
            let pIdx = 1;

            if (unit_cost !== undefined) {
                updates.push(`unit_cost = $${pIdx++}`);
                params.push(unit_cost);
            }
            if (name !== undefined) {
                updates.push(`name = $${pIdx++}`);
                params.push(name);
            }
            if (type !== undefined) {
                updates.push(`type = $${pIdx++}`);
                params.push(type);
            }
            if (secondary_type !== undefined) {
                updates.push(`secondary_type = $${pIdx++}`);
                params.push(secondary_type);
            }
            if (supplier !== undefined) {
                updates.push(`supplier = $${pIdx++}`);
                params.push(supplier);
            }

            if (updates.length > 0) {
                params.push(id);
                params.push(organizationId);
                // Last two params are ID and OrgID
                // Indexes are pIdx and pIdx+1
                await db.execute(
                    `UPDATE items SET ${updates.join(', ')} WHERE id = $${pIdx} AND organization_id = $${pIdx + 1}`,
                    params
                );
            }
        }

        // update Quantity (Set Stock)
        if (quantity !== undefined && canStock) {
            const location = await db.one('SELECT id FROM locations WHERE organization_id = $1 LIMIT 1', [organizationId]);
            if (!location) throw new Error('No location found for org');

            // Get current quantity
            const itemOwner = await db.one('SELECT id FROM items WHERE id = $1 AND organization_id = $2', [id, organizationId]);
            if (!itemOwner) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

            const current = await db.one('SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2', [id, location.id]);
            const oldQty = current ? current.quantity : 0;
            // Upsert inventory
            await db.execute(
                `INSERT INTO inventory (item_id, location_id, quantity, organization_id) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = $3`,
                [id, location.id, quantity, organizationId]
            );

            const diff = quantity - oldQty;
            if (diff !== 0) {
                const action = diff > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';
                await logActivity(session.organizationId, session.id, action, {
                    itemId: id,
                    itemName: name, // Assuming 'name' is available from the request body
                    quantity: Math.abs(diff),
                    method: 'SET_ADMIN',
                    oldQty,
                    newQty: quantity
                });
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
