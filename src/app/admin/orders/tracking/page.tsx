import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OrderTrackingClient from './OrderTrackingClient';

export default async function OrderTrackingPage() {
    const session = await getSession();
    if (!session || !session.organizationId) redirect('/');
    if (session.role !== 'admin') redirect('/inventory');

    return <OrderTrackingClient user={session} />;
}
