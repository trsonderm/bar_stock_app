import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        let body: any;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const item_ids: number[] = Array.isArray(body?.item_ids) ? body.item_ids.map(Number).filter((n: number) => !isNaN(n)) : [];
        const updates: Record<string, any> = (body?.updates && typeof body.updates === 'object') ? body.updates : {};

        if (item_ids.length === 0) {
            return NextResponse.json({ error: 'No items selected' }, { status: 400 });
        }

        const orgId: number = Number(session.organizationId);

        // Verify all items belong to this org
        const owned = await db.query(
            `SELECT id FROM items WHERE id = ANY($1::int[]) AND organization_id = $2`,
            [item_ids, orgId]
        );
        if (owned.length !== item_ids.length) {
            return NextResponse.json({ error: `${owned.length}/${item_ids.length} items found — some may not belong to this org` }, { status: 404 });
        }

        const setClauses: string[] = [];
        const params: any[] = [];
        let pIdx = 1;

        if ('type' in updates && updates.type !== undefined) {
            setClauses.push(`type = $${pIdx++}`);
            params.push(String(updates.type));
        }
        if ('secondary_type' in updates) {
            setClauses.push(`secondary_type = $${pIdx++}`);
            params.push(updates.secondary_type != null ? String(updates.secondary_type) : null);
        }
        if ('supplier_id' in updates) {
            const sid = updates.supplier_id != null ? parseInt(String(updates.supplier_id), 10) : null;
            setClauses.push(`supplier_id = $${pIdx++}`);
            params.push(!isNaN(sid as number) ? sid : null);
        }
        if ('global_supplier' in updates) {
            setClauses.push(`supplier = $${pIdx++}`);
            params.push(updates.global_supplier != null ? String(updates.global_supplier) : null);
        }

        const hasLocationUpdate = 'assigned_locations' in updates && Array.isArray(updates.assigned_locations);

        if (setClauses.length === 0 && !hasLocationUpdate) {
            return NextResponse.json({ error: 'No updates specified' }, { status: 400 });
        }

        if (setClauses.length > 0) {
            params.push(item_ids, orgId);
            await db.execute(
                `UPDATE items SET ${setClauses.join(', ')} WHERE id = ANY($${pIdx}::int[]) AND organization_id = $${pIdx + 1}`,
                params
            );
        }

        if (hasLocationUpdate) {
            const locIds: number[] = (updates.assigned_locations as any[]).map(Number).filter((n: number) => !isNaN(n));

            await db.execute(
                `DELETE FROM item_locations WHERE item_id = ANY($1::int[]) AND location_id IN (
                    SELECT id FROM locations WHERE organization_id = $2
                )`,
                [item_ids, orgId]
            );

            if (locIds.length > 0) {
                // Build parameterized bulk insert
                const placeholders: string[] = [];
                const insParams: number[] = [];
                let insIdx = 1;
                for (const itemId of item_ids) {
                    for (const locId of locIds) {
                        placeholders.push(`($${insIdx++}, $${insIdx++})`);
                        insParams.push(itemId, locId);
                    }
                }
                await db.execute(
                    `INSERT INTO item_locations (item_id, location_id) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
                    insParams
                );
            }
        }

        return NextResponse.json({ success: true, updated: item_ids.length });
    } catch (err: any) {
        console.error('Bulk update error:', err);
        return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
    }
}
