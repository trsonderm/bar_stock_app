import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import BottleLookupClient from './BottleLookupClient';

export default async function BottleLookupPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <BottleLookupClient />;
}
