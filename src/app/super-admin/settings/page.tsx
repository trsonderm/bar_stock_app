import SettingsClient from './SettingsClient';
import { requireSuperAdmin } from '@/lib/auth-server';
import { db } from '@/lib/db';

export default async function SettingsPage() {
    await requireSuperAdmin();

    const settings = await db.query('SELECT * FROM system_settings');
    const config: Record<string, string> = {};
    settings.forEach((row: any) => {
        config[row.key] = row.value;
    });

    return <SettingsClient initialSettings={config} />;
}
