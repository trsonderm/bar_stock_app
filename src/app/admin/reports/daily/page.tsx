import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DailyReportClient from './DailyReportClient';

export default async function DailyReportPage() {
    const session = await getSession();
    if (!session || !session.organizationId) redirect('/login');
    if (session.role !== 'admin') redirect('/inventory');
    return <DailyReportClient />;
}
