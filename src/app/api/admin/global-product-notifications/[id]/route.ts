import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notifId = parseInt(params.id);
    const { action } = await req.json(); // 'ignore' | 'update'

    const notif = await db.one(
        'SELECT * FROM global_product_notifications WHERE id = $1 AND organization_id = $2',
        [notifId, session.organizationId]
    );
    if (!notif) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (action === 'ignore') {
        await db.execute(
            `UPDATE global_product_notifications
             SET status = 'ignored', resolved_at = NOW()
             WHERE id = $1`,
            [notifId]
        );
        return NextResponse.json({ ok: true });
    }

    if (action === 'update') {
        // Apply the changed fields to the linked item
        if (!notif.item_id) {
            await db.execute(
                `UPDATE global_product_notifications SET status = 'updated', resolved_at = NOW() WHERE id = $1`,
                [notifId]
            );
            return NextResponse.json({ ok: true, note: 'No linked item to update' });
        }

        const changes: Record<string, { from: any; to: any }> = notif.changes;
        const updates: string[] = [];
        const vals: any[] = [];
        let idx = 1;

        for (const [field, diff] of Object.entries(changes)) {
            switch (field) {
                case 'name':
                    updates.push(`name = $${idx++}`); vals.push(diff.to); break;
                case 'category_name':
                    updates.push(`type = $${idx++}`); vals.push(diff.to); break;
                case 'bottle_size_amount':
                    updates.push(`bottle_size_amount = $${idx++}`); vals.push(diff.to); break;
                case 'bottle_size_unit':
                    updates.push(`bottle_size_unit = $${idx++}`); vals.push(diff.to); break;
                case 'order_size':
                    updates.push(`order_size = $${idx++}`); vals.push(JSON.stringify(diff.to)); break;
                case 'aliases':
                    updates.push(`aliases = $${idx++}`); vals.push(JSON.stringify(diff.to)); break;
                case 'is_alcohol':
                    updates.push(`is_alcohol = $${idx++}`); vals.push(diff.to); break;
                case 'barcodes':
                    updates.push(`barcodes = $${idx++}`); vals.push(JSON.stringify(diff.to)); break;
            }
        }

        if (updates.length > 0) {
            vals.push(notif.item_id, session.organizationId);
            await db.execute(
                `UPDATE items SET ${updates.join(', ')}
                 WHERE id = $${idx} AND organization_id = $${idx + 1}`,
                vals
            ).catch(e => console.warn('[global-product-notifications update]', e.message));
        }

        await db.execute(
            `UPDATE global_product_notifications SET status = 'updated', resolved_at = NOW() WHERE id = $1`,
            [notifId]
        );
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
