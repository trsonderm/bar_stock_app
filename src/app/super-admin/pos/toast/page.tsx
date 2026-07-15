import { requireSuperAdmin } from '@/lib/auth-server';
import ToastPOSClient from './ToastPOSClient';

export default async function ToastPOSPage() {
    await requireSuperAdmin();
    return <ToastPOSClient />;
}
