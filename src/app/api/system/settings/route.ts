import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Public GET for Login Page
export async function GET(req: NextRequest) {
    try {
        const rows = await db.query(
            `SELECT key, value FROM system_settings WHERE key IN ('quick_login_enabled','sso_google_enabled','sso_github_enabled','sso_microsoft_enabled')`
        );
        const m: Record<string, string> = {};
        for (const r of rows) m[r.key] = r.value;

        const sso_providers: string[] = [];
        if (m['sso_google_enabled'] === 'true') sso_providers.push('google');
        if (m['sso_github_enabled'] === 'true') sso_providers.push('github');
        if (m['sso_microsoft_enabled'] === 'true') sso_providers.push('microsoft');

        return NextResponse.json({
            quick_login_enabled: m['quick_login_enabled'] === 'true',
            sso_providers,
        });
    } catch (e) {
        console.error('System Settings API Error:', e);
        return NextResponse.json({ quick_login_enabled: false, sso_providers: [] });
    }
}

// Protected POST for Super Admin
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { enabled } = body;

        await db.query(
            "INSERT INTO system_settings (key, value) VALUES ('quick_login_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [enabled ? 'true' : 'false']
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
