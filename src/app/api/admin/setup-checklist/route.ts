import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const STEPS = [
    { key: 'org_settings',    label: 'Configure Organization Settings', description: 'Set your organization name, type (bar/food), and subdomain', href: '/admin/settings' },
    { key: 'add_locations',   label: 'Add Locations',                   description: 'Add your bar areas or physical locations', href: '/admin/settings/locations' },
    { key: 'add_categories',  label: 'Configure Product Categories',    description: 'Set up your product categories (Spirits, Beer, Wine, etc.)', href: '/admin/categories' },
    { key: 'add_suppliers',   label: 'Add Suppliers',                   description: 'Add your distributors and suppliers', href: '/admin/suppliers' },
    { key: 'add_products',    label: 'Add Inventory Products',          description: 'Add all products you stock and want to track', href: '/admin/products' },
    { key: 'add_staff',       label: 'Add Staff Members',               description: 'Invite your bartenders, managers, and other staff', href: '/admin/users' },
    { key: 'create_shifts',   label: 'Create Shift Templates',          description: 'Set up your standard shift types (Morning, Evening, Closing, etc.)', href: '/admin/schedule' },
    { key: 'draw_bar_map',    label: 'Draw Your Bar Map',               description: 'Create a visual floor plan with bottle locations for auditing', href: '/admin/bar-map' },
    { key: 'configure_alerts', label: 'Configure Alerts & Reports',     description: 'Set up low-stock alerts and automated email reports', href: '/admin/settings' },
    { key: 'invite_team',     label: 'Send Employee Invitations',       description: 'Invite your team to download the mobile app and log in', href: '/admin/users' },
];

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = session.organizationId;

    // Auto-detect each step by querying actual data — no manual flags needed.
    const row = await db.one(`
        SELECT
            -- org_settings: they've saved anything to org settings JSONB or the key-value settings table
            (
                (SELECT settings FROM organizations WHERE id = $1) != '{}'::jsonb
                OR EXISTS(SELECT 1 FROM settings WHERE organization_id = $1)
            ) AS org_settings,

            -- add_locations: at least one location record exists
            EXISTS(SELECT 1 FROM locations WHERE organization_id = $1)
                AS add_locations,

            -- add_categories: at least one category configured
            EXISTS(SELECT 1 FROM categories WHERE organization_id = $1)
                AS add_categories,

            -- add_suppliers: at least one real (non-self-supply) supplier added
            EXISTS(SELECT 1 FROM suppliers WHERE organization_id = $1 AND name != 'Self-Supply')
                AS add_suppliers,

            -- add_products: at least one non-archived product
            EXISTS(SELECT 1 FROM items WHERE organization_id = $1 AND archived_at IS NULL)
                AS add_products,

            -- add_staff: at least one non-admin user exists
            EXISTS(SELECT 1 FROM users WHERE organization_id = $1 AND role = 'user' AND is_archived = false)
                AS add_staff,

            -- create_shifts: at least one shift template defined
            EXISTS(SELECT 1 FROM shifts WHERE organization_id = $1)
                AS create_shifts,

            -- draw_bar_map: a bar map has been saved
            EXISTS(SELECT 1 FROM bar_maps WHERE organization_id = $1)
                AS draw_bar_map,

            -- configure_alerts: a relevant alert/report setting has been saved
            EXISTS(
                SELECT 1 FROM settings WHERE organization_id = $1
                AND key IN ('low_stock_threshold','report_email','daily_report_enabled','alert_email','low_stock_alert_enabled')
            ) AS configure_alerts,

            -- invite_team: at least one invitation sent OR a mobile device has registered
            (
                EXISTS(SELECT 1 FROM user_invitations WHERE organization_id = $1)
                OR EXISTS(SELECT 1 FROM organization_tokens WHERE organization_id = $1)
            ) AS invite_team
    `, [orgId]);

    const steps = STEPS.map(s => ({
        ...s,
        completed: row[s.key] === true,
    }));

    const done = steps.filter(s => s.completed).length;
    const total = steps.length;

    return NextResponse.json({ steps, total, done, percent: Math.round((done / total) * 100) });
}
