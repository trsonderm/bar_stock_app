import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import ReportBuilderClient from './ReportBuilderClient';

export default async function ReportBuilderPage() {
    const session = await getSession();
    if (!session || !session.organizationId) redirect('/');
    if (session.role !== 'admin') redirect('/inventory');
    const isPro = session.subscriptionPlan === 'pro' || session.subscriptionPlan === 'free_trial' || session.isSuperAdmin;
    if (!isPro) redirect('/admin/billing');

    return (
        <Suspense fallback={null}>
            <ReportBuilderClient user={session} />
        </Suspense>
    );
}
