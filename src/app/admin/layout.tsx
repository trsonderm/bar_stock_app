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

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title} style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>Admin Panel</h1>
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'normal' }}>Fosters Bars</div>
                </div>
                {userWithFreshPlan && <AdminNav user={userWithFreshPlan} />}
            </header>
            <main style={{ marginTop: '2rem' }}>
                {children}
            </main>
        </div>
    );
}
