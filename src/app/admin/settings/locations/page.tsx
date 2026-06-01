import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LocationsClient from './LocationsClient';

export const metadata = {
    title: 'Locations Settings | Topshelf Stock',
};

export default async function LocationsPage() {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.isSuperAdmin)) {
        redirect('/admin/login');
    }
    return <LocationsClient />;
}
