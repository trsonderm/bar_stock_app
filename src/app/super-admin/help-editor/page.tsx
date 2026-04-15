import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import HelpEditorClient from './HelpEditorClient';

export default async function HelpEditorPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');
    return <HelpEditorClient />;
}
