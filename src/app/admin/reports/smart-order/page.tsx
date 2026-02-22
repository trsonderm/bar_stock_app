import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import SmartOrderClient from './SmartOrderClient';

export default async function SmartOrderPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    let isPro = session.subscriptionPlan === 'pro' || session.subscriptionPlan === 'free_trial' || session.isSuperAdmin;

    // Double check DB for fresh status
    try {
        const org = await db.one('SELECT subscription_plan FROM organizations WHERE id = $1', [session.organizationId]);
        if (org && (org.subscription_plan === 'pro' || org.subscription_plan === 'free_trial')) {
            isPro = true;
        }
    } catch { }

    if (!isPro) {
        redirect('/admin/dashboard?upgrade=true');
    }

    return <SmartOrderClient />;
}
