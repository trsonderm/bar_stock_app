import HistoryClient from './HistoryClient';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function OrderHistoryPage() {
    const session = await getSession();
    if (!session || !session.organizationId) return redirect('/');

    // Fetch purchase orders with supplier info and aggregate total items
    const orders = await db.query(`
        SELECT 
            po.id,
            po.status,
            po.expected_delivery_date,
            po.created_at,
            po.details,
            s.name as supplier_name,
            COALESCE(SUM(poi.quantity), 0) as total_units
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
        WHERE po.organization_id = $1
        GROUP BY po.id, s.name
        ORDER BY po.created_at DESC
    `, [session.organizationId]);

    // Re-format complex JSON properties easily before passing to Client
    const formattedOrders = orders.map((o: any) => ({
        ...o,
        created_by: o.details?.created_by || 'System',
        variance: o.details?.variance || null
    }));

    return <HistoryClient orders={formattedOrders} />;
}
