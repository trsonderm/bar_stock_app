import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import AuthenticationClient from './AuthenticationClient';

export default async function AuthenticationPage() {
    const session = await getSession();
    if (!session?.isSuperAdmin) redirect('/login');

    const SSO_KEYS = [
        'sso_google_enabled', 'sso_google_client_id', 'sso_google_client_secret',
        'sso_github_enabled', 'sso_github_client_id', 'sso_github_client_secret',
        'sso_microsoft_enabled', 'sso_microsoft_client_id', 'sso_microsoft_client_secret', 'sso_microsoft_tenant_id',
        'sso_allow_new_users', 'sso_allowed_domains', 'sso_default_role', 'sso_default_org_id',
    ];

    const [settingRows, orgRows] = await Promise.all([
        db.query(`SELECT key, value FROM system_settings WHERE key = ANY($1)`, [SSO_KEYS]).catch(() => []),
        db.query('SELECT id, name FROM organizations ORDER BY name').catch(() => []),
    ]);

    const settings: Record<string, string> = {};
    for (const r of settingRows) settings[r.key] = r.value;

    return <AuthenticationClient initialSettings={settings} organizations={orgRows} />;
}
