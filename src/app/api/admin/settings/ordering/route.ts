/**
 * /api/admin/settings/ordering — automated-ordering configuration (admin only).
 *
 *  GET  { config, suppliers, users } for the settings screen
 *  POST replace organizations.ai_ordering_config with the JSON body
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { parseJsonColumn } from '@/lib/json';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const organizationId = session.organizationId;

        // 1. Fetch AI Config
        const org = await db.one('SELECT ai_ordering_config FROM organizations WHERE id = $1', [organizationId]);
        const config = parseJsonColumn(org?.ai_ordering_config, {
            enabled: false,
            require_confirmation: true,
            cc_emails: [],
            cc_user_ids: [],      // users CC'd on approval requests
            supplier_ids: [],     // suppliers enabled for automated ordering
        });

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
