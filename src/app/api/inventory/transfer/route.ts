import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const canTransfer =
        session.role === 'admin' ||
        (session.permissions as string[]).includes('add_stock') ||
        (session.permissions as string[]).includes('all');
    if (!canTransfer) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const { fromLocationId, toLocationId, items } = await req.json();
    // items: { itemId: number, quantity: number }[]

    if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) {
        return NextResponse.json({ error: 'Invalid locations' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'No items to transfer' }, { status: 400 });
    }

    // Verify both locations belong to this org
    const locs = await db.query(
        'SELECT id FROM locations WHERE id = ANY($1) AND organization_id = $2',
        [[fromLocationId, toLocationId], session.organizationId]
    );
    if (locs.length < 2) return NextResponse.json({ error: 'Invalid locations' }, { status: 400 });

    await db.execute('BEGIN');
    try {
        for (const { itemId, quantity } of items) {
            if (!itemId || quantity <= 0) continue;

            // Check source has enough
            const src = await db.one(
                'SELECT quantity FROM inventory WHERE item_id=$1 AND location_id=$2 AND organization_id=$3',
                [itemId, fromLocationId, session.organizationId]
            );
            const available = parseFloat(src?.quantity ?? '0');
            if (available < quantity) {
                await db.execute('ROLLBACK');
                const item = await db.one('SELECT name FROM items WHERE id=$1', [itemId]);
                return NextResponse.json(
                    { error: `Insufficient stock for "${item?.name || itemId}": have ${available}, need ${quantity}` },
                    { status: 400 }
                );
            }

            // Deduct from source
            await db.execute(
                'UPDATE inventory SET quantity = quantity - $1 WHERE item_id=$2 AND location_id=$3 AND organization_id=$4',
                [quantity, itemId, fromLocationId, session.organizationId]
            );

            // Add to destination (upsert)
            await db.execute(
                `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                 VALUES ($1,$2,$3,$4)
                 ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = inventory.quantity + $3`,
                [itemId, toLocationId, quantity, session.organizationId]
            );
        }

        // Log the transfer
        await db.execute(
            `INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1,$2,$3,$4)`,
            [
                session.organizationId,
                session.id,
                'TRANSFER_STOCK',
                JSON.stringify({ fromLocationId, toLocationId, items }),
            ]
        );

        await db.execute('COMMIT');
        return NextResponse.json({ success: true, transferred: items.length });
    } catch (e) {
        await db.execute('ROLLBACK');
        console.error('[transfer]', e);
        return NextResponse.json({ error: 'Transfer failed' }, { status: 500 });
    }
}
