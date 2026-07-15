import { requireSuperAdmin } from '@/lib/auth-server';
import POSClient from './POSClient';

export default async function POSPage() {
    await requireSuperAdmin();
    return <POSClient />;
}
