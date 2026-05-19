/**
 * GET /api/mobile/auth/me
 * Returns the authenticated user's identity, permissions, and pre-computed
 * capability flags. Call once after login and cache for the session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const user = await db.one(
            `SELECT u.id, u.role, u.permissions, u.first_name, u.last_name, u.display_name,
                    u.profile_picture, u.position, u.phone, u.email,
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
                email: user.email,
            },
            organization: {
                name: user.org_name,
                subdomain: user.subdomain,
                subscription_plan: user.subscription_plan,
            },
            capabilities: {
                // Stock
                can_add_stock: hasAll || permissions.includes('add_stock'),
                can_subtract_stock: hasAll || permissions.includes('subtract_stock'),
                // Barred list
                can_add_barred: hasAll || permissions.includes('add_barred'),
                can_delete_barred: hasAll || permissions.includes('delete_barred'),
                can_view_barred: hasAll || permissions.includes('add_barred') || permissions.includes('delete_barred'),
                // Incidents
                can_add_incident: hasAll || permissions.includes('add_incident'),
                can_review_incidents: hasAll || permissions.includes('review_incidents'),
                // Orders
                can_receive_orders: hasAll || permissions.includes('add_stock'),
                // Scheduling
                can_approve_swaps: isAdmin,
                can_approve_time_off: isAdmin,
                can_approve_schedule: hasAll || permissions.some((p: string) => p === 'approve_schedule' || p.startsWith('approve_schedule_')),
                // Admin
                can_manage_inventory: hasAll || permissions.includes('manage_products'),
                can_view_reports: hasAll || permissions.includes('view_reports'),
                is_admin: isAdmin,
            },
        });
    } catch (err) {
        console.error('[Mobile auth/me GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
