import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const orgs = await db.query('SELECT id, name, billing_status, sms_enabled, subscription_plan, created_at FROM organizations ORDER BY created_at DESC');
        return NextResponse.json({ organizations: orgs });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { id, billing_status, sms_enabled, subscription_plan } = await req.json();

        if (id) {
            // Update
            const updates = [];
            const params = [];
            let pIdx = 1;

            if (billing_status !== undefined) {
                updates.push(`billing_status = $${pIdx++}`);
                params.push(billing_status);
            }
            if (sms_enabled !== undefined) {
                updates.push(`sms_enabled = $${pIdx++}`);
                params.push(sms_enabled ? 1 : 0);
            }
            if (subscription_plan !== undefined) {
                updates.push(`subscription_plan = $${pIdx++}`);
                params.push(subscription_plan);
            }


            if (updates.length > 0) {
                params.push(id);
                await db.execute(
                    `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${pIdx}`,
                    params
                );
            }
        }
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Error' }, { status: 500 });
    }
}
