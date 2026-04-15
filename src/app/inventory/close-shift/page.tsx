import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CloseShiftClient from './CloseShiftClient';

export default async function CloseShiftPage() {
    const session = await getSession();
    if (!session) redirect('/login');
    const canSubtract =
        session.role === 'admin' ||
        session.permissions?.includes('subtract_stock') ||
        session.permissions?.includes('all');
    if (!canSubtract) redirect('/inventory');
    return <CloseShiftClient user={session as any} />;
}
