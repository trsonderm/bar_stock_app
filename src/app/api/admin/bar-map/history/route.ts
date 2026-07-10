import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const history = await db.query(
        `SELECT h.id, h.bar_map_id, h.saved_by_name, h.description, h.created_at
         FROM bar_map_history h
         JOIN bar_maps m ON m.id = h.bar_map_id
         WHERE m.organization_id = $1
         ORDER BY h.created_at DESC
         LIMIT 50`,
        [session.organizationId]
    );

    return NextResponse.json({ history });
}

// POST ?action=restore with body { history_id }
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { history_id } = await req.json();
    if (!history_id) return NextResponse.json({ error: 'history_id required' }, { status: 400 });

    // Verify history row belongs to this org
    const hist = await db.one(
        `SELECT h.*, m.id AS map_id
         FROM bar_map_history h
         JOIN bar_maps m ON m.id = h.bar_map_id
         WHERE h.id = $1 AND m.organization_id = $2`,
        [history_id, session.organizationId]
    );
    if (!hist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.execute(
        `UPDATE bar_maps SET map_data=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(hist.map_data), hist.map_id]
    );

    // Save a new history entry recording the rollback
    await db.execute(
        `INSERT INTO bar_map_history (organization_id, bar_map_id, map_data, saved_by_name, description)
         VALUES ($1,$2,$3,$4,$5)`,
        [
            session.organizationId,
            hist.map_id,
            JSON.stringify(hist.map_data),
            `${session.firstName} ${session.lastName}`.trim() || 'Admin',
            `Restored to save from ${new Date(hist.created_at).toLocaleString()}`,
        ]
    );

    return NextResponse.json({ ok: true, map_data: hist.map_data });
}
