/**
 * POST /api/super-admin/backups
 *
 * Super admin: runs pg_dump into ./backups and emails a confirmation.
 * Requires the pg_dump client on the host (it is not in the app Docker image).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import { sendEmail } from '@/lib/mail';

const execAsync = util.promisify(exec);

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'backups');
    
    // Ensure backups dir exists
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);
    
    try {
        // Requires the pg_dump client on the server's PATH.
        const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf';
        
        // Custom-format dump (restore with pg_restore --clean)
        const command = `pg_dump --clean --if-exists --format=c --dbname="${dbUrl}" --file="${backupFile}"`;
        await execAsync(command);
        
        await db.query(`
            INSERT INTO activity_logs (organization_id, user_id, action, details)
            VALUES (null, $1, 'MANUAL_DB_BACKUP', $2)
        `, [session.id, JSON.stringify({ file: backupFile })]);

        // Send Email Alert
        await sendEmail('notifications', {
            to: (session as any).email || 'superadmin@topshelfinventory.com',
            subject: 'Database Backup Completed',
            text: `A manual database backup was just completed and stored at: ${backupFile}`,
            html: `<p>A manual database backup was just completed.</p><p><strong>File:</strong> ${backupFile}</p>`
        });

        return NextResponse.json({ success: true, file: backupFile });
    } catch (e: any) {
        console.error('Backup failed:', e);
        
        await sendEmail('notifications', {
            to: 'superadmin@topshelfinventory.com', // Fallback, could grab from users
            subject: 'CRITICAL: Database Backup FAILED',
            text: `A database backup failed to execute: \n\n${e.message}`
        });

        return NextResponse.json({ error: 'pg_dump failed: ' + e.message }, { status: 500 });
    }
}
