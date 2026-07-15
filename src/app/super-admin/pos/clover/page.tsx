import { requireSuperAdmin } from '@/lib/auth-server';
import CloverPOSClient from './CloverPOSClient';

export default async function CloverPOSPage() {
    await requireSuperAdmin();
    return <CloverPOSClient />;
}
