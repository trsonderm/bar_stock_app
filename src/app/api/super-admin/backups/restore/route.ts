import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = util.promisify(exec);
const BACKUP_DIR = '/backups';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const existingFile = formData.get('filename') as string | null;

    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl) return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });

    let tmpPath: string | null = null;
    let cleanup = false;
    let isGzipped = false;

    try {
        if (file) {
            isGzipped = file.name.endsWith('.gz');
            const ext = isGzipped ? '.sql.gz' : '.sql';
            const bytes = await file.arrayBuffer();
            tmpPath = path.join(os.tmpdir(), `restore-${Date.now()}${ext}`);
            fs.writeFileSync(tmpPath, Buffer.from(bytes));
            cleanup = true;
        } else if (existingFile) {
            if (existingFile.includes('..') || existingFile.includes('/')) {
                return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
            }
            tmpPath = path.join(BACKUP_DIR, existingFile);
            if (!tmpPath.startsWith(BACKUP_DIR) || !fs.existsSync(tmpPath)) {
                return NextResponse.json({ error: 'Backup file not found' }, { status: 404 });
            }
            isGzipped = existingFile.endsWith('.gz');
        } else {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // For existing backup files that are already in /backups (mounted volume),
        // pipe through psql directly. For uploaded tmp files use psql --file.
        const cmd = isGzipped
            ? `gunzip -c "${tmpPath}" | psql --no-password --dbname="${dbUrl}"`
            : `psql --no-password --dbname="${dbUrl}" --file="${tmpPath}"`;

        const { stderr } = await execAsync(cmd, { shell: '/bin/sh' });
        if (stderr && /ERROR:/i.test(stderr)) {
            console.warn('[Restore] psql stderr:', stderr.slice(0, 500));
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[Restore] error:', e);
        return NextResponse.json({ error: 'Restore failed: ' + e.message }, { status: 500 });
    } finally {
        if (cleanup && tmpPath && fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
        }
    }
}
