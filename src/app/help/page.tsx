import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import HelpClient from './HelpClient';

export default async function HelpPage() {
    const session = await getSession();
    if (!session) redirect('/login');
    return <HelpClient />;
}
