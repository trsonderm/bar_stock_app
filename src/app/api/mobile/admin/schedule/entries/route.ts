/**
 * GET    /api/mobile/admin/schedule/entries?start=YYYY-MM-DD&end=YYYY-MM-DD[&locationId=]
 *        — list schedule entries in a date range
 *
 * POST   /api/mobile/admin/schedule/entries
 *        — assign users to a shift on one or more dates
 *        Body: { userIds, shiftId, dates, locationId?, isRecurring? }
 *
 * PUT    /api/mobile/admin/schedule/entries
 *        — update a schedule entry (shift or date)
 *        Body: { id, shiftId?, date?, modifyStrategy? }
 *        modifyStrategy: "instance" | "following" | "all"  (default: "instance")
 *
 * DELETE /api/mobile/admin/schedule/entries
 *        — remove a schedule entry
 *        Body: { id, modifyStrategy? }
 *
 * Requires admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { searchParams } = req.nextUrl;
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    if (!start || !end) return NextResponse.json({ error: 'start and end are required' }, { status: 400 });

    const locationId = searchParams.get('locationId');

    const locationFilter = locationId
        ? `AND (ul.location_id = ${parseInt(locationId)} OR sh.location_id = ${parseInt(locationId)} OR (sh.location_id IS NULL AND ul.location_id IS NULL))`
        : '';

    const schedules = await db.query(
        `SELECT us.id, us.user_id, us.shift_id, us.date, us.recurring_group_id,
                u.first_name, u.last_name, u.display_name,
                sh.label AS shift_label, sh.start_time, sh.end_time, sh.color, sh.location_id
         FROM user_schedules us
         JOIN users u ON u.id = us.user_id
         JOIN shifts sh ON sh.id = us.shift_id
         LEFT JOIN user_locations ul ON ul.user_id = us.user_id AND ul.organization_id = $1
         WHERE us.organization_id = $1
           AND us.date >= $2 AND us.date <= $3
           ${locationFilter}
         ORDER BY us.date ASC, sh.start_time ASC`,
        [session.organizationId, start, end]
    );

    return NextResponse.json({ schedules });
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { userIds, shiftId, dates, locationId, isRecurring } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) return NextResponse.json({ error: 'userIds[] required' }, { status: 400 });
    if (!shiftId) return NextResponse.json({ error: 'shiftId required' }, { status: 400 });
    if (!Array.isArray(dates) || dates.length === 0) return NextResponse.json({ error: 'dates[] required' }, { status: 400 });

    const recurringGroupId = isRecurring && dates.length > 1 ? randomUUID() : null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const userId of userIds) {
            for (const date of dates) {
                // Delete any existing entry for this user/date first
                await client.query(
                    'DELETE FROM user_schedules WHERE organization_id = $1 AND user_id = $2 AND date = $3',
                    [session.organizationId, userId, date]
                );
                await client.query(
                    `INSERT INTO user_schedules (organization_id, user_id, shift_id, date, recurring_group_id)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [session.organizationId, userId, shiftId, date, recurringGroupId]
                );
            }
        }
        await client.query('COMMIT');
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function PUT(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id, shiftId, date, modifyStrategy = 'instance' } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const entry = await db.query(
        'SELECT * FROM user_schedules WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    if (!entry.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (shiftId !== undefined) { updates.push(`shift_id = $${idx++}`); params.push(shiftId); }
    if (date !== undefined) { updates.push(`date = $${idx++}`); params.push(date); }
    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const { recurring_group_id, date: entryDate } = entry[0];

    if (modifyStrategy === 'all' && recurring_group_id) {
        params.push(recurring_group_id, session.organizationId);
        await db.execute(
            `UPDATE user_schedules SET ${updates.join(', ')} WHERE recurring_group_id = $${idx++} AND organization_id = $${idx}`,
            params
        );
    } else if (modifyStrategy === 'following' && recurring_group_id) {
        params.push(recurring_group_id, entryDate, session.organizationId);
        await db.execute(
            `UPDATE user_schedules SET ${updates.join(', ')} WHERE recurring_group_id = $${idx++} AND date >= $${idx++} AND organization_id = $${idx}`,
            params
        );
    } else {
        // instance: detach from recurring group on edit
        updates.push(`recurring_group_id = NULL`);
        params.push(id, session.organizationId);
        await db.execute(
            `UPDATE user_schedules SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
            params
        );
    }

    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id, modifyStrategy = 'instance' } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const entry = await db.query(
        'SELECT * FROM user_schedules WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    if (!entry.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

    const { recurring_group_id, date: entryDate } = entry[0];

    if (modifyStrategy === 'all' && recurring_group_id) {
        await db.execute(
            'DELETE FROM user_schedules WHERE recurring_group_id = $1 AND organization_id = $2',
            [recurring_group_id, session.organizationId]
        );
    } else if (modifyStrategy === 'following' && recurring_group_id) {
        await db.execute(
            'DELETE FROM user_schedules WHERE recurring_group_id = $1 AND date >= $2 AND organization_id = $3',
            [recurring_group_id, entryDate, session.organizationId]
        );
    } else {
        await db.execute(
            'DELETE FROM user_schedules WHERE id = $1 AND organization_id = $2',
            [id, session.organizationId]
        );
    }

    return NextResponse.json({ ok: true });
}
