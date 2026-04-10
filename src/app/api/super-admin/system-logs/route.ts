import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const limit    = Math.min(parseInt(searchParams.get('limit')    || '100'), 500);
        const offset   = parseInt(searchParams.get('offset')   || '0');
        const level    = searchParams.get('level')    || '';   // info | warn | error
        const category = searchParams.get('category') || '';   // email | auth | etc.
        const search   = searchParams.get('search')   || '';

        const conditions: string[] = [];
        const params: any[] = [];

        if (level) {
            params.push(level);
            conditions.push(`level = $${params.length}`);
        }
        if (category) {
            params.push(category);
            conditions.push(`category = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(message ILIKE $${params.length} OR details::text ILIKE $${params.length})`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        // Total count for pagination
        const countRes = await db.one(
            `SELECT COUNT(*) as count FROM system_logs ${where}`,
            params
        );

        // Fetch page
        const logs = await db.query(
            `SELECT id, level, category, message, details, created_at
             FROM system_logs
             ${where}
             ORDER BY created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        // Category counts for the filter bar
        const categoryCounts = await db.query(
            `SELECT category, level, COUNT(*) as count
             FROM system_logs
             GROUP BY category, level
             ORDER BY category, level`
        );

        return NextResponse.json({
            logs,
            total: parseInt(countRes.count),
            categoryCounts,
        });

    } catch (e: any) {
        console.error('system-logs GET error:', e);
        // If table doesn't exist yet (pre-migration), return empty gracefully
        if (e.message?.includes('system_logs') && e.message?.includes('does not exist')) {
            return NextResponse.json({ logs: [], total: 0, categoryCounts: [], migrationNeeded: true });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const days     = parseInt(searchParams.get('days')     || '30');
        const category = searchParams.get('category') || '';

        let sql    = `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '${days} days'`;
        const params: any[] = [];

        if (category) {
            params.push(category);
            sql += ` AND category = $1`;
        }

        const res = await db.one(
            `WITH deleted AS (${sql} RETURNING id) SELECT COUNT(*) as count FROM deleted`,
            params
        );

        return NextResponse.json({ success: true, deleted: parseInt(res.count) });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
