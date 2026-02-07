import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DBToolsClient from './DBToolsClient';
import AdminNav from '../AdminNav';

export default async function DBToolsPage() {
    const session = await getSession();
    // Check for super_admin permission
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');

    if (!session || !isSuperAdmin) {
        redirect('/admin');
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#111827' }}>
            <AdminNav />
            <div style={{ flex: 1, padding: '2rem' }}>
                <DBToolsClient />
            </div>
        </div>
    );
}
