import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import POSDashboardClient from './POSDashboardClient';

export default async function POSDashboardPage() {
    const session = await getSession();
    if (!session?.organizationId) redirect('/admin/login');

    const org = await db.one(
        'SELECT toast_pos_enabled, clover_pos_enabled FROM organizations WHERE id = $1',
        [session.organizationId]
    ).catch(() => null);
    const globalRow = await db.one(
        "SELECT value FROM system_settings WHERE key = 'pos_global_enabled'"
    ).catch(() => null);
    const posEnabled = org?.toast_pos_enabled || org?.clover_pos_enabled || globalRow?.value === 'true';

    if (!posEnabled) redirect('/admin/dashboard');

    return <POSDashboardClient />;
}
