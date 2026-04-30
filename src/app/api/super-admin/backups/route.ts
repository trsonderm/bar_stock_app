import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { scheduler } from '@/lib/scheduler';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = '/backups';

function loadMeta(backupFilename: string): any | null {
    const metaPath = path.join(BACKUP_DIR, backupFilename.replace(/\.sql\.gz$/, '.meta.json'));
    try {
        if (fs.existsSync(metaPath)) {
            return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        }
    } catch {}
    return null;
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const backups = scheduler.getBackups();

    // Enrich each backup with metadata if available
    const enriched = backups.map((b: any) => {
        const meta = loadMeta(b.name);
        return {
            ...b,
            meta: meta || null,
        };
    });

    return NextResponse.json({ backups: enriched });
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
