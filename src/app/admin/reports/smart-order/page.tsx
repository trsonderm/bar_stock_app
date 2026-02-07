import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SmartOrderClient from './SmartOrderClient';

export default async function SmartOrderPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    const isPro = session.subscriptionPlan === 'pro' || session.subscriptionPlan === 'free_trial' || session.isSuperAdmin;
    if (!isPro) {
        redirect('/admin/dashboard?upgrade=true');
    }

    return <SmartOrderClient />;
}
