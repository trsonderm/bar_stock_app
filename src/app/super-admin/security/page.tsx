import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SecurityClient from './SecurityClient';

export default async function SecurityPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <SecurityClient />;
}
