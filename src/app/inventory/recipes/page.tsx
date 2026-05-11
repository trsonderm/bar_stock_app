import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import RecipesClient from './RecipesClient';

export const metadata = { title: 'Recipes | TopShelf' };

export default async function RecipesPage() {
    const session = await getSession();
    if (!session) redirect('/login');
    return <RecipesClient user={session} />;
}
