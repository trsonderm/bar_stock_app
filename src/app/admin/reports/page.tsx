import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import SavedReportsClient from './SavedReportsClient';

export default async function SavedReportsPage() {
    const session = await getSession();
    if (!session || !session.organizationId) redirect('/login');
    if (session.role !== 'admin') redirect('/inventory');

    const isPro = session.subscriptionPlan === 'pro' || session.subscriptionPlan === 'free_trial' || session.isSuperAdmin;
    if (!isPro) {
        try {
            const org = await db.one('SELECT subscription_plan FROM organizations WHERE id = $1', [session.organizationId]);
            if (org && (org.subscription_plan !== 'pro' && org.subscription_plan !== 'free_trial')) {
                redirect('/admin/billing');
            }
        } catch {
            redirect('/admin/billing');
        }
    }

    return <SavedReportsClient />;
}
