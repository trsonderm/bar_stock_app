import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const mode = searchParams.get('mode');

        // ── Meta mode: return distinct filter options ─────────────────────────
        if (mode === 'meta') {
            const [usersRes, actionsRes, locationsRes] = await Promise.all([
                db.query(`
                    SELECT DISTINCT u.id, u.first_name || ' ' || COALESCE(u.last_name, '') AS name
                    FROM activity_logs l
                    JOIN users u ON u.id = l.user_id
                    WHERE l.organization_id = $1
                    ORDER BY name ASC
                `, [session.organizationId]),
                db.query(`
                    SELECT DISTINCT action FROM activity_logs
                    WHERE organization_id = $1
                    ORDER BY action ASC
                `, [session.organizationId]),
                db.query(`
                    SELECT DISTINCT loc.id, loc.name
                    FROM activity_logs l
                    JOIN locations loc ON loc.id = (l.details->>'locationId')::int
                    WHERE l.organization_id = $1
                    ORDER BY loc.name ASC
                `, [session.organizationId]),
            ]);
            return NextResponse.json({
                users: usersRes,
                actions: actionsRes.map((r: any) => r.action),
                locations: locationsRes,
            });
        }

        // ── Main query mode ───────────────────────────────────────────────────
        const start = searchParams.get('start');
        const end = searchParams.get('end');
        if (!start || !end) return NextResponse.json({ error: 'Missing date range' }, { status: 400 });

        const userId = searchParams.get('userId');
        const action = searchParams.get('action');
        const locationId = searchParams.get('locationId');
        const search = searchParams.get('search')?.toLowerCase() || '';

        const startStr = start.length === 10 ? start + 'T00:00:00' : start;
        const endStr = end.length === 10 ? end + 'T23:59:59.999' : end;

        const params: any[] = [session.organizationId, startStr, endStr];
        const conditions: string[] = [
            'l.organization_id = $1',
            'l.timestamp >= $2',
            'l.timestamp <= $3',
        ];

        if (userId) { params.push(parseInt(userId)); conditions.push(`l.user_id = $${params.length}`); }
        if (action) { params.push(action); conditions.push(`l.action = $${params.length}`); }
        if (locationId) { params.push(parseInt(locationId)); conditions.push(`(l.details->>'locationId')::int = $${params.length}`); }

        const logs = await db.query(`
            SELECT
                l.id, l.action, l.details, l.timestamp,
                u.id   AS user_id,
                TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')) AS user_name,
                loc.name AS location_name,
                i.name   AS db_item_name
            FROM activity_logs l
            LEFT JOIN users     u   ON u.id  = l.user_id
            LEFT JOIN locations loc ON loc.id = (l.details->>'locationId')::int
            LEFT JOIN items     i   ON i.id  = (l.details->>'itemId')::int
            WHERE ${conditions.join(' AND ')}
            ORDER BY l.timestamp DESC
            LIMIT 2000
        `, params);

        const ACTION_LABELS: Record<string, string> = {
            ADD_STOCK: 'Stock Added',
            SUBTRACT_STOCK: 'Stock Removed',
            AUDIT: 'Audit',
            TRANSFER_IN: 'Transfer In',
            TRANSFER_OUT: 'Transfer Out',
            ORDER_SUBMITTED: 'Order Submitted',
            ORDER_RECEIVED: 'Order Received',
            MANUAL_DB_BACKUP: 'DB Backup',
            CHECK_IN: 'Check-In',
            SHIFT_CLOSE: 'Shift Close',
        };

        const rows = logs
            .map((log: any) => {
                let details: any = {};
                try { details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {}); } catch { }
                const itemName = details.itemName || log.db_item_name || '';
                const change = details.change ?? details.quantity ?? null;
                const quantityAfter = details.quantityAfter ?? null;
                const label = ACTION_LABELS[log.action] || log.action;
                const row = {
                    id: log.id,
                    timestamp: log.timestamp,
                    user_id: log.user_id,
                    user_name: log.user_name || 'System',
                    action: log.action,
                    action_label: label,
                    item_name: itemName,
                    change,
                    quantity_after: quantityAfter,
                    location_name: log.location_name || details.locationName || '',
                    details,
                };
                return row;
            })
            .filter((r: any) => {
                if (!search) return true;
                return (
                    r.user_name.toLowerCase().includes(search) ||
                    r.action_label.toLowerCase().includes(search) ||
                    r.item_name.toLowerCase().includes(search) ||
                    (r.location_name || '').toLowerCase().includes(search)
                );
            });

        return NextResponse.json({ logs: rows, total: rows.length });
    } catch (e) {
        console.error('[Query]', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
