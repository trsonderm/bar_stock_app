import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
    const session = await getSession();
    if (!session) redirect('/login');
    return <ProfileClient />;
}
