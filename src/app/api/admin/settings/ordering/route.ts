import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const organizationId = session.organizationId;

        // 1. Fetch AI Config
        const org = await db.one('SELECT ai_ordering_config FROM organizations WHERE id = $1', [organizationId]);
        const config = org.ai_ordering_config ? JSON.parse(org.ai_ordering_config) : {
            enabled: false,
            require_confirmation: true,
            cc_emails: [], // stored as strings or user IDs? IDs preferred for lookup, but simple strings fine too. Let's use IDs.
            cc_user_ids: [],
            supplier_ids: [], // Whitelist of enabled suppliers
        };

        // 2. Fetch Suppliers (id, name, contact_email)
        const suppliers = await db.query(
            'SELECT id, name, contact_email FROM suppliers WHERE organization_id = $1 ORDER BY name ASC',
            [organizationId]
        );

        // 3. Fetch Users (for CC selection)
        const users = await db.query(
            'SELECT id, first_name, last_name, email FROM users WHERE organization_id = $1 ORDER BY first_name ASC',
            [organizationId]
        );

        return NextResponse.json({ config, suppliers, users });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const organizationId = session.organizationId;
        const config = await req.json();

        // Validate? 
        // Ensure cc_user_ids is array
        // Ensure supplier_ids is array

        await db.execute(
            'UPDATE organizations SET ai_ordering_config = $1 WHERE id = $2',
            [JSON.stringify(config), organizationId]
        );

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
