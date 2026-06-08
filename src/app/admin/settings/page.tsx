import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SettingsClient from './SettingsClient';

export default async function AdminSettingsPage() {
    const session = await getSession();

    if (!session || (session.role !== 'admin' && !session.isSuperAdmin)) {
        redirect('/admin/login');
    }

    return <SettingsClient />;
}
