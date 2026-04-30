import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SecurityClient from './SecurityClient';

export default async function SecurityPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') redirect('/admin/login');

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    const canAddBarred = isAdmin || perms.includes('all') || perms.includes('add_barred');
    const canDeleteBarred = isAdmin || perms.includes('all') || perms.includes('delete_barred');
    const canAddIncident = isAdmin || perms.includes('all') || perms.includes('add_incident');

    return (
        <SecurityClient
            myUserId={session.id}
            myName={`${session.firstName} ${session.lastName}`}
            canAddBarred={canAddBarred}
            canDeleteBarred={canDeleteBarred}
            canAddIncident={canAddIncident}
        />
    );
}
