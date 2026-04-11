import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Location comes from query param first (explicit), then cookie fallback
    const { searchParams } = new URL(req.url);
    const locParam = searchParams.get('locationId');
    const cookieHeader = req.headers.get('cookie') || '';
    const locMatch = cookieHeader.match(/current_location_id=(\d+)/);
    const locationId = locParam ? parseInt(locParam) : (locMatch ? parseInt(locMatch[1]) : null);

    try {
        // Strict location filter — orders belong to exactly the selected location
        const locFilter = locationId ? `AND po.location_id = ${locationId}` : '';

        const orders = await db.query(`
            SELECT
                po.id,
                po.status,
                po.tracking_status,
                po.location_id,
                l.name AS location_name,
                po.expected_delivery_date,
                po.created_at,
                po.confirmed_at,
                po.archived_at,
                po.resubmit_of,
                po.resubmit_note,
                s.name AS supplier_name,
                u.first_name || ' ' || u.last_name AS submitted_by_name,
                cu.first_name || ' ' || cu.last_name AS confirmed_by_name,
                (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS item_count,
                (SELECT COALESCE(SUM(quantity), 0) FROM purchase_order_items WHERE purchase_order_id = po.id) AS total_ordered
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON po.submitted_by = u.id
            LEFT JOIN users cu ON po.confirmed_by = cu.id
            LEFT JOIN locations l ON po.location_id = l.id
            WHERE po.organization_id = $1
              AND po.archived_at IS NULL
              ${locFilter}
            ORDER BY po.created_at DESC
        `, [session.organizationId]);

        const current = orders.filter((o: any) =>
            ['PENDING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(o.tracking_status || o.status)
        );
        const history = orders.filter((o: any) =>
            ['RECEIVED', 'DELIVERED'].includes(o.tracking_status || o.status)
        );

        // Also fetch archived (resubmitted) for history view
        const archived = await db.query(`
            SELECT
                po.id,
                po.status,
                po.tracking_status,
                po.location_id,
                l.name AS location_name,
                po.expected_delivery_date,
                po.created_at,
                po.confirmed_at,
                po.archived_at,
                po.resubmit_of,
                po.resubmit_note,
                s.name AS supplier_name,
                u.first_name || ' ' || u.last_name AS submitted_by_name,
                (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS item_count,
                (SELECT COALESCE(SUM(quantity), 0) FROM purchase_order_items WHERE purchase_order_id = po.id) AS total_ordered
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON po.submitted_by = u.id
            LEFT JOIN locations l ON po.location_id = l.id
            WHERE po.organization_id = $1
              AND po.archived_at IS NOT NULL
              ${locFilter}
            ORDER BY po.archived_at DESC
        `, [session.organizationId]);

        return NextResponse.json({ current, history, archived, locationId });
    } catch (e) {
        console.error('Admin orders GET error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
