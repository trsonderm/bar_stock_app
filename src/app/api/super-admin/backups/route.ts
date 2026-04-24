import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { scheduler } from '@/lib/scheduler';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const backups = scheduler.getBackups();
    return NextResponse.json({ backups });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const filename = await scheduler.runBackup();

        await db.execute(
            `INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES (null, $1, 'MANUAL_DB_BACKUP', $2)`,
            [session.id, JSON.stringify({ file: filename })]
        ).catch(() => {});

        return NextResponse.json({ success: true, file: filename });
    } catch (e: any) {
        console.error('[Backup] Manual backup failed:', e);
        return NextResponse.json({ error: 'Backup failed: ' + e.message }, { status: 500 });
    }
}
