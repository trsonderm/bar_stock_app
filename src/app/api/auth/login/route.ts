import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyPin, verifyPassword, createSessionToken, COOKIE_OPTIONS, UserRole } from '@/lib/auth';
import { validateStationToken } from '@/lib/dba';
import * as fs from 'fs';
import path from 'path';

function getClientIp(req: NextRequest): string {
    return (
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown'
    );
}

async function recordLoginAttempt(opts: {
    ip: string;
    userAgent: string;
    email: string | null;
    userId: number | null;
    organizationId: number | null;
    success: boolean;
    failReason: string | null;
}) {
    try {
        await db.execute(
            `INSERT INTO login_attempts (ip_address, user_agent, email, user_id, organization_id, success, fail_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [opts.ip, opts.userAgent.slice(0, 512), opts.email, opts.userId, opts.organizationId, opts.success, opts.failReason]
        );
    } catch { /* non-blocking — table may not exist on old deployments */ }
}

export async function POST(req: NextRequest) {
    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || '';

    // Enforce IP block list
    try {
        const blockedRow = await db.one(
            `SELECT value FROM system_settings WHERE key = 'security_blocked_ips' LIMIT 1`, []
        ).catch(() => null);
        if (blockedRow) {
            const blocked: string[] = JSON.parse(blockedRow.value);
            if (blocked.includes(ip)) {
                await recordLoginAttempt({ ip, userAgent, email: null, userId: null, organizationId: null, success: false, failReason: 'ip_blocked' });
                return NextResponse.json({ error: 'Access denied' }, { status: 403 });
            }
        }
    } catch { /* non-fatal */ }

    try {
        const body = await req.json();
        const { pin, email, password } = body;

        let matchedUser = null;

        // 1. Email/Password Login (Admin / Multi-tenant)
        if (email && password) {
            const user = await db.one('SELECT * FROM users WHERE LOWER(email) = $1', [email.toLowerCase().trim()]);
            if (user && user.password_hash && verifyPassword(password, user.password_hash)) {
                matchedUser = user;
            }
        }
        // 2. PIN Login (Legacy / POS)
        else if (pin) {
            // Station Token Check
            const cookieStore = cookies();
            const stationToken = cookieStore.get('station_token')?.value;

            if (!stationToken || !(await validateStationToken(stationToken))) {
                return NextResponse.json({ error: 'Station not authorized. Please log in with email and password.' }, { status: 401 });
            }

            // Note: PIN login iterates. If multi-tenant, this might find first match. 
            // Ideally should be scoped by subdomain or org selection, but for now fallback to global search.
            const users = await db.query('SELECT * FROM users');
            for (const user of users) {
                if (user.pin_hash && verifyPin(pin, user.pin_hash)) {
                    matchedUser = user;
                    // If multiple users have same PIN, this picks the first one. 
                    // This is a known limitation of legacy PIN auth in multi-tenant without Org context.
                    break;
                }
            }
        } else {
            return NextResponse.json({ error: 'Data required' }, { status: 400 });
        }

        if (matchedUser) {
            // Block login if account is locked by security system
            if (matchedUser.is_locked) {
                await recordLoginAttempt({ ip, userAgent, email: email || null, userId: matchedUser.id, organizationId: matchedUser.organization_id || 1, success: false, failReason: 'account_locked' });
                return NextResponse.json({ error: 'Your account has been temporarily locked. Contact your administrator.' }, { status: 403 });
            }

            // Block login if email verification is required and not yet verified
            if (email && password) {
                const verifySetting = await db.one("SELECT value FROM system_settings WHERE key = 'require_email_verification'");
                if (verifySetting?.value === 'true' && matchedUser.is_email_verified === false) {
                    return NextResponse.json({ error: 'Please verify your email address before logging in. Check your inbox for the verification link.' }, { status: 403 });
                }
            }

            // Fetch Organization Plan + Check if disabled
            const org = await db.one('SELECT subscription_plan, billing_status, disable_reason FROM organizations WHERE id = $1', [matchedUser.organization_id || 1]);
            const subscriptionPlan = org ? org.subscription_plan : 'base';

            if (org?.billing_status === 'disabled') {
                const reason = org.disable_reason || 'Your account has been suspended.';
                await recordLoginAttempt({ ip, userAgent, email: email || null, userId: matchedUser.id, organizationId: matchedUser.organization_id || 1, success: false, failReason: 'org_disabled' });
                return NextResponse.json({ error: `Account suspended: ${reason} Please contact support.` }, { status: 403 });
            }

            const permissions = typeof matchedUser.permissions === 'string' ? JSON.parse(matchedUser.permissions) : matchedUser.permissions;
            // Check if permissions includes super_admin
            const isSuperAdmin = permissions.includes('super_admin');

            const sessionUser = {
                id: matchedUser.id,
                role: matchedUser.role as UserRole,
                permissions: matchedUser.permissions,
                firstName: matchedUser.first_name,
                lastName: matchedUser.last_name,
                email: matchedUser.email,
                organizationId: matchedUser.organization_id || 1, // Fallback to 1 if null (shouldn't happen after migration)
                isSuperAdmin,
                subscriptionPlan
            };

            const token = await createSessionToken(sessionUser);

            await recordLoginAttempt({
                ip, userAgent,
                email: email || null,
                userId: matchedUser.id,
                organizationId: matchedUser.organization_id || 1,
                success: true,
                failReason: null,
            });

            const response = NextResponse.json({ success: true, role: matchedUser.role, isSuperAdmin });
            response.cookies.set('session', token, COOKIE_OPTIONS);

            return response;
        } else {
            await recordLoginAttempt({
                ip, userAgent,
                email: email || null,
                userId: null,
                organizationId: null,
                success: false,
                failReason: 'invalid_credentials',
            });
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
