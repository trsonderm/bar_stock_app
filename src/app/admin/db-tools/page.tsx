import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DBToolsClient from './DBToolsClient';

export default async function DBToolsPage() {
    const session = await getSession();
    // Check for super_admin permission
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');

    if (!session || !isSuperAdmin) {
        redirect('/admin');
    }

    return (
        <div style={{ padding: '2rem', background: '#111827', minHeight: '100vh' }}>
            <DBToolsClient />
        </div>
    );
}
