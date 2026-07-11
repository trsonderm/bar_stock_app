import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import BarMapClient from './BarMapClient';

export const metadata = { title: 'Bar Map' };

export default async function BarMapPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') redirect('/login');

    const [mapRow, productRows] = await Promise.all([
        db.one('SELECT map_data FROM bar_maps WHERE organization_id=$1 AND is_active=TRUE ORDER BY updated_at DESC LIMIT 1', [session.organizationId]),
        db.query('SELECT id, name, type FROM items WHERE organization_id=$1 AND archived_at IS NULL ORDER BY type, name', [session.organizationId]),
    ]);

    const initialMap = mapRow?.map_data ?? null;
    const products = productRows || [];

    return <BarMapClient initialMap={initialMap} products={products} />;
}
