import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Public GET for Login Page
export async function GET(req: NextRequest) {
    try {
        const setting = await db.one("SELECT value FROM system_settings WHERE key = 'quick_login_enabled'");
        console.log('System Settings API: quick_login_enabled =', setting?.value);
        return NextResponse.json({
            quick_login_enabled: setting ? setting.value === 'true' : false
        });
    } catch (e) {
        console.error('System Settings API Error:', e);
        return NextResponse.json({ quick_login_enabled: false });
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
