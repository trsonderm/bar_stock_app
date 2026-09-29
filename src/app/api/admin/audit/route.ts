/**
 * POST /api/admin/audit
 *
 * Saves a stock audit (physical count). Body: { changes: [{ id, name, oldQty, newQty }], note }.
 * Sets each item's quantity at the user's current location (the same location
 * the audit screen loaded counts from) and logs the difference as an
 * ADD_STOCK / SUBTRACT_STOCK activity with method AUDIT. Requires admin or the
 * `audit` permission.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { changes, note } = await req.json();
    if (!changes || !Array.isArray(changes) || changes.length === 0) {
        return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    // Check permissions
    const canAudit = session.role === 'admin' || session.permissions.includes('audit') || session.permissions.includes('all');
    if (!canAudit) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const cookieLocationId = parseInt(req.cookies.get('current_location_id')?.value || '', 10) || 0;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Same location resolution as GET /api/inventory: the current-location
        // cookie if it belongs to this org, otherwise the org's first location.
        const locRes = await client.query(
            `SELECT id FROM locations WHERE organization_id = $1
             ORDER BY (id = $2) DESC, id ASC LIMIT 1`,
            [session.organizationId, cookieLocationId]
        );
        const locationId = locRes.rows[0]?.id;
        if (!locationId) throw new Error('No location found');

        for (const change of changes) {
            const { id, newQty, oldQty } = change;

            const owned = await client.query('SELECT 1 FROM items WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);
            if (owned.rowCount === 0) continue;

            // 1. Set the counted quantity
            await client.query(`
                INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = $3
            `, [id, locationId, newQty, session.organizationId]);

            // 2. Log each change as a normal stock movement tagged method=AUDIT
            const diff = newQty - oldQty;

            await client.query(`
                INSERT INTO activity_logs (organization_id, user_id, action, details)
                VALUES ($1, $2, $3, $4)
            `, [
                session.organizationId,
                session.id,
                diff > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK',
                JSON.stringify({
                    itemId: id,
                    itemName: change.name,
                    quantity: Math.abs(diff),
                    method: 'AUDIT',
                    locationId,
                    note: note || '',
                    oldQty,
                    newQty
                })
            ]);
        }

        await client.query('COMMIT');
        return NextResponse.json({ success: true });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Audit Error:', e);
        return NextResponse.json({ error: 'Audit Failed' }, { status: 500 });
    } finally {
        client.release();
    }
}
