import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

function cartKey(userId: number) {
    return `manual_order_cart_${userId}`;
}

export async function GET() {
    const session = await getSession();
    if (!session?.organizationId || !session?.id) return NextResponse.json({ cart: {} });

    try {
        const rows = await db.query(
            'SELECT value FROM settings WHERE organization_id = $1 AND key = $2',
            [session.organizationId, cartKey(session.id)]
        );
        const cart = rows[0]?.value ? JSON.parse(rows[0].value) : {};
        return NextResponse.json({ cart });
    } catch {
        return NextResponse.json({ cart: {} });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId || !session?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { cart } = await req.json();
        await db.execute(
            `INSERT INTO settings (organization_id, key, value)
             VALUES ($1, $2, $3)
             ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
            [session.organizationId, cartKey(session.id), JSON.stringify(cart)]
        );
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE() {
    const session = await getSession();
    if (!session?.organizationId || !session?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await db.execute(
            'DELETE FROM settings WHERE organization_id = $1 AND key = $2',
            [session.organizationId, cartKey(session.id)]
        );
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
