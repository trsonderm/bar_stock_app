import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

// GET — list all issued station tokens
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const tokens = await db.query(`
            SELECT
                t.id,
                t.device_name,
                t.token,
                t.registered_ip,
                t.user_agent,
                t.created_at,
                t.expires_at,
                t.last_used_at,
                t.revoked_at,
                t.revoked_by,
                o.id   AS org_id,
                o.name AS org_name,
                o.subdomain,
                CASE
                    WHEN t.revoked_at IS NOT NULL THEN 'revoked'
                    WHEN t.expires_at < NOW() THEN 'expired'
                    ELSE 'active'
                END AS status
            FROM organization_tokens t
            JOIN organizations o ON t.organization_id = o.id
            ORDER BY t.created_at DESC
        `);

        return NextResponse.json({ tokens });

    } catch (error) {
        console.error('GET /api/super-admin/devices error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
