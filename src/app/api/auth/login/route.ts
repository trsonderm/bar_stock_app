import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyPin, verifyPassword, createSessionToken, COOKIE_OPTIONS, UserRole } from '@/lib/auth';
import { validateStationToken } from '@/lib/dba';
import * as fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { pin, email, password } = body;

        let matchedUser = null;

        // 1. Email/Password Login (Admin / Multi-tenant)
        if (email && password) {
            const user = await db.one('SELECT * FROM users WHERE email = $1', [email]);
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
            // Fetch Organization Plan
            const org = await db.one('SELECT subscription_plan FROM organizations WHERE id = $1', [matchedUser.organization_id || 1]);
            const subscriptionPlan = org ? org.subscription_plan : 'base';

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

            const response = NextResponse.json({ success: true, role: matchedUser.role, isSuperAdmin });
            response.cookies.set('session', token, COOKIE_OPTIONS);

            return response;
        } else {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
