import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/settings/permissions
// Returns the authenticated user's role, permissions, and org-level feature flags.
// Used by the mobile app to conditionally show/hide admin features and actions.
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const user = await db.one(
            `SELECT u.id, u.role, u.permissions, u.first_name, u.last_name, u.display_name,
                    u.profile_picture, u.position, u.phone,
                    o.name AS org_name, o.subdomain, o.subscription_plan
             FROM users u
             JOIN organizations o ON o.id = u.organization_id
             WHERE u.id = $1 AND u.organization_id = $2`,
            [session.id, session.organizationId]
        );

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        let permissions: string[] = [];
        try {
            permissions = typeof user.permissions === 'string'
                ? JSON.parse(user.permissions)
                : (user.permissions || []);
        } catch { }

        const isAdmin = user.role === 'admin';
        const hasAll = isAdmin || permissions.includes('all');

        return NextResponse.json({
            user: {
                id: user.id,
                role: user.role,
                permissions,
                first_name: user.first_name,
                last_name: user.last_name,
                display_name: user.display_name,
                profile_picture: user.profile_picture,
                position: user.position,
                phone: user.phone,
            },
            organization: {
                name: user.org_name,
                subdomain: user.subdomain,
                subscription_plan: user.subscription_plan,
            },
            capabilities: {
                can_add_barred: hasAll || permissions.includes('add_barred'),
                can_approve_swaps: isAdmin,
                can_approve_time_off: isAdmin,
                can_view_all_schedules: true,
                can_post_feed: true,
                can_manage_inventory: hasAll || permissions.includes('inventory'),
                is_admin: isAdmin,
            },
        });
    } catch (err) {
        console.error('Settings/permissions error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
