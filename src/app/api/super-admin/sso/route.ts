import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const SSO_KEYS = [
    'sso_google_enabled', 'sso_google_client_id', 'sso_google_client_secret',
    'sso_github_enabled', 'sso_github_client_id', 'sso_github_client_secret',
    'sso_microsoft_enabled', 'sso_microsoft_client_id', 'sso_microsoft_client_secret', 'sso_microsoft_tenant_id',
    'sso_allow_new_users', 'sso_allowed_domains', 'sso_default_role', 'sso_default_org_id',
];

export async function GET() {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await db.query(
        `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
        [SSO_KEYS]
    );
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { key, value } = await req.json();
    if (!SSO_KEYS.includes(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 });

    await db.execute(
        `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, String(value)]
    );
    return NextResponse.json({ ok: true });
}
