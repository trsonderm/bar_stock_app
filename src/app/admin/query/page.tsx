import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import QueryClient from './QueryClient';

export default async function QueryPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        redirect('/');
    }

    return <QueryClient />;
}
