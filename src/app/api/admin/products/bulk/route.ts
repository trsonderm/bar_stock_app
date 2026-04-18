import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        const { item_ids, updates } = body as {
            item_ids: number[];
            updates: {
                type?: string;
                secondary_type?: string | null;
                supplier_id?: number | null;
                global_supplier?: string | null;
                assigned_locations?: number[];
            };
        };

        if (!item_ids?.length) {
            return NextResponse.json({ error: 'No items selected' }, { status: 400 });
        }

        // Verify all items belong to this org
        const owned = await db.query(
            `SELECT id FROM items WHERE id = ANY($1::int[]) AND organization_id = $2`,
            [item_ids, session.organizationId]
        );
        if (owned.length !== item_ids.length) {
            return NextResponse.json({ error: 'Some items not found' }, { status: 404 });
        }

        const setClauses: string[] = [];
        const params: any[] = [];
        let pIdx = 1;

        if (updates.type !== undefined) {
            setClauses.push(`type = $${pIdx++}`);
            params.push(updates.type);
        }
        if ('secondary_type' in updates) {
            setClauses.push(`secondary_type = $${pIdx++}`);
            // null means clear; undefined means not included (guarded by 'in' check above)
            params.push(updates.secondary_type ?? null);
        }
        if ('supplier_id' in updates) {
            setClauses.push(`supplier_id = $${pIdx++}`);
            params.push(updates.supplier_id ?? null);
        }
        if ('global_supplier' in updates) {
            setClauses.push(`supplier = $${pIdx++}`);
            params.push(updates.global_supplier ?? null);
        }

        if (setClauses.length === 0 && !('assigned_locations' in updates)) {
            return NextResponse.json({ error: 'No updates specified' }, { status: 400 });
        }

        if (setClauses.length > 0) {
            params.push(item_ids, session.organizationId);
            await db.execute(
                `UPDATE items SET ${setClauses.join(', ')} WHERE id = ANY($${pIdx}::int[]) AND organization_id = $${pIdx + 1}`,
                params
            );
        }

        // Handle assigned_locations: update item_locations join table
        if ('assigned_locations' in updates && Array.isArray(updates.assigned_locations)) {
            // Delete all current location assignments for these items in one query
            await db.execute(
                `DELETE FROM item_locations WHERE item_id = ANY($1::int[]) AND location_id IN (
                    SELECT id FROM locations WHERE organization_id = $2
                )`,
                [item_ids, session.organizationId]
            );
            // Bulk insert new assignments
            if (updates.assigned_locations.length > 0) {
                const insertValues = item_ids.flatMap(itemId =>
                    updates.assigned_locations!.map(locId => `(${itemId}, ${locId})`)
                ).join(', ');
                await db.execute(
                    `INSERT INTO item_locations (item_id, location_id) VALUES ${insertValues} ON CONFLICT DO NOTHING`
                );
            }
        }

        return NextResponse.json({ success: true, updated: item_ids.length });
    } catch (err: any) {
        console.error('Bulk update error:', err);
        return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
    }
}
