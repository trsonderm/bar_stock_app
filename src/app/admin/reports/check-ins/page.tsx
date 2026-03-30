import ReportClient from './ReportClient';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function VarianceReportPage() {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        redirect('/');
    }

    // Fetch all delivered orders that have variance data
    // We filter in JS for simplicity, though we could use jsonb path queries in Postgres
    const orders = await db.query(`
        SELECT 
            po.id,
            po.status,
            po.expected_delivery_date,
            po.created_at,
            po.details,
            s.name as supplier_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.organization_id = $1 AND po.status = 'DELIVERED'
        ORDER BY po.created_at DESC
    `, [session.organizationId]);

    // Format the items 
    // Variance tracker shape: [{ item_id, expected, received, difference }]
    // We need item names. Let's fetch all items in org for dictionary lookup.
    const itemsRes = await db.query('SELECT id, name FROM items WHERE organization_id = $1', [session.organizationId]);
    const itemDict: Record<number, string> = {};
    itemsRes.forEach((i: any) => { itemDict[i.id] = i.name; });

    const varianceReports: any[] = [];

    orders.forEach((o: any) => {
        const details = typeof o.details === 'string' ? JSON.parse(o.details) : o.details || {};
        const variance = details.check_in_variance;
        if (variance && Array.isArray(variance) && variance.length > 0) {
            // Re-hydrate item names
            const populatedVariance = variance.map((v: any) => ({
                ...v,
                name: itemDict[v.item_id] || 'Unknown Item'
            }));

            varianceReports.push({
                order_id: o.id,
                supplier_name: o.supplier_name || 'Multiple',
                delivery_date: o.details.checked_in_at || o.expected_delivery_date,
                variance: populatedVariance
            });
        }
    });

    return <ReportClient reports={varianceReports} />;
}
