import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ReportingClient from './ReportingClient';

export default async function ReportingPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        redirect('/');
    }

    return <ReportingClient />;
}
