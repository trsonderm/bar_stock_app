/**
 * Users page.
 */
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import UsersClient from './UsersClient';

export default async function AdminUsersPage() {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    return <UsersClient />;
}
