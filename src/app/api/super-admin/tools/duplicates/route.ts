import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// item_names duplicate detection
const NAME_TYPES: Record<string, { table: string; column: string; related: { table: string; fk: string }[] }> = {
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
    const type = searchParams.get('type');
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) return NextResponse.json({ error: 'Org ID required' }, { status: 400 });

    try {
        // ── Inventory row duplicates (same item_id + location_id in same org) ──
        if (type === 'inventory') {
            const rows = await db.query(`
                SELECT
                    inv.item_id,
                    i.name AS item_name,
                    inv.location_id,
                    l.name AS location_name,
                    json_agg(json_build_object('id', inv.id, 'quantity', inv.quantity) ORDER BY inv.id) AS rows
                FROM inventory inv
                JOIN items i ON i.id = inv.item_id
                JOIN locations l ON l.id = inv.location_id
                WHERE inv.organization_id = $1
                GROUP BY inv.item_id, i.name, inv.location_id, l.name
                HAVING count(*) > 1
                ORDER BY inv.item_id, inv.location_id
            `, [organizationId]);
            return NextResponse.json({ duplicates: rows });
        }

        // ── Item name duplicates ──
        const config = NAME_TYPES[type as string];
        if (!config) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

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
        const { type, keepId, mergeIds, mergeStrategy = 'sum' } = await req.json();

        if (!keepId || !mergeIds || !Array.isArray(mergeIds) || mergeIds.length === 0) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        await db.execute('BEGIN');
        try {
            if (type === 'inventory') {
                const allIds = [keepId, ...mergeIds];
                let newQty: string;
                if (mergeStrategy === 'sum') {
                    newQty = `(SELECT COALESCE(SUM(quantity), 0) FROM inventory WHERE id = ANY($1))`;
                } else if (mergeStrategy === 'avg') {
                    newQty = `(SELECT ROUND(AVG(quantity)) FROM inventory WHERE id = ANY($1))`;
                } else if (mergeStrategy === 'min') {
                    newQty = `(SELECT MIN(quantity) FROM inventory WHERE id = ANY($1))`;
                } else {
                    // overwrite: keep the chosen row's quantity unchanged, just delete the rest
                    newQty = `(SELECT quantity FROM inventory WHERE id = $2)`;
                }

                if (mergeStrategy === 'overwrite') {
                    // No quantity update needed — kept row already has the right value
                } else {
                    await db.execute(
                        `UPDATE inventory SET quantity = ${newQty} WHERE id = $2`,
                        [allIds, keepId]
                    );
                }
                await db.execute(`DELETE FROM inventory WHERE id = ANY($1)`, [mergeIds]);
            } else {
                const config = NAME_TYPES[type];
                if (!config) {
                    await db.execute('ROLLBACK');
                    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
                }
                for (const rel of config.related) {
                    await db.execute(
                        `UPDATE ${rel.table} SET ${rel.fk} = $1 WHERE ${rel.fk} = ANY($2)`,
                        [keepId, mergeIds]
                    );
                }
                await db.execute(`DELETE FROM ${config.table} WHERE id = ANY($1)`, [mergeIds]);
            }

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
