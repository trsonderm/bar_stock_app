import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const SUPPORTED = ['google', 'github', 'microsoft'] as const;
type Provider = typeof SUPPORTED[number];

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params;
    const loginUrl = new URL('/login', req.url).toString();

    if (!SUPPORTED.includes(provider as Provider)) {
        return NextResponse.redirect(`${loginUrl}?error=unknown_provider`);
    }

    const keys = [
        `sso_${provider}_enabled`,
        `sso_${provider}_client_id`,
        ...(provider === 'microsoft' ? ['sso_microsoft_tenant_id'] : []),
    ];
    const rows = await db.query(
        `SELECT key, value FROM system_settings WHERE key = ANY($1)`, [keys]
    ).catch(() => []);
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;

    if (s[`sso_${provider}_enabled`] !== 'true') {
        return NextResponse.redirect(`${loginUrl}?error=sso_disabled`);
    }
    const clientId = s[`sso_${provider}_client_id`];
    if (!clientId) return NextResponse.redirect(`${loginUrl}?error=sso_not_configured`);

    const baseUrl = new URL(req.url).origin;
    const redirectUri = `${baseUrl}/api/auth/callback/${provider}`;
    const state = crypto.randomUUID();

    let authUrl: string;
    if (provider === 'google') {
        const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        u.searchParams.set('client_id', clientId);
        u.searchParams.set('redirect_uri', redirectUri);
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('scope', 'openid email profile');
        u.searchParams.set('state', state);
        u.searchParams.set('access_type', 'online');
        authUrl = u.toString();
    } else if (provider === 'github') {
        const u = new URL('https://github.com/login/oauth/authorize');
        u.searchParams.set('client_id', clientId);
        u.searchParams.set('redirect_uri', redirectUri);
        u.searchParams.set('scope', 'user:email');
        u.searchParams.set('state', state);
        authUrl = u.toString();
    } else {
        const tenant = s['sso_microsoft_tenant_id'] || 'common';
        const u = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
        u.searchParams.set('client_id', clientId);
        u.searchParams.set('redirect_uri', redirectUri);
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('scope', 'openid email profile');
        u.searchParams.set('state', state);
        authUrl = u.toString();
    }

    const res = NextResponse.redirect(authUrl);
    res.cookies.set('oauth_state', state, { httpOnly: true, maxAge: 600, sameSite: 'lax', path: '/' });
    return res;
}
