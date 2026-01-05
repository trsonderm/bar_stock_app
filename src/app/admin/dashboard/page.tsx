import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminDashboardClient from './AdminDashboardClient';

export default async function AdminDashboardPage() {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        redirect('/admin/login');
    }

    return <AdminDashboardClient />;
}
