
import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logActivity } from '@/lib/logger';

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

    const client = await pool.connect(); // Use transaction

    try {
        await client.query('BEGIN');

        for (const change of changes) {
            const { id, newQty, oldQty } = change;

            // 1. Update Inventory
            // First get location (assuming default location for now as per app logic)
            // Ideally should be passed from frontend, but we default to org's first location
            const locRes = await client.query('SELECT id FROM locations WHERE organization_id = $1 LIMIT 1', [session.organizationId]);
            const locationId = locRes.rows[0]?.id;

            if (!locationId) throw new Error('No location found');

            await client.query(`
                INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = $3
            `, [id, locationId, newQty, session.organizationId]);

            // 2. Log Activity (Type = audit)
            // Log individually or one big log? 
            // "Type: Normal" vs "Type: Audit". 
            // Let's log individual changes but marked as audit.
            const diff = newQty - oldQty;

            await client.query(`
                INSERT INTO activity_logs (organization_id, user_id, action, type, details)
                VALUES ($1, $2, $3, 'audit', $4)
            `, [
                session.organizationId,
                session.id,
                diff > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK',
                JSON.stringify({
                    itemId: id,
                    itemName: change.name,
                    quantity: Math.abs(diff),
                    method: 'AUDIT',
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
