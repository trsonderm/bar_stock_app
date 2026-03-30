import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import AdminNav from './AdminNav';
import styles from './admin.module.css';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    // Fetch fresh subscription plan to ensure immediate updates
    let currentPlan = session?.subscriptionPlan;
    if (session?.organizationId) {
        try {
            const org = await db.one('SELECT subscription_plan FROM organizations WHERE id = $1', [session.organizationId]);
            if (org) {
                currentPlan = org.subscription_plan;
            }
        } catch (e) {
            console.error('Failed to fetch fresh plan', e);
        }
    }

    const userWithFreshPlan = session ? { ...session, subscriptionPlan: currentPlan } : null;

    if (!userWithFreshPlan) return null;

    return (
        <AdminNav user={userWithFreshPlan as any}>
            {children}
        </AdminNav>
    );
}
