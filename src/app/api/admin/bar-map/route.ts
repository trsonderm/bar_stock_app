import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { markChanged } from '@/lib/markChanged';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const map = await db.one(
        'SELECT * FROM bar_maps WHERE organization_id = $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1',
        [session.organizationId]
    );

    return NextResponse.json({ map: map || null });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, map_data, width_ft, height_ft, description } = await req.json();
    if (!map_data) return NextResponse.json({ error: 'map_data required' }, { status: 400 });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Upsert: one active map per org
        const existing = await client.query(
            'SELECT id FROM bar_maps WHERE organization_id = $1 AND is_active = TRUE LIMIT 1',
            [session.organizationId]
        );

        let mapId: number;
        if (existing.rows.length > 0) {
            mapId = existing.rows[0].id;
            await client.query(
                `UPDATE bar_maps SET name=$2, map_data=$3, width_ft=$4, height_ft=$5, updated_at=NOW()
                 WHERE id=$1`,
                [mapId, name || 'Main Bar', JSON.stringify(map_data), width_ft || 40, height_ft || 20]
            );
        } else {
            const ins = await client.query(
                `INSERT INTO bar_maps (organization_id, name, map_data, width_ft, height_ft)
                 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                [session.organizationId, name || 'Main Bar', JSON.stringify(map_data), width_ft || 40, height_ft || 20]
            );
            mapId = ins.rows[0].id;
        }

        // Always create a history snapshot
        await client.query(
            `INSERT INTO bar_map_history (organization_id, bar_map_id, map_data, saved_by_name, description)
             VALUES ($1,$2,$3,$4,$5)`,
            [
                session.organizationId,
                mapId,
                JSON.stringify(map_data),
                `${session.firstName} ${session.lastName}`.trim() || 'Admin',
                description || null,
            ]
        );

        await client.query('COMMIT');
        markChanged(session.organizationId, 0, 'bar_map');
        return NextResponse.json({ ok: true, id: mapId });
    } catch (e: any) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        client.release();
    }
}
