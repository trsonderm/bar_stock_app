import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await db.query("SELECT value FROM system_settings WHERE key = 'chat_available'");
        const isAvailable = result.length > 0 ? result[0].value === 'true' : false;

        return NextResponse.json({ available: isAvailable });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
