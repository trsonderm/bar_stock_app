import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const TYPES = {
    inventory_items: {
        table: 'inventory',
        fk: 'item_name_id',
        parentTable: 'item_names',
        parentPk: 'id',
        display: 'id' // What col to show for context? maybe id is enough
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

        // Find records where fk is NOT NULL but does not exist in parent table
        const orphans = await db.query(`
            SELECT t.*
            FROM ${config.table} t
            LEFT JOIN ${config.parentTable} p ON t.${config.fk} = p.${config.parentPk}
            WHERE t.organization_id = $1
            AND t.${config.fk} IS NOT NULL
            AND p.${config.parentPk} IS NULL
        `, [organizationId]);

        return NextResponse.json({ orphans });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { type, fixAction, orphanIds, targetId } = await req.json();
        const config = TYPES[type as keyof typeof TYPES];

        if (!config || !orphanIds || !Array.isArray(orphanIds)) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        if (fixAction === 'delete') {
            await db.execute(
                `DELETE FROM ${config.table} WHERE id = ANY($1)`,
                [orphanIds]
            );
        } else if (fixAction === 'link' && targetId) {
            await db.execute(
                `UPDATE ${config.table} SET ${config.fk} = $1 WHERE id = ANY($2)`,
                [targetId, orphanIds]
            );
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
