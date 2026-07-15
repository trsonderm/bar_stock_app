/**
 * GET /api/integrations/clover/callback
 *
 * Clover OAuth redirect handler. Clover sends the browser here after the
 * merchant authorizes the app:
 *   ?merchant_id=<MID>&client_id=<APP_ID>&employee_id=<EID>&code=<AUTH_CODE>&state=<STATE>
 *
 * Exchanges the code for an access token and saves it to pos_sync_settings
 * for the organization encoded in the state parameter.
 *
 * Redirect URI registered in Clover developer portal:
 *   https://www.topshelfinventory.com/api/integrations/clover/callback
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { db, pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const HMAC_SECRET = process.env.JWT_SECRET || 'topshelf-secret-key-change-in-prod';
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function verifyState(state: string): number | null {
    try {
        const decoded = Buffer.from(state, 'base64url').toString('utf-8');
        const parts = decoded.split(':');
        if (parts.length !== 3) return null;
        const [orgIdStr, tsStr, sig] = parts;
        const payload = `${orgIdStr}:${tsStr}`;
        const expectedSig = createHmac('sha256', HMAC_SECRET).update(payload).digest('hex').slice(0, 16);
        if (sig !== expectedSig) return null;
        if (Date.now() - parseInt(tsStr, 10) > STATE_MAX_AGE_MS) return null;
        return parseInt(orgIdStr, 10) || null;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams;
    const code = params.get('code');
    const merchantId = params.get('merchant_id');
    const state = params.get('state');
    const errorParam = params.get('error');

    const failRedirect = (msg: string) =>
        NextResponse.redirect(
            `https://www.topshelfinventory.com/admin/settings/sync-pos?clover_error=${encodeURIComponent(msg)}`
        );

    if (errorParam) return failRedirect(`Clover authorization denied: ${errorParam}`);
    if (!code || !merchantId || !state) return failRedirect('Missing required parameters from Clover.');

    const orgId = verifyState(state);
    if (!orgId) return failRedirect('Invalid or expired authorization request. Please try again.');

    try {
        // Fetch global app credentials
        const row = await db.one(
            "SELECT value FROM system_settings WHERE key = 'pos_clover_settings'"
        ).catch(() => null);

        const creds = row?.value ? JSON.parse(row.value) : {};
        const { app_id, app_secret } = creds;
        if (!app_id || !app_secret) return failRedirect('Clover is not fully configured. Contact your administrator.');

        // Exchange code for access token
        const tokenUrl =
            `https://api.clover.com/oauth/token` +
            `?client_id=${encodeURIComponent(app_id)}` +
            `&client_secret=${encodeURIComponent(app_secret)}` +
            `&code=${encodeURIComponent(code)}`;

        const tokenRes = await fetch(tokenUrl, { method: 'GET' });
        if (!tokenRes.ok) {
            const body = await tokenRes.text().catch(() => '');
            console.error('[Clover OAuth] token exchange failed', tokenRes.status, body);
            return failRedirect('Failed to exchange authorization code. Please try again.');
        }

        const tokenData = await tokenRes.json();
        const accessToken: string = tokenData.access_token;
        if (!accessToken) return failRedirect('Clover did not return an access token.');

        // Upsert pos_sync_settings for this org / clover
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const existing = await client.query(
                `SELECT id, credentials FROM pos_sync_settings WHERE organization_id = $1 AND pos_type = 'clover'`,
                [orgId]
            );

            if (existing.rows.length > 0) {
                const prevCreds = existing.rows[0].credentials || {};
                const newCreds = { ...prevCreds, merchant_id: merchantId, access_token: accessToken };
                await client.query(
                    `UPDATE pos_sync_settings
                     SET credentials = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [JSON.stringify(newCreds), existing.rows[0].id]
                );
            } else {
                await client.query(
                    `INSERT INTO pos_sync_settings
                        (organization_id, pos_type, sync_enabled, sync_frequency, credentials)
                     VALUES ($1, 'clover', true, 'hourly', $2)`,
                    [orgId, JSON.stringify({ merchant_id: merchantId, access_token: accessToken })]
                );
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        return NextResponse.redirect(
            `https://www.topshelfinventory.com/admin/settings/sync-pos?clover_connected=1`
        );
    } catch (err) {
        console.error('[Clover OAuth callback]', err);
        return failRedirect('An unexpected error occurred. Please try again.');
    }
}
