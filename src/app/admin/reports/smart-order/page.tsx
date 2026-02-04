import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SmartOrderClient from './SmartOrderClient';

export default async function SmartOrderPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    return <SmartOrderClient />;
}
