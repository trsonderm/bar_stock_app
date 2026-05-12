import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import RecipesManagerClient from './RecipesManagerClient';

export default async function SuperAdminRecipesPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <RecipesManagerClient />;
}
