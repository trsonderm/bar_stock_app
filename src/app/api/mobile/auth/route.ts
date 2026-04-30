import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSessionToken, verifyPassword, verifyPin } from '@/lib/auth';

// POST /api/mobile/auth — login and get a Bearer token
export async function POST(req: NextRequest) {
    try {
        const { email, password, pin, organization_subdomain } = await req.json();

        if (!organization_subdomain) {
            return NextResponse.json({ error: 'organization_subdomain is required' }, { status: 400 });
        }

        // Resolve org
        const orgs = await db.query(
            'SELECT id, name, subscription_plan FROM organizations WHERE subdomain = $1',
            [organization_subdomain.toLowerCase().trim()]
        );
        if (orgs.length === 0) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }
        const org = orgs[0];

        let user: any = null;

        if (email && password) {
            const users = await db.query(
                `SELECT id, first_name, last_name, email, role, permissions, password_hash
                 FROM users WHERE email = $1 AND organization_id = $2 AND is_active = TRUE AND is_archived = FALSE`,
                [email.toLowerCase().trim(), org.id]
            );
            if (users.length === 0) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
            user = users[0];
            if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
                return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
            }
        } else if (pin) {
            const allUsers = await db.query(
                `SELECT id, first_name, last_name, email, role, permissions, pin_hash
                 FROM users WHERE organization_id = $1 AND is_active = TRUE AND is_archived = FALSE`,
                [org.id]
            );
            user = allUsers.find((u: any) => verifyPin(pin, u.pin_hash));
            if (!user) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
        } else {
            return NextResponse.json({ error: 'Provide email+password or pin' }, { status: 400 });
        }

        let permissions: string[] = [];
        try {
            permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
        } catch { }

        const token = await createSessionToken({
            id: user.id,
            role: user.role,
            permissions,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            organizationId: org.id,
            isSuperAdmin: permissions.includes('super_admin'),
            subscriptionPlan: org.subscription_plan,
        });

        return NextResponse.json({
            token,
            expires_in: 604800,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                permissions,
            },
            organization: {
                id: org.id,
                name: org.name,
                subdomain: organization_subdomain,
                subscription_plan: org.subscription_plan,
            },
        });
    } catch (err) {
        console.error('Mobile auth error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

