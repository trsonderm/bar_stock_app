/**
 * GET /api/admin/pos/clover/connect
 *
 * Initiates the Clover OAuth flow. Redirects the browser to Clover's
 * authorization page with the correct redirect_uri and a signed state token.
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const REDIRECT_URI = 'https://www.topshelfinventory.com/api/integrations/clover/callback';
const HMAC_SECRET = process.env.JWT_SECRET || 'topshelf-secret-key-change-in-prod';

function signState(orgId: number): string {
    const ts = Date.now();
    const payload = `${orgId}:${ts}`;
    const sig = createHmac('sha256', HMAC_SECRET).update(payload).digest('hex').slice(0, 16);
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    // Get global Clover app credentials
    const row = await db.one(
        "SELECT value FROM system_settings WHERE key = 'pos_clover_settings'"
    ).catch(() => null);

    const creds = row?.value ? JSON.parse(row.value) : {};
    const appId = creds.app_id;
    if (!appId) {
        return NextResponse.json(
            { error: 'Clover App ID not configured. Ask your super admin to configure Clover POS first.' },
            { status: 400 }
        );
    }

    const state = signState(session.organizationId);
    const cloverUrl =
        `https://www.clover.com/oauth/authorize` +
        `?client_id=${encodeURIComponent(appId)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&state=${encodeURIComponent(state)}`;

    return NextResponse.redirect(cloverUrl);
}
