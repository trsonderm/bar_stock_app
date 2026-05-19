/**
 * GET  /api/mobile/orders/:id  — get order details with line items
 * POST /api/mobile/orders/:id  — check in / receive order items, update inventory
 *
 * POST "receive" body:
 *   { "items": [{ "order_item_id": 5, "quantity_received": 12 }] }
 *   Requires add_stock permission or admin.
 *   Updates inventory and auto-sets order status:
 *     all items fully received → DELIVERED
 *     some items received      → PARTIALLY_RECEIVED
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const order = await db.one(
            `SELECT o.id, o.status, o.location_id, l.name AS location_name,
                    o.expected_delivery, o.notes, o.created_at, o.updated_at
             FROM orders o
             LEFT JOIN locations l ON o.location_id = l.id
             WHERE o.id = $1 AND o.organization_id = $2`,
            [params.id, session.organizationId]
        );
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        const items = await db.query(
            `SELECT oi.id, oi.item_id, i.name AS item_name, i.type, i.supplier,
                    oi.quantity, oi.quantity_received, oi.unit_cost
             FROM order_items oi
             JOIN items i ON oi.item_id = i.id
             WHERE oi.order_id = $1
             ORDER BY i.name ASC`,
            [params.id]
        );

        return NextResponse.json({
            order: {
                id: order.id,
                status: order.status,
                location_id: order.location_id,
                location_name: order.location_name,
                expected_delivery: order.expected_delivery,
                notes: order.notes,
                created_at: order.created_at,
                updated_at: order.updated_at,
                items: items.map(i => ({
                    id: i.id,
                    item_id: i.item_id,
                    item_name: i.item_name,
                    type: i.type,
                    supplier: i.supplier,
                    quantity_ordered: Number(i.quantity),
                    quantity_received: i.quantity_received != null ? Number(i.quantity_received) : null,
                    unit_cost: i.unit_cost ? Number(i.unit_cost) : null,
                })),
            },
        });
    } catch (err) {
        console.error('[Mobile orders/:id GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    const hasAll = isAdmin || perms.includes('all');
    if (!hasAll && !perms.includes('add_stock')) {
        return NextResponse.json({ error: 'Permission denied: add_stock required' }, { status: 403 });
    }

    try {
        const { items } = await req.json();
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
        }

        const order = await db.one(
            `SELECT id, status, location_id FROM orders
             WHERE id = $1 AND organization_id = $2`,
            [params.id, session.organizationId]
        );
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
            return NextResponse.json({ error: `Cannot receive items on a ${order.status} order` }, { status: 409 });
        }

        const receivedItems: any[] = [];

        for (const entry of items) {
            const { order_item_id, quantity_received } = entry;
            if (!order_item_id || quantity_received == null) continue;
            const qty = Math.max(0, Number(quantity_received));

            // Get the order item
            const oi = await db.one(
                `SELECT oi.id, oi.item_id, oi.quantity FROM order_items oi
                 WHERE oi.id = $1 AND oi.order_id = $2`,
                [order_item_id, params.id]
            );
            if (!oi) continue;

            // Update quantity_received (cap at ordered quantity)
            const capped = Math.min(qty, Number(oi.quantity));
            await db.execute(
                `UPDATE order_items SET quantity_received = $1 WHERE id = $2`,
                [capped, oi.id]
            );

            if (capped > 0) {
                // Add received quantity to inventory
                await db.execute(
                    `INSERT INTO inventory (item_id, location_id, quantity)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (item_id, location_id)
                     DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
                    [oi.item_id, order.location_id, capped]
                );

                // Log to activity_log
                const submittedByName = `${session.firstName} ${session.lastName}`;
                await db.execute(
                    `INSERT INTO activity_log
                        (organization_id, item_id, location_id, action, change_amount, new_quantity, performed_by_user_id, performed_by_name, note)
                     SELECT $1, $2, $3, 'ADD_STOCK', $4,
                            (SELECT quantity FROM inventory WHERE item_id = $2 AND location_id = $3),
                            $5, $6, $7`,
                    [session.organizationId, oi.item_id, order.location_id, capped, session.id, submittedByName, `Order #${params.id} check-in`]
                );
            }

            receivedItems.push({ order_item_id: oi.id, item_id: oi.item_id, quantity_received: capped });
        }

        // Determine new order status
        const allItems = await db.query(
            `SELECT quantity, COALESCE(quantity_received, 0) AS quantity_received
             FROM order_items WHERE order_id = $1`,
            [params.id]
        );
        const allReceived = allItems.every((i: any) => Number(i.quantity_received) >= Number(i.quantity));
        const anyReceived = allItems.some((i: any) => Number(i.quantity_received) > 0);
        const newStatus = allReceived ? 'DELIVERED' : anyReceived ? 'PARTIALLY_RECEIVED' : order.status;

        await db.execute(
            `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
            [newStatus, params.id]
        );

        return NextResponse.json({
            ok: true,
            order_id: Number(params.id),
            status: newStatus,
            items_received: receivedItems,
        });
    } catch (err) {
        console.error('[Mobile orders/:id POST]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
