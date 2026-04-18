import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import FinancesClient from './FinancesClient';

export const metadata = { title: 'Finances — Admin' };

export default async function FinancesPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') redirect('/login');
    return <FinancesClient />;
}
