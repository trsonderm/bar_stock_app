import MailAccountsClient from './MailAccountsClient';
import { requireSuperAdmin } from '@/lib/auth-server';
import { db } from '@/lib/db';

export const metadata = {
    title: 'Mail Accounts | Super Admin',
};

export default async function MailAccountsPage() {
    await requireSuperAdmin();

    const settings = await db.query('SELECT * FROM system_settings');
    const config: Record<string, string> = {};
    settings.forEach((row: any) => {
        config[row.key] = row.value;
    });

    return <MailAccountsClient initialSettings={config} />;
}
