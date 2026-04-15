import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ShiftReportsClient from './ShiftReportsClient';

export default async function ShiftReportsPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') redirect('/login');
    return <ShiftReportsClient />;
}
