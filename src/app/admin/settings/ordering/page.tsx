import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OrderingSettingsClient from './OrderingSettingsClient';

export const metadata = {
    title: 'Automated Ordering | Topshelf Stock',
};

export default async function OrderingSettingsPage() {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.isSuperAdmin)) {
        redirect('/admin/login');
    }
    return <OrderingSettingsClient />;
}
