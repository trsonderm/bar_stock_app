import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const STEPS = [
    { key: 'org_settings', label: 'Configure Organization Settings', description: 'Set your organization name, type (bar/food), and subdomain', href: '/admin/settings' },
    { key: 'add_locations', label: 'Add Locations', description: 'Add your bar areas or physical locations', href: '/admin/settings/locations' },
    { key: 'add_categories', label: 'Configure Product Categories', description: 'Set up your product categories (Spirits, Beer, Wine, etc.)', href: '/admin/categories' },
    { key: 'add_suppliers', label: 'Add Suppliers', description: 'Add your distributors and suppliers', href: '/admin/suppliers' },
    { key: 'add_products', label: 'Add Inventory Products', description: 'Add all products you stock and want to track', href: '/admin/products' },
    { key: 'add_staff', label: 'Add Staff Members', description: 'Invite your bartenders, managers, and other staff', href: '/admin/users' },
    { key: 'create_shifts', label: 'Create Shift Templates', description: 'Set up your standard shift types (Morning, Evening, Closing, etc.)', href: '/admin/schedule' },
    { key: 'draw_bar_map', label: 'Draw Your Bar Map', description: 'Create a visual floor plan with bottle locations for auditing', href: '/admin/bar-map' },
    { key: 'configure_alerts', label: 'Configure Alerts & Reports', description: 'Set up low-stock alerts and automated email reports', href: '/admin/settings' },
    { key: 'invite_team', label: 'Send Employee Invitations', description: 'Invite your team to download the mobile app and log in', href: '/admin/users' },
];

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await db.query(
        'SELECT step_key, completed, completed_at, completed_by_name FROM setup_checklist WHERE organization_id = $1',
        [session.organizationId]
    );

    const completedMap: Record<string, any> = {};
    for (const r of rows) { completedMap[r.step_key] = r; }

    const steps = STEPS.map(s => ({
        ...s,
        completed: completedMap[s.key]?.completed || false,
        completed_at: completedMap[s.key]?.completed_at || null,
        completed_by_name: completedMap[s.key]?.completed_by_name || null,
    }));

    const total = steps.length;
    const done = steps.filter(s => s.completed).length;

    return NextResponse.json({ steps, total, done, percent: Math.round((done / total) * 100) });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { step_key, completed } = await req.json();
    if (!step_key) return NextResponse.json({ error: 'step_key required' }, { status: 400 });
    if (!STEPS.find(s => s.key === step_key)) return NextResponse.json({ error: 'Invalid step_key' }, { status: 400 });

    const name = `${session.firstName || ''} ${session.lastName || ''}`.trim() || 'Admin';

    await db.execute(
        `INSERT INTO setup_checklist (organization_id, step_key, completed, completed_at, completed_by_name)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (organization_id, step_key) DO UPDATE
           SET completed=$3, completed_at=$4, completed_by_name=$5`,
        [session.organizationId, step_key, !!completed, completed ? new Date() : null, completed ? name : null]
    );

    return NextResponse.json({ ok: true });
}
