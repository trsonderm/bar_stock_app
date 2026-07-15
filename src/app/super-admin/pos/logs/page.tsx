import { requireSuperAdmin } from '@/lib/auth-server';
import POSLogsClient from './POSLogsClient';

export default async function POSLogsPage() {
    await requireSuperAdmin();
    return <POSLogsClient />;
}
