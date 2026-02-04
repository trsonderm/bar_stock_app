import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import ReportsClient from './ReportsClient';

export default async function ReportsPage() {
    const session = await getSession();
    if (!session || !session.organizationId) {
        redirect('/login');
    }

    return <ReportsClient />;
}
