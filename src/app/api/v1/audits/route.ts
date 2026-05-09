/**
 * GET  /api/v1/audits  — list audit history sessions
 * POST /api/v1/audits  — create an audit (set actual quantities for items)
 *
 * GET query params:
 *   limit   integer (default 50, max 200)
 *   offset  integer (default 0)
 *
 * POST body:
 *   location_id  integer  required
 *   items        array    required  [{ item_id, actual_quantity, note? }]
 *   label        string   optional  Label for this audit session
 */
import { NextRequest } from 'next/server';
import { pool, db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiOk, apiList, Err } from '@/lib/api-response';

export async function GET(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'audits:read')) return Err.forbidden('audits:read');

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Group audit logs by (user, timestamp minute) to form sessions
    const rows = await db.query(`
        SELECT
            MIN(al.id) AS session_id,
            al.user_id,
            u.first_name || ' ' || u.last_name AS auditor_name,
            DATE_TRUNC('minute', al.timestamp) AS audited_at,
            COUNT(*) AS item_count
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.organization_id = $1 AND al.action = 'AUDIT'
        GROUP BY al.user_id, DATE_TRUNC('minute', al.timestamp), u.first_name, u.last_name
        ORDER BY audited_at DESC
        LIMIT $2 OFFSET $3
    `, [session.organizationId, limit, offset]);

    const total = await db.one(
        `SELECT COUNT(DISTINCT DATE_TRUNC('minute', timestamp)) AS total
         FROM activity_logs WHERE organization_id = $1 AND action = 'AUDIT'`,
        [session.organizationId]
    );

    return apiList(
        rows.map(r => ({
            session_id: r.session_id,
            auditor_name: r.auditor_name,
            audited_at: r.audited_at,
            item_count: Number(r.item_count),
        })),
        { total: Number(total?.total ?? 0), limit, offset },
    );
}

export async function POST(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'audits:write')) return Err.forbidden('audits:write');

    const body = await req.json();
    const { location_id, items, label } = body;

    if (!location_id) return Err.badRequest('location_id is required');
    if (!Array.isArray(items) || items.length === 0) return Err.badRequest('items must be a non-empty array');

    const loc = await db.one(`SELECT id FROM locations WHERE id = $1 AND organization_id = $2`, [location_id, session.organizationId]);
    if (!loc) return Err.notFound('Location');

    const client = await pool.connect();
    const results: any[] = [];

    try {
        await client.query('BEGIN');

        for (const entry of items) {
            const { item_id, actual_quantity, note } = entry;
            if (item_id == null || actual_quantity == null) continue;

            const item = await db.one(`SELECT id, name FROM items WHERE id = $1 AND organization_id = $2`, [item_id, session.organizationId]);
            if (!item) continue;

            // Read current quantity
            const inv = await client.query(
                `SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2`,
                [item_id, location_id]
            );
            const prevQty = inv.rows[0] ? Number(inv.rows[0].quantity) : 0;
            const variance = actual_quantity - prevQty;

            // Set absolute quantity
            await client.query(
                `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (item_id, location_id)
                 DO UPDATE SET quantity = $3, organization_id = $4`,
                [item_id, location_id, actual_quantity, session.organizationId]
            );

            await client.query(
                `INSERT INTO activity_logs (organization_id, user_id, action, details)
                 VALUES ($1, NULL, 'AUDIT', $2)`,
                [session.organizationId, JSON.stringify({
                    itemId: item_id, itemName: item.name,
                    previousQuantity: prevQty, newQuantity: actual_quantity,
                    variance, locationId: location_id,
                    label: label || null, note: note || null,
                    source: 'api', keyId: session.keyId, keyName: session.keyName,
                })]
            );

            results.push({ item_id: Number(item_id), item_name: item.name, previous_quantity: prevQty, actual_quantity: Number(actual_quantity), variance });
        }

        await client.query('COMMIT');
        return apiOk({ location_id: Number(location_id), label: label || null, items_audited: results.length, items: results }, {}, 201);
    } catch (e: any) {
        await client.query('ROLLBACK').catch(() => {});
        return Err.internal(e.message);
    } finally {
        client.release();
    }
}
