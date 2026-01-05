
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import PricesClient from './PricesClient'; // We'll create this next

export default async function AdminPricesPage() {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        redirect('/admin/login');
    }

    return <PricesClient />;
}
