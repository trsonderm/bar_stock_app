
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CategoriesClient from './CategoriesClient';

export const metadata = {
    title: 'Product Variances | Topshelf Stock',
};

export default async function AdminCategoriesPage() {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        const hasPermission = session?.permissions.includes('all');
        if (!hasPermission) redirect('/admin/login');
    }

    return <CategoriesClient />;
}
