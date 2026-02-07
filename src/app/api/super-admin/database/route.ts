import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    try {
        if (action === 'tables') {
            const tables = await db.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            `);
            return NextResponse.json({ tables: tables.map((t: any) => t.table_name) });
        }

        const table = searchParams.get('table');
        if (!table) return NextResponse.json({ error: 'Table required' }, { status: 400 });

        // Validate table exists to prevent injection
        const validTables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        if (!validTables.find((t: any) => t.table_name === table)) {
            return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
        }

        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Fetch Columns
        const columns = await db.query(`
            SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [table]);

        const hasOrgId = columns.some((c: any) => c.column_name === 'organization_id');
        const organizationId = searchParams.get('organizationId');

        // Detect Primary Key
        const pkRes = await db.query(`
            SELECT kcu.column_name
            FROM information_schema.table_constraints tco
            JOIN information_schema.key_column_usage kcu 
              ON kcu.constraint_name = tco.constraint_name
              AND kcu.table_schema = tco.table_schema
              AND kcu.table_name = tco.table_name
            WHERE tco.constraint_type = 'PRIMARY KEY'
            AND kcu.table_name = $1
        `, [table]);
        const pk = pkRes.length > 0 ? pkRes[0].column_name : 'id';

        // Fetch Data
        let query = `SELECT * FROM "${table}"`;
        const params: any[] = [];

        if (hasOrgId && organizationId) {
            query += ` WHERE organization_id = $1`;
            params.push(organizationId);
        }

        query += ` ORDER BY "${pk}" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const rows = await db.query(query, params);

        let countQuery = `SELECT COUNT(*) as c FROM "${table}"`;
        let countParams: any[] = [];
        if (hasOrgId && organizationId) {
            countQuery += ` WHERE organization_id = $1`;
            countParams.push(organizationId);
        }
        const count = await db.one(countQuery, countParams);

        return NextResponse.json({
            columns,
            rows,
            pk,
            total: parseInt(count.c)
        });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    // Insert New Row
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { table, data } = body; // data is { col: val }

        // Sanitize Table
        const validTables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        if (!validTables.find((t: any) => t.table_name === table)) {
            return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
        }

        const cols = Object.keys(data);
        const vals = Object.values(data);

        // Construct Query
        // INSERT INTO "table" ("col1", "col2") VALUES ($1, $2)
        const colStr = cols.map(c => `"${c}"`).join(', ');
        const valStr = cols.map((_, i) => `$${i + 1}`).join(', ');

        await db.execute(
            `INSERT INTO "${table}" (${colStr}) VALUES (${valStr})`,
            vals
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Insert Failed' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    // Update Row
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { table, pk, id, updates } = body; // pk is primary key col name, id is value

        // Sanitize Table
        const validTables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        if (!validTables.find((t: any) => t.table_name === table)) {
            return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
        }

        const cols = Object.keys(updates);
        const vals = Object.values(updates);

        // UPDATE "table" SET "col" = $1 WHERE "pk" = $2
        const setStr = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');

        await db.execute(
            `UPDATE "${table}" SET ${setStr} WHERE "${pk}" = $${cols.length + 1}`,
            [...vals, id]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Update Failed' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { table, pk, id } = body;

        // Sanitize Table
        const validTables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        if (!validTables.find((t: any) => t.table_name === table)) {
            return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
        }

        await db.execute(`DELETE FROM "${table}" WHERE "${pk}" = $1`, [id]);
        return NextResponse.json({ success: true });

    } catch (e: any) {
        // FK Violation likely
        return NextResponse.json({ error: e.message || 'Delete Failed (Foreign Key?)' }, { status: 500 });
    }
}
