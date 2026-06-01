import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ReportingSettingsClient from './ReportingSettingsClient';

export const metadata = {
    title: 'Reporting Settings | Topshelf Stock',
};

export default async function ReportingSettingsPage() {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.isSuperAdmin)) {
        redirect('/admin/login');
    }
    return <ReportingSettingsClient />;
}
