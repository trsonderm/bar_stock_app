import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pool } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const BACKUP_DIR = '/backups';

const DELETE_STEPS = [
    `DELETE FROM report_schedules WHERE organization_id = $1`,
    `DELETE FROM report_runs WHERE organization_id = $1`,
    `DELETE FROM saved_reports WHERE organization_id = $1`,
    `DELETE FROM user_schedules WHERE organization_id = $1`,
    `DELETE FROM shifts WHERE organization_id = $1`,
    `DELETE FROM user_locations WHERE organization_id = $1`,
    `DELETE FROM security_incidents WHERE organization_id = $1`,
    `DELETE FROM security_barred WHERE organization_id = $1`,
    `DELETE FROM pending_orders WHERE organization_id = $1`,
    `DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id = $1)`,
    `DELETE FROM item_suppliers WHERE item_id IN (SELECT id FROM items WHERE organization_id = $1)`,
    `DELETE FROM inventory WHERE organization_id = $1`,
    `DELETE FROM purchase_orders WHERE organization_id = $1`,
    `DELETE FROM suppliers WHERE organization_id = $1`,
    `DELETE FROM items WHERE organization_id = $1`,
    `DELETE FROM categories WHERE organization_id = $1`,
    `DELETE FROM settings WHERE organization_id = $1`,
    `DELETE FROM locations WHERE organization_id = $1`,
    `DELETE FROM users WHERE organization_id = $1`,
];

const INSERT_ORDER = [
    'users', 'locations', 'settings', 'categories', 'items', 'suppliers',
    'purchase_orders', 'inventory', 'item_suppliers', 'purchase_order_items',
    'pending_orders', 'security_barred', 'security_incidents', 'user_locations',
    'shifts', 'user_schedules', 'saved_reports', 'report_schedules',
];

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = session.organizationId;
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const body = await req.json();
    const { snapshotFile } = body;
    if (!snapshotFile) return NextResponse.json({ error: 'Missing snapshotFile' }, { status: 400 });

    // Validate filename (prevent path traversal)
    const safeName = path.basename(snapshotFile);
    if (!safeName.endsWith('.json') || !safeName.startsWith('backup-')) {
        return NextResponse.json({ error: 'Invalid snapshot file' }, { status: 400 });
    }

    const filePath = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'Snapshot file not found' }, { status: 404 });
    }

    let snapshot: any;
    try {
        snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return NextResponse.json({ error: 'Failed to read snapshot' }, { status: 500 });
    }

    // Ensure snapshot belongs to this org
    if (snapshot.org_id !== orgId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const tableMap: Record<string, any[]> = {};
    for (const t of snapshot.tables || []) {
        tableMap[t.name] = t.rows || [];
    }

    const client = await pool.connect();
    let rowsRestored = 0;
    try {
        await client.query('BEGIN');

        for (const sql of DELETE_STEPS) {
            await client.query(sql, [orgId]);
        }

        for (const tableName of INSERT_ORDER) {
            const rows = tableMap[tableName] || [];
            if (rows.length === 0) continue;

            const columns = Object.keys(rows[0]);
            const colList = columns.map(c => `"${c}"`).join(', ');

            for (const row of rows) {
                const rowData = tableName === 'purchase_orders' ? { ...row, resubmit_of: null } : row;
                const values = columns.map(c => rowData[c] ?? null);
                const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                await client.query(
                    `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`,
                    values,
                );
                rowsRestored++;
            }

            if (tableName === 'purchase_orders') {
                for (const row of rows) {
                    if (row.resubmit_of != null) {
                        await client.query(
                            `UPDATE purchase_orders SET resubmit_of = $1 WHERE id = $2`,
                            [row.resubmit_of, row.id],
                        );
                    }
                }
            }
        }

        await client.query('COMMIT');
        return NextResponse.json({ success: true, rowsRestored });
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('[admin/restore] Error:', e);
        return NextResponse.json({ error: e.message || 'Restore failed' }, { status: 500 });
    } finally {
        client.release();
    }
}
