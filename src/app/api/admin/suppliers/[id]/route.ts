import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supplierId = params.id;

    try {
        // Fetch Supplier Details
        const supplier = await db.one(
            'SELECT * FROM suppliers WHERE id = $1 AND organization_id = $2',
            [supplierId, session.organizationId]
        );

        if (!supplier) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // Fetch Linked Items
        const linkedItems = await db.query(`
            SELECT 
                i.id as item_id, 
                i.name as item_name,
                is_sup.cost_per_unit,
                is_sup.supplier_sku,
                is_sup.is_preferred
            FROM item_suppliers is_sup
            JOIN items i ON is_sup.item_id = i.id
            WHERE is_sup.supplier_id = $1
            ORDER BY i.name ASC
        `, [supplierId]);

        return NextResponse.json({ supplier, linkedItems });
    } catch (e) {
        console.error('Get Supplier Details Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await db.execute(
            'DELETE FROM suppliers WHERE id = $1 AND organization_id = $2',
            [params.id, session.organizationId]
        );
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
