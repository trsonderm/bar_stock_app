import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import BottleLookupDbClient from './BottleLookupDbClient';

export default async function BottleLookupDbPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <BottleLookupDbClient />;
}
