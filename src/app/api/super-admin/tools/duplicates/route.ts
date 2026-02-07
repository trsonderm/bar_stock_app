import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Define the logic for different types
const TYPES = {
    items: {
        table: 'item_names',
        column: 'name',
        related: [
            { table: 'inventory', fk: 'item_name_id' },
            { table: 'inventory_snapshots', fk: 'item_name_id' }
        ]
    }
};

export async function GET(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as keyof typeof TYPES;
    const organizationId = searchParams.get('organizationId');

    if (!type || !TYPES[type]) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    if (!organizationId) return NextResponse.json({ error: 'Org ID required' }, { status: 400 });

    try {
        const config = TYPES[type];

        // Find names that appear more than once (case insensitive)
        const duplicates = await db.query(`
            SELECT lower(${config.column}) as norm_name, array_agg(id) as ids, array_agg(${config.column}) as names
            FROM ${config.table}
            WHERE organization_id = $1
            GROUP BY lower(${config.column})
            HAVING count(*) > 1
        `, [organizationId]);

        return NextResponse.json({ duplicates });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { type, keepId, mergeIds } = await req.json();
        const config = TYPES[type as keyof typeof TYPES];

        if (!config || !keepId || !mergeIds || !Array.isArray(mergeIds) || mergeIds.length === 0) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        // Transaction
        await db.execute('BEGIN');

        try {
            // 1. Update all related tables to point to keepId
            for (const rel of config.related) {
                // We use ANY($1) for array of IDs
                await db.execute(
                    `UPDATE ${rel.table} SET ${rel.fk} = $1 WHERE ${rel.fk} = ANY($2)`,
                    [keepId, mergeIds]
                );
            }

            // 2. Delete the merged records
            await db.execute(
                `DELETE FROM ${config.table} WHERE id = ANY($1)`,
                [mergeIds]
            );

            await db.execute('COMMIT');
            return NextResponse.json({ success: true });
        } catch (e) {
            await db.execute('ROLLBACK');
            throw e;
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
