import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ServerAlertsClient from './ServerAlertsClient';

export default async function ServerAlertsPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <ServerAlertsClient />;
}
