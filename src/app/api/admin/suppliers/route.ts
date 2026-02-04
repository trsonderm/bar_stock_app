import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const suppliers = await db.query(
            'SELECT * FROM suppliers WHERE organization_id = $1 ORDER BY name ASC',
            [session.organizationId]
        );
        return NextResponse.json({ suppliers });
    } catch (e) {
        console.error('Get Suppliers Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { name, contact_email, contact_phone, delivery_days, order_days, lead_time_days } = await req.json();

        if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

        const deliveryJson = JSON.stringify(delivery_days || []);
        const orderJson = JSON.stringify(order_days || []);

        const res = await db.one(
            `INSERT INTO suppliers (organization_id, name, contact_email, contact_phone, delivery_days_json, order_days_json, lead_time_days)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [session.organizationId, name, contact_email || null, contact_phone || null, deliveryJson, orderJson, lead_time_days || 1]
        );

        return NextResponse.json({ success: true, id: res.id });
    } catch (e) {
        console.error('Create Supplier Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
