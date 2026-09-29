/**
 * Tenant admin dashboard.
 */
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminDashboardClient from './AdminDashboardClient';

export default async function AdminDashboardPage() {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    return <AdminDashboardClient subscriptionPlan={session.subscriptionPlan || 'base'} />;
}
