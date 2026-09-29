/**
 * /api/admin/orders/:id — a single purchase order.
 *
 *  GET    order detail with its line items (any signed-in user of the org)
 *  DELETE delete a PENDING / IN_TRANSIT order (admin)
 *  PUT    edit & resubmit (admin): archives this order and creates a new PENDING
 *         order at the same location linked via resubmit_of
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET order detail with items
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orderId = parseInt(params.id);

    try {
        const orderRows = await db.query(`
            SELECT
                po.id, po.status, po.tracking_status, po.expected_delivery_date,
                po.created_at, po.confirmed_at, po.resubmit_of, po.resubmit_note,
                po.supplier_id,
                s.name AS supplier_name,
                u.first_name || ' ' || u.last_name AS submitted_by_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON po.submitted_by = u.id
            WHERE po.id = $1 AND po.organization_id = $2
        `, [orderId, session.organizationId]);

        if (!orderRows || orderRows.length === 0) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        const order = orderRows[0];

        const items = await db.query(`
            SELECT
                poi.id, poi.item_id, poi.quantity, poi.received_quantity, poi.confirmed_at,
                i.name AS item_name, i.type AS item_type,
                COALESCE(i.stock_unit_label, 'unit') AS stock_unit_label
            FROM purchase_order_items poi
            JOIN items i ON poi.item_id = i.id
            WHERE poi.purchase_order_id = $1
            ORDER BY i.name ASC
        `, [orderId]);

        return NextResponse.json({ order, items });
    } catch (e) {
        console.error('Order GET error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// DELETE an order (admin only, PENDING orders)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orderId = parseInt(params.id);

    try {
        const rows = await db.query(
            `SELECT id, tracking_status, status FROM purchase_orders WHERE id = $1 AND organization_id = $2`,
            [orderId, session.organizationId]
        );
        if (!rows || rows.length === 0) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        const order = rows[0];
        const ts = order.tracking_status || order.status;
        if (!['PENDING', 'IN_TRANSIT'].includes(ts)) {
            return NextResponse.json({ error: 'Only PENDING orders can be deleted' }, { status: 400 });
        }

        await db.execute('DELETE FROM purchase_orders WHERE id = $1 AND organization_id = $2', [orderId, session.organizationId]);
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Order DELETE error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// PUT: Archive current order and create a new one (edit/resubmit flow)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orderId = parseInt(params.id);
    const { items, expected_delivery_date, supplier_id, note } = await req.json();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Archive the existing order (must belong to this organization)
        const archived = await client.query(
            `UPDATE purchase_orders SET archived_at = NOW(), resubmit_note = $1
             WHERE id = $2 AND organization_id = $3 AND archived_at IS NULL
             RETURNING location_id`,
            [note || 'Edited and resubmitted', orderId, session.organizationId]
        );
        if (archived.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        if (supplier_id) {
            const supplier = await client.query('SELECT 1 FROM suppliers WHERE id = $1 AND organization_id = $2', [supplier_id, session.organizationId]);
            if (supplier.rowCount === 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
            }
        }

        // Create the replacement order at the same location, linked to the archived one
        const newOrderRes = await client.query(`
            INSERT INTO purchase_orders
                (organization_id, supplier_id, location_id, expected_delivery_date, tracking_status, status, submitted_by, resubmit_of, details)
            VALUES ($1, $2, $3, $4, 'PENDING', 'PENDING', $5, $6, $7)
            RETURNING id
        `, [
            session.organizationId,
            supplier_id,
            archived.rows[0].location_id,
            expected_delivery_date,
            session.id,
            orderId,
            JSON.stringify({ created_by: session.id, resubmitted: true })
        ]);
        const newOrderId = newOrderRes.rows[0].id;

        for (const item of (items || [])) {
            // Only this organization's items may be ordered
            await client.query(
                `INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity)
                 SELECT $1, id, $3 FROM items WHERE id = $2 AND organization_id = $4`,
                [newOrderId, item.item_id, item.quantity, session.organizationId]
            );
        }

        await client.query('COMMIT');
        return NextResponse.json({ success: true, newOrderId });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Order PUT error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
