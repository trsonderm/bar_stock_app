import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import GlobalDatabaseClient from './GlobalDatabaseClient';

export default async function GlobalDatabasePage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <GlobalDatabaseClient />;
}
