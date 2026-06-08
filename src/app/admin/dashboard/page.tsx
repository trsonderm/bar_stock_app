import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminDashboardClient from './AdminDashboardClient';

export default async function AdminDashboardPage() {
    const session = await getSession();

    if (!session || (session.role !== 'admin' && !session.isSuperAdmin)) {
        redirect('/admin/login');
    }

    return (
        <AdminDashboardClient
            subscriptionPlan={session.subscriptionPlan || 'base'}
            role={session.role}
            permissions={session.permissions || []}
        />
    );
}
