import { requireSuperAdmin } from '@/lib/auth-server';
import SuperAdminNav from './SuperAdminNav';
import { redirect } from 'next/navigation';

export default async function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await requireSuperAdmin();
    if (!session) {
        redirect('/login');
    }

    return (
        <div className="flex min-h-screen bg-slate-950 font-sans selection:bg-blue-500/30">
            <SuperAdminNav />
            <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto scroll-smooth">
                {children}
            </main>
        </div>
    );
}
