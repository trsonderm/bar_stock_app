import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }

        const itemId = searchParams.get('itemId');
        if (!itemId) {
            return NextResponse.json({ error: 'itemId required' }, { status: 400 });
        }

        // Verify item belongs to org
        const item = await db.one('SELECT id FROM items WHERE id = $1 AND organization_id = $2', [itemId, organizationId]);
        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        // Return quantity for every location in this org (0 if no inventory record yet)
        const rows = await db.query(`
            SELECT
                l.id   AS location_id,
                l.name AS location_name,
                COALESCE(inv.quantity, 0) AS quantity
            FROM locations l
            LEFT JOIN inventory inv ON inv.location_id = l.id AND inv.item_id = $1
            WHERE l.organization_id = $2
            ORDER BY l.id ASC
        `, [itemId, organizationId]);

        return NextResponse.json({ quantities: rows });
    } catch (e: any) {
        console.error('item-quantities GET error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
