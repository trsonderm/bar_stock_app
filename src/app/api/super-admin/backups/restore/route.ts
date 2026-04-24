import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = util.promisify(exec);

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

    try {
        if (file) {
            // Uploaded file — write to temp
            const bytes = await file.arrayBuffer();
            tmpPath = path.join(os.tmpdir(), `restore-${Date.now()}.sql`);
            fs.writeFileSync(tmpPath, Buffer.from(bytes));
            cleanup = true;
        } else if (existingFile) {
            // Existing backup on disk
            if (existingFile.includes('..') || existingFile.includes('/')) {
                return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
            }
            const backupDir = path.join(process.cwd(), 'backups');
            tmpPath = path.join(backupDir, existingFile);
            if (!tmpPath.startsWith(backupDir) || !fs.existsSync(tmpPath)) {
                return NextResponse.json({ error: 'Backup file not found' }, { status: 404 });
            }
        } else {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        await execAsync(`psql --no-password --dbname="${dbUrl}" --file="${tmpPath}"`);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[Restore] psql error:', e);
        return NextResponse.json({ error: 'Restore failed: ' + e.message }, { status: 500 });
    } finally {
        if (cleanup && tmpPath && fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
        }
    }
}
