import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import InventoryClient from './InventoryClient';

export default async function InventoryPage() {
    const session = await getSession();

    if (!session) {
        redirect('/');
    }

    // Pass necessary user info to client
    const user = {
        firstName: session.firstName,
        role: session.role,
        permissions: session.permissions as string[],
        iat: session.iat
    };

    return <InventoryClient user={user} />;
}
