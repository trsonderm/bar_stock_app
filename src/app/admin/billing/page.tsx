import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import BillingClient from './BillingClient';

export default async function BillingPage() {
    const session = await getSession();
    if (!session) {
        redirect('/login');
    }

    return <BillingClient />;
}
