/**
 * syslog.ts — persistent server-side logging to the system_logs table.
 *
 * Always falls back to console.* so a pre-migration DB (no system_logs yet)
 * never breaks the calling code.
 *
 * Usage:
 *   import { syslog } from '@/lib/syslog';
 *   await syslog.error('email', 'SMTP send failed', { tier: 'reporting', error: e.message, code: e.code });
 */

import { db } from './db';

type Level    = 'info' | 'warn' | 'error';
type Category = 'email' | 'auth' | 'scheduler' | 'api' | 'system' | 'database' | 'device';

async function write(level: Level, category: Category, message: string, details?: Record<string, any>) {
    // Always mirror to console first so nothing is ever silently lost
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logFn(`[${level.toUpperCase()}][${category}] ${message}`, details ?? '');

    try {
        await db.execute(
            `INSERT INTO system_logs (level, category, message, details)
             VALUES ($1, $2, $3, $4)`,
            [level, category, message, details ? JSON.stringify(details) : null]
        );
    } catch {
        // Table may not exist pre-migration — swallow silently (console already printed above)
    }
}

export const syslog = {
    info:  (category: Category, message: string, details?: Record<string, any>) => write('info',  category, message, details),
    warn:  (category: Category, message: string, details?: Record<string, any>) => write('warn',  category, message, details),
    error: (category: Category, message: string, details?: Record<string, any>) => write('error', category, message, details),
};
