import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OrgModelsClient from './OrgModelsClient';

export const metadata = { title: 'Org ML Models | Super Admin' };

export default async function OrgModelsPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <OrgModelsClient />;
}
