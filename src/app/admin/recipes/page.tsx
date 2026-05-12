import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminRecipesClient from './AdminRecipesClient';

export const metadata = {
    title: 'Recipe Library | Topshelf Stock',
};

export default async function AdminRecipesPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') redirect('/admin/login');
    return <AdminRecipesClient />;
}
