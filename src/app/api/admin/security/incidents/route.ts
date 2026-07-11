import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { markChanged } from '@/lib/markChanged';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const incidents = await db.query(
        `SELECT si.*,
                sb.name AS barred_person_name,
                sb.photo AS barred_person_photo
         FROM security_incidents si
         LEFT JOIN security_barred sb ON sb.id = si.barred_person_id
         WHERE si.organization_id = $1
         ORDER BY COALESCE(si.incident_date, si.created_at::date) DESC, si.created_at DESC`,
        [session.organizationId]
    );

    if (incidents.length === 0) return NextResponse.json({ incidents: [] });

    const ids = incidents.map((i: any) => i.id);

    const [persons, timeline] = await Promise.all([
        db.query(
            `SELECT * FROM incident_persons WHERE incident_id = ANY($1) ORDER BY sort_order ASC, id ASC`,
            [ids]
        ),
        db.query(
            `SELECT * FROM incident_timeline WHERE incident_id = ANY($1)
             ORDER BY sort_order ASC, segment_date ASC NULLS LAST, segment_time ASC NULLS LAST`,
            [ids]
        ),
    ]);

    const personsByInc: Record<number, any[]> = {};
    for (const p of persons) {
        (personsByInc[p.incident_id] ??= []).push(p);
    }
    const timelineByInc: Record<number, any[]> = {};
    for (const t of timeline) {
        (timelineByInc[t.incident_id] ??= []).push(t);
    }

    return NextResponse.json({
        incidents: incidents.map((i: any) => ({
            ...i,
            persons: personsByInc[i.id] || [],
            timeline: timelineByInc[i.id] || [],
        })),
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    if (!isAdmin && !perms.includes('all') && !perms.includes('add_incident')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await req.json();
    const {
        incident_date, incident_time,
        media,
        persons,
        timeline,
        reported_by_user_id, reported_by_name,
        // legacy compat
        barred_person_id, person_name, description,
    } = body;

    const submittedByName = `${session.firstName} ${session.lastName}`;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const incRes = await client.query(
            `INSERT INTO security_incidents
                (organization_id, barred_person_id, person_name, description,
                 submitted_by_user_id, submitted_by_name, media,
                 incident_date, incident_time, reported_by_user_id, reported_by_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
                session.organizationId,
                barred_person_id || null,
                person_name?.trim() || null,
                description?.trim() || null,
                session.id,
                submittedByName,
                JSON.stringify(Array.isArray(media) ? media : []),
                incident_date || null,
                incident_time || null,
                reported_by_user_id || null,
                reported_by_name?.trim() || null,
            ]
        );
        const incidentId = incRes.rows[0].id;

        if (Array.isArray(persons)) {
            for (let i = 0; i < persons.length; i++) {
                const p = persons[i];
                await client.query(
                    `INSERT INTO incident_persons
                        (incident_id, organization_id, first_name, last_name, aliases, race,
                         height, weight, hair_color, clothing_description, description, media, sort_order)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                    [
                        incidentId,
                        session.organizationId,
                        p.first_name?.trim() || null,
                        p.last_name?.trim() || null,
                        JSON.stringify(Array.isArray(p.aliases) ? p.aliases : []),
                        p.race?.trim() || null,
                        p.height?.trim() || null,
                        p.weight?.trim() || null,
                        p.hair_color?.trim() || null,
                        p.clothing_description?.trim() || null,
                        p.description?.trim() || null,
                        JSON.stringify(Array.isArray(p.media) ? p.media : []),
                        i,
                    ]
                );
            }
        }

        if (Array.isArray(timeline)) {
            let order = 0;
            for (const t of timeline) {
                if (!t.description?.trim()) continue;
                await client.query(
                    `INSERT INTO incident_timeline
                        (incident_id, organization_id, segment_date, segment_time, description, sort_order)
                     VALUES ($1,$2,$3,$4,$5,$6)`,
                    [
                        incidentId,
                        session.organizationId,
                        t.segment_date || null,
                        t.segment_time || null,
                        t.description.trim(),
                        order++,
                    ]
                );
            }
        }

        await client.query('COMMIT');
        markChanged(session.organizationId, 0, 'security');
        return NextResponse.json({ ok: true, id: incidentId });
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('[admin incidents POST]', e);
        return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = session.role === 'admin';
    if (!isAdmin && !session.permissions?.includes('all')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const id = parseInt(req.nextUrl.searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.execute('DELETE FROM security_incidents WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);
    return NextResponse.json({ ok: true });
}
