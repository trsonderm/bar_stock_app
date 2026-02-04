import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Items where quantity <= par_level
        const lowStock = await db.query(`
            SELECT i.name, i.type, inv.quantity, inv.par_level, l.name as location
            FROM inventory inv
            JOIN items i ON inv.item_id = i.id
            JOIN locations l ON inv.location_id = l.id
            WHERE inv.organization_id = $1 AND inv.quantity <= inv.par_level
            ORDER BY inv.quantity ASC
        `, [session.organizationId]);

        return NextResponse.json({ data: lowStock });
    } catch (e) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
