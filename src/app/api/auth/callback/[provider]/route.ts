import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import { createSessionToken, COOKIE_OPTIONS } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params;
    const url = new URL(req.url);
    const baseUrl = url.origin;
    const loginUrl = `${baseUrl}/login`;

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    if (oauthError) return NextResponse.redirect(`${loginUrl}?error=oauth_denied`);
    if (!code || !state) return NextResponse.redirect(`${loginUrl}?error=oauth_invalid`);

    const cookieStore = await cookies();
    const savedState = cookieStore.get('oauth_state')?.value;
    if (!savedState || savedState !== state) {
        return NextResponse.redirect(`${loginUrl}?error=oauth_state`);
    }

    try {
        const settingsKeys = [
            `sso_${provider}_client_id`, `sso_${provider}_client_secret`, `sso_${provider}_enabled`,
            'sso_allow_new_users', 'sso_allowed_domains', 'sso_default_role', 'sso_default_org_id',
            ...(provider === 'microsoft' ? ['sso_microsoft_tenant_id'] : []),
        ];
        const rows = await db.query(
            `SELECT key, value FROM system_settings WHERE key = ANY($1)`, [settingsKeys]
        );
        const s: Record<string, string> = {};
        for (const r of rows) s[r.key] = r.value;

        if (s[`sso_${provider}_enabled`] !== 'true') {
            return NextResponse.redirect(`${loginUrl}?error=sso_disabled`);
        }
        const clientId = s[`sso_${provider}_client_id`];
        const clientSecret = s[`sso_${provider}_client_secret`];
        if (!clientId || !clientSecret) return NextResponse.redirect(`${loginUrl}?error=sso_not_configured`);

        const redirectUri = `${baseUrl}/api/auth/callback/${provider}`;

        let oauthUser: { id: string; email: string; firstName: string; lastName: string };

        if (provider === 'google') {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
            });
            const td = await tokenRes.json();
            if (!td.access_token) return NextResponse.redirect(`${loginUrl}?error=oauth_token`);
            const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${td.access_token}` },
            }).then(r => r.json());
            oauthUser = {
                id: info.id, email: info.email?.toLowerCase() || '',
                firstName: info.given_name || info.name?.split(' ')[0] || 'User',
                lastName: info.family_name || info.name?.split(' ').slice(1).join(' ') || '',
            };
        } else if (provider === 'github') {
            const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
            });
            const td = await tokenRes.json();
            if (!td.access_token) return NextResponse.redirect(`${loginUrl}?error=oauth_token`);
            const [info, emails] = await Promise.all([
                fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${td.access_token}`, 'User-Agent': 'TopShelf-App' } }).then(r => r.json()),
                fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${td.access_token}`, 'User-Agent': 'TopShelf-App' } }).then(r => r.json()),
            ]);
            const primaryEmail = (Array.isArray(emails) ? emails.find((e: any) => e.primary)?.email : null) || info.email;
            if (!primaryEmail) return NextResponse.redirect(`${loginUrl}?error=oauth_no_email`);
            const parts = (info.name || info.login || '').split(' ');
            oauthUser = { id: String(info.id), email: primaryEmail.toLowerCase(), firstName: parts[0] || info.login, lastName: parts.slice(1).join(' ') };
        } else if (provider === 'microsoft') {
            const tenant = s['sso_microsoft_tenant_id'] || 'common';
            const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', scope: 'openid email profile' }),
            });
            const td = await tokenRes.json();
            if (!td.access_token) return NextResponse.redirect(`${loginUrl}?error=oauth_token`);
            const info = await fetch('https://graph.microsoft.com/oidc/userinfo', {
                headers: { Authorization: `Bearer ${td.access_token}` },
            }).then(r => r.json());
            const parts = (info.name || '').split(' ');
            oauthUser = { id: info.sub, email: info.email?.toLowerCase() || '', firstName: parts[0] || 'User', lastName: parts.slice(1).join(' ') };
        } else {
            return NextResponse.redirect(`${loginUrl}?error=unknown_provider`);
        }

        if (!oauthUser.email) return NextResponse.redirect(`${loginUrl}?error=oauth_no_email`);

        // Enforce allowed domains
        const allowedDomains = (s['sso_allowed_domains'] || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
        if (allowedDomains.length > 0 && !allowedDomains.includes(oauthUser.email.split('@')[1])) {
            return NextResponse.redirect(`${loginUrl}?error=domain_not_allowed`);
        }

        // Find user: 1) by oauth link 2) by email 3) create
        let user = await db.one(
            `SELECT * FROM users WHERE oauth_providers @> $1::jsonb`,
            [JSON.stringify([{ provider, id: oauthUser.id }])]
        ).catch(() => null);

        if (!user) {
            user = await db.one('SELECT * FROM users WHERE LOWER(email) = $1', [oauthUser.email]).catch(() => null);
            if (user) {
                const existing: any[] = typeof user.oauth_providers === 'string' ? JSON.parse(user.oauth_providers) : (user.oauth_providers || []);
                const updated = [...existing.filter((p: any) => p.provider !== provider), { provider, id: oauthUser.id, email: oauthUser.email, linked_at: new Date().toISOString() }];
                await db.execute('UPDATE users SET oauth_providers = $1 WHERE id = $2', [JSON.stringify(updated), user.id]);
            }
        }

        if (!user) {
            if (s['sso_allow_new_users'] !== 'true') return NextResponse.redirect(`${loginUrl}?error=no_account`);
            const defaultOrgId = parseInt(s['sso_default_org_id'] || '1');
            const defaultRole = s['sso_default_role'] || 'user';
            const oauthProviders = [{ provider, id: oauthUser.id, email: oauthUser.email, linked_at: new Date().toISOString() }];
            const created = await db.query(
                `INSERT INTO users (first_name, last_name, email, organization_id, role, permissions, is_email_verified, pin_hash, oauth_providers)
                 VALUES ($1, $2, $3, $4, $5, '[]', TRUE, '', $6) RETURNING *`,
                [oauthUser.firstName, oauthUser.lastName, oauthUser.email, defaultOrgId, defaultRole, JSON.stringify(oauthProviders)]
            );
            user = created[0];
        }

        if (!user) return NextResponse.redirect(`${loginUrl}?error=user_lookup_failed`);
        if (user.is_locked) return NextResponse.redirect(`${loginUrl}?error=account_locked`);

        const org = await db.one(
            'SELECT subscription_plan, billing_status FROM organizations WHERE id = $1',
            [user.organization_id || 1]
        ).catch(() => null);
        if (org?.billing_status === 'disabled') return NextResponse.redirect(`${loginUrl}?error=org_disabled`);

        const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
        const isSuperAdmin = permissions.includes('super_admin');
        const token = await createSessionToken({
            id: user.id, role: user.role, permissions,
            firstName: user.first_name, lastName: user.last_name, email: user.email,
            organizationId: user.organization_id || 1, isSuperAdmin,
            subscriptionPlan: org?.subscription_plan || 'base',
        });

        const dest = isSuperAdmin ? '/super-admin' : user.role === 'admin' ? '/admin/dashboard' : '/inventory';
        const res = NextResponse.redirect(`${baseUrl}${dest}`);
        res.cookies.set('session', token, COOKIE_OPTIONS);
        res.cookies.delete('oauth_state');
        return res;
    } catch (err) {
        console.error('[oauth callback]', err);
        return NextResponse.redirect(`${loginUrl}?error=oauth_error`);
    }
}
