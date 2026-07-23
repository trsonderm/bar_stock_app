import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Run DB migration inline on first use
async function migrate() {
    await db.execute(`ALTER TABLE items ADD COLUMN IF NOT EXISTS shift_begin_audit BOOLEAN DEFAULT FALSE`).catch(() => {});
    await db.execute(`ALTER TABLE items ADD COLUMN IF NOT EXISTS shift_end_audit BOOLEAN DEFAULT FALSE`).catch(() => {});
    await db.execute(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`).catch(() => {});
    await db.execute(`
        CREATE TABLE IF NOT EXISTS shift_audit_logs (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id),
            location_id INTEGER REFERENCES locations(id),
            user_id INTEGER REFERENCES users(id),
            user_name TEXT,
            audit_type TEXT NOT NULL,
            entries JSONB NOT NULL DEFAULT '[]',
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `).catch(() => {});
}

// GET — items available for audit at a location
// ?type=begin|end&locationId=N
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await migrate();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'begin' | 'end'
    const locationId = parseInt(searchParams.get('locationId') || '0');

    if (!type || !['begin', 'end'].includes(type)) {
        return NextResponse.json({ error: 'type must be begin or end' }, { status: 400 });
    }

    // Load location audit settings
    const loc = locationId
        ? await db.one('SELECT settings FROM locations WHERE id = $1 AND organization_id = $2', [locationId, session.organizationId])
        : null;

    const locSettings: Record<string, any> = loc?.settings || {};
    if (!locSettings.shift_audit_enabled) {
        return NextResponse.json({ items: [], auditSettings: locSettings });
    }

    const allItems = locSettings[type === 'begin' ? 'shift_begin_audit_all' : 'shift_end_audit_all'];
    const flagCol = type === 'begin' ? 'shift_begin_audit' : 'shift_end_audit';

    // Get items with current inventory at the location
    const items = await db.query(
        `SELECT i.id, i.name, i.type, i.secondary_type,
                COALESCE(i.stock_unit_label, 'unit') AS stock_unit_label,
                COALESCE(i.stock_unit_size, 1) AS stock_unit_size,
                COALESCE(i.${flagCol}, false) AS flagged,
                COALESCE(inv.quantity, 0) AS quantity
         FROM items i
         LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.location_id = $2
         WHERE i.organization_id = $1
           AND i.archived_at IS NULL
           AND ($3::boolean OR i.${flagCol} = true)
         ORDER BY i.name ASC`,
        [session.organizationId, locationId || null, allItems]
    );

    return NextResponse.json({ items, auditSettings: locSettings });
}

// POST — submit an audit log
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await migrate();

    const { audit_type, location_id, entries, notes } = await req.json();

    if (!audit_type || !['begin', 'end'].includes(audit_type)) {
        return NextResponse.json({ error: 'audit_type must be begin or end' }, { status: 400 });
    }
    if (!Array.isArray(entries)) {
        return NextResponse.json({ error: 'entries must be an array' }, { status: 400 });
    }

    const userName = `${session.firstName} ${session.lastName}`.trim();

    const row = await db.one(
        `INSERT INTO shift_audit_logs (organization_id, location_id, user_id, user_name, audit_type, entries, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
        [
            session.organizationId,
            location_id || null,
            session.id,
            userName,
            audit_type,
            JSON.stringify(entries),
            notes?.trim() || null,
        ]
    );

    return NextResponse.json({ ok: true, id: row.id, created_at: row.created_at });
}
