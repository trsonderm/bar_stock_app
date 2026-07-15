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

    let currentPlan = session?.subscriptionPlan;
    let barMapEnabled = false;
    let posEnabled = false;

    if (session?.organizationId) {
        try {
            const org = await db.one(
                `SELECT subscription_plan, bar_map_enabled, toast_pos_enabled, clover_pos_enabled
                 FROM organizations WHERE id = $1`,
                [session.organizationId]
            );
            if (org) {
                currentPlan = org.subscription_plan;
                barMapEnabled = !!org.bar_map_enabled;
                // Per-org POS flag OR global flag enables POS features
                const toastOn = !!org.toast_pos_enabled;
                const cloverOn = !!org.clover_pos_enabled;
                if (!toastOn && !cloverOn) {
                    // Check global toggle
                    const globalRow = await db.one(
                        "SELECT value FROM system_settings WHERE key = 'pos_global_enabled'"
                    ).catch(() => null);
                    posEnabled = globalRow?.value === 'true';
                } else {
                    posEnabled = true;
                }
            }
        } catch (e) {
            console.error('Failed to fetch org feature flags', e);
        }
    }

    const userWithFlags = session
        ? { ...session, subscriptionPlan: currentPlan, barMapEnabled, posEnabled }
        : null;

    if (!userWithFlags) return null;

    return (
        <AdminNav user={userWithFlags as any}>
            {children}
        </AdminNav>
    );
}
