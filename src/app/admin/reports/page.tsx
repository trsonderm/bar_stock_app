import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import ReportingClient from '../reporting/ReportingClient';

export default async function ReportsPage() {
    const session = await getSession();
    if (!session || !session.organizationId) {
        redirect('/login');
    }

    const isPro = session.subscriptionPlan === 'pro' || session.subscriptionPlan === 'free_trial' || session.isSuperAdmin;
    if (!isPro) {
        redirect('/admin/dashboard?upgrade=true');
    }

    return <ReportingClient />;
}
