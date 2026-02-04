import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SupplierDetailClient from './SupplierDetailClient';

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    // SSR Data Fetch
    const supplier = await db.one(
        'SELECT * FROM suppliers WHERE id = $1 AND organization_id = $2',
        [params.id, session.organizationId]
    );

    if (!supplier) {
        redirect('/admin/suppliers');
    }

    const linkedItems = await db.query(`
        SELECT 
            i.id as item_id, 
            i.name as item_name,
            is_sup.cost_per_unit,
            is_sup.supplier_sku,
            is_sup.is_preferred
        FROM item_suppliers is_sup
        JOIN items i ON is_sup.item_id = i.id
        WHERE is_sup.supplier_id = $1
        ORDER BY i.name ASC
    `, [params.id]);

    // Fetch all items for "Add Link" dropdown
    const allItems = await db.query(
        'SELECT id, name FROM items WHERE organization_id = $1 OR organization_id IS NULL ORDER BY name ASC',
        [session.organizationId]
    );

    // Convert simplified POJO for client
    const supplierPOJO = {
        ...supplier,
        created_at: supplier.created_at?.toISOString() || null
    };

    return (
        <SupplierDetailClient
            supplier={supplierPOJO}
            initialLinkedItems={linkedItems}
            allItems={allItems}
        />
    );
}
