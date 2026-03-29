import ManualOrderClient from './ManualOrderClient';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function ManualOrderPage() {
    const session = await getSession();
    if (!session || !session.organizationId) {
        redirect('/');
    }

    return <ManualOrderClient user={session} />;
}
