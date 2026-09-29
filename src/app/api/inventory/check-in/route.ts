/**
 * POST /api/inventory/check-in
 *
 * Staff check-in of a delivered purchase order from the inventory screen.
 * Body: { order_id, check_in_items: [{ item_id, received_qty, expected_qty }] }
 *
 * Adds each received quantity to stock at the order's location, logs a
 * CHECK_IN activity per item, records expected-vs-received variance on the
 * order and marks it DELIVERED — all in one transaction.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { order_id, check_in_items } = await req.json();
        if (!order_id || !Array.isArray(check_in_items)) {
            return NextResponse.json({ error: 'Missing order_id or check_in_items' }, { status: 400 });
        }

        const orgId = session.organizationId;
        const cookieLocationId = parseInt(req.cookies.get('current_location_id')?.value || '', 10) || null;

        const result = await db.transaction(async (tx) => {
            const order = await tx.one(
                'SELECT id, details, location_id FROM purchase_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE',
                [order_id, orgId]
            );
            if (!order) return null;

            // Stock goes to the order's location; fall back to the user's current
            // location, then to the organization's first location.
            const location = await tx.one(
                `SELECT id FROM locations
                 WHERE organization_id = $1 AND id = ANY($2::int[])
                 ORDER BY array_position($2::int[], id) LIMIT 1`,
                [orgId, [order.location_id, cookieLocationId].filter(Boolean)]
            ) || await tx.one('SELECT id FROM locations WHERE organization_id = $1 ORDER BY id LIMIT 1', [orgId]);
            if (!location) throw new Error('Organization has no locations');

            const variance: { item_id: number; expected: number; received: number; difference: number }[] = [];

            for (const item of check_in_items) {
                const received = Number(item.received_qty) || 0;
                const expected = Number(item.expected_qty) || 0;

                if (received > 0) {
                    const owned = await tx.one('SELECT id FROM items WHERE id = $1 AND organization_id = $2', [item.item_id, orgId]);
                    if (!owned) continue;

                    await tx.execute(
                        `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
                        [item.item_id, location.id, received, orgId]
                    );

                    await tx.execute(
                        `INSERT INTO activity_logs (organization_id, user_id, action, details)
                         VALUES ($1, $2, 'CHECK_IN', $3)`,
                        [orgId, session.id, JSON.stringify({ item_id: item.item_id, added: received, order_id, locationId: location.id })]
                    );
                }

                if (received !== expected) {
                    variance.push({ item_id: item.item_id, expected, received, difference: received - expected });
                }
            }

            const details = order.details || {};
            details.check_in_variance = variance;
            details.checked_in_by = session.id;
            details.checked_in_at = new Date().toISOString();

            await tx.execute(
                `UPDATE purchase_orders SET status = 'DELIVERED', details = $1 WHERE id = $2 AND organization_id = $3`,
                [JSON.stringify(details), order_id, orgId]
            );

            return variance;
        });

        if (!result) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        return NextResponse.json({ success: true, variance: result });

    } catch (e) {
        console.error('Check-in failed:', e);
        return NextResponse.json({ error: 'Check-In Engine Failed' }, { status: 500 });
    }
}
