import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import NotificationsClient from './NotificationsClient';

export const metadata = {
    title: 'Notification Settings | Topshelf Stock',
};

export default async function NotificationsSettingsPage() {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.isSuperAdmin)) {
        redirect('/admin/login');
    }
    return <NotificationsClient />;
}
