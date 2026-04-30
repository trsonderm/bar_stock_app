import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function auth() {
    const session = await getSession();
    return session?.isSuperAdmin;
}

export async function GET(req: NextRequest) {
    if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const action = req.nextUrl.searchParams.get('action');

    if (action === 'stats') {
        // Table bloat stats + last vacuum/analyze times
        const tableStats = await db.query(`
            SELECT
                schemaname,
                relname AS table_name,
                n_live_tup AS live_rows,
                n_dead_tup AS dead_rows,
                CASE WHEN n_live_tup > 0
                    THEN ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1)
                    ELSE 0 END AS bloat_pct,
                last_vacuum,
                last_autovacuum,
                last_analyze,
                last_autoanalyze,
                pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS total_size,
                pg_total_relation_size(quote_ident(relname)) AS total_size_bytes
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            ORDER BY bloat_pct DESC, total_size_bytes DESC
        `);

        const indexStats = await db.query(`
            SELECT
                t.relname AS table_name,
                ix.relname AS index_name,
                pg_size_pretty(pg_relation_size(ix.oid)) AS index_size,
                pg_relation_size(ix.oid) AS index_size_bytes,
                idx_scan,
                idx_tup_read,
                idx_tup_fetch
            FROM pg_stat_user_indexes si
            JOIN pg_index i ON si.indexrelid = i.indexrelid
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_class ix ON ix.oid = i.indexrelid
            WHERE si.schemaname = 'public'
            ORDER BY index_size_bytes DESC
        `);

        const dbSize = await db.one(`
            SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
                   pg_database_size(current_database()) AS size_bytes
        `);

        return NextResponse.json({ tableStats, indexStats, dbSize });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
    if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { action, table } = await req.json();

    // Validate table name to prevent injection
    if (table) {
        const valid = await db.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
            [table]
        );
        if (valid.length === 0) return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
    }

    const target = table ? `"${table}"` : '';

    try {
        if (action === 'vacuum') {
            await db.execute(`VACUUM ANALYZE ${target}`);
            return NextResponse.json({ ok: true, message: `VACUUM ANALYZE completed${table ? ` on ${table}` : ' on all tables'}` });
        }
        if (action === 'analyze') {
            await db.execute(`ANALYZE ${target}`);
            return NextResponse.json({ ok: true, message: `ANALYZE completed${table ? ` on ${table}` : ' on all tables'}` });
        }
        if (action === 'reindex') {
            if (!table) return NextResponse.json({ error: 'Table required for REINDEX' }, { status: 400 });
            await db.execute(`REINDEX TABLE "${table}"`);
            return NextResponse.json({ ok: true, message: `REINDEX completed on ${table}` });
        }
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
