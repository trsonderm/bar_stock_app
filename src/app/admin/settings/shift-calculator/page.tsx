import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ShiftCalculatorBuilder from './ShiftCalculatorBuilder';

export default async function ShiftCalculatorPage() {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.isSuperAdmin)) redirect('/admin/login');
    return <ShiftCalculatorBuilder />;
}
