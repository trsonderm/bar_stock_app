import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SuppliersClient from './SuppliersClient';

export default async function SuppliersPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    // Initial Fetch (SSR)
    const suppliers = await db.query(
        'SELECT * FROM suppliers WHERE organization_id = $1 ORDER BY name ASC',
        [session.organizationId]
    );

    // Also fetch all items for the linking UI
    const items = await db.query(
        'SELECT id, name FROM items WHERE organization_id = $1 OR organization_id IS NULL ORDER BY name ASC',
        [session.organizationId]
    );

    return (
        <SuppliersClient
            initialSuppliers={suppliers}
            items={items}
        />
    );
}
