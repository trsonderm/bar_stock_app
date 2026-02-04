import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    // Check if super admin (simplified check: is admin of org 1 or has specific permission? 
    // For now assuming role 'admin' of 'system' org or just check permission 'super_admin'

    // In login route we added `isSuperAdmin`.
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const rows = await db.query('SELECT key, value FROM system_settings');
        const settings: Record<string, string> = {};
        rows.forEach((r: any) => settings[r.key] = r.value);
        return NextResponse.json({ settings });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        // Body is key-value pairs
        for (const [key, value] of Object.entries(body)) {
            await db.execute(
                'INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
                [key, value]
            );
        }
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
