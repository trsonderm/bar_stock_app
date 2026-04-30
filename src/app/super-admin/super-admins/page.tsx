import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SuperAdminsClient from './SuperAdminsClient';

export default async function SuperAdminsPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <SuperAdminsClient />;
}
