/**
 * /api/admin/schedule — staff schedule entries (user_schedules), admin only.
 *
 *  GET    ?start=&end=&locationId= entries in a date range
 *  POST   { userIds, shiftId, dates, isRecurring } assign a shift (replaces that
 *         user's entry on each date); recurring assignments share a recurring_group_id
 *  PUT    { id, userId, shiftId, modifyStrategy: 'instance' | 'following' | 'all', ... }
 *  DELETE { id, modifyStrategy, recurringGroupId, date }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { randomUUID } from 'crypto';

/** True if the shift and every user id belong to the organization. */
async function ownsShiftAndUsers(organizationId: number, shiftId: unknown, userIds: unknown[]): Promise<boolean> {
    const shift = await db.one('SELECT id FROM shifts WHERE id = $1 AND organization_id = $2', [shiftId, organizationId]);
    if (!shift) return false;
    const ids = [...new Set(userIds.map(Number))];
    const users = await db.query('SELECT id FROM users WHERE id = ANY($1::int[]) AND organization_id = $2', [ids, organizationId]);
    return users.length === ids.length;
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const locationId = searchParams.get('locationId');

    if (!start || !end) {
        return NextResponse.json({ error: 'Start and End dates required' }, { status: 400 });
    }

    try {
        const params: any[] = [session.organizationId, start, end];
        const locationFilter = locationId
            ? `AND us.user_id IN (SELECT user_id FROM user_locations WHERE location_id = $${params.push(parseInt(locationId))})`
            : '';

        const schedules = await db.query(`
            SELECT us.*, u.first_name, u.last_name, s.label as shift_name, s.start_time, s.end_time, s.color
            FROM user_schedules us
            JOIN users u ON us.user_id = u.id
            JOIN shifts s ON us.shift_id = s.id
            WHERE us.organization_id = $1
            AND us.date >= $2 AND us.date <= $3
            ${locationFilter}
            ORDER BY us.date ASC
        `, params);

        return NextResponse.json({ schedules });
    } catch (error) {
        console.error('Error fetching schedules:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { userIds, shiftId, dates, isRecurring } = body;

        if (!userIds || !shiftId || !dates || !Array.isArray(userIds) || !Array.isArray(dates)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const organizationId = session.organizationId;
        if (!(await ownsShiftAndUsers(organizationId, shiftId, userIds))) {
            return NextResponse.json({ error: 'Shift or user not found' }, { status: 404 });
        }
        const recurringGroupId = isRecurring && dates.length > 1 ? randomUUID() : null;

        for (const date of dates) {
            for (const userId of userIds) {
                // Delete existing schedule for this user on this date
                await db.query(`
                    DELETE FROM user_schedules 
                    WHERE organization_id = $1 AND user_id = $2 AND date = $3
                `, [organizationId, userId, date]);

                // Insert new
                await db.query(`
                    INSERT INTO user_schedules (organization_id, user_id, shift_id, date, recurring_group_id)
                    VALUES ($1, $2, $3, $4, $5)
                `, [organizationId, userId, shiftId, date, recurringGroupId]);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving schedule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { id, userId, shiftId, modifyStrategy, recurringGroupId, date } = body;

        const organizationId = session.organizationId;
        if (!(await ownsShiftAndUsers(organizationId, shiftId, [userId]))) {
            return NextResponse.json({ error: 'Shift or user not found' }, { status: 404 });
        }

        if (modifyStrategy === 'all' && recurringGroupId) {
            // Update all records with this recurring_group_id
            const existing = await db.one('SELECT user_id FROM user_schedules WHERE id = $1 AND organization_id = $2', [id, organizationId]);
            if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

            await db.query(`
                UPDATE user_schedules 
                SET user_id = $1, shift_id = $2
                WHERE organization_id = $3 AND recurring_group_id = $4 AND user_id = $5
            `, [userId, shiftId, organizationId, recurringGroupId, existing.user_id]);

        } else if (modifyStrategy === 'following' && recurringGroupId && date) {
            // Update this and following
            const existing = await db.one('SELECT user_id FROM user_schedules WHERE id = $1 AND organization_id = $2', [id, organizationId]);
            if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

            await db.query(`
                UPDATE user_schedules 
                SET user_id = $1, shift_id = $2
                WHERE organization_id = $3 AND recurring_group_id = $4 AND date >= $5 AND user_id = $6
            `, [userId, shiftId, organizationId, recurringGroupId, date, existing.user_id]);

        } else { // modifyStrategy === 'instance' or no recurring group
            // Modify just this instance
            await db.query(`
                UPDATE user_schedules 
                SET user_id = $1, shift_id = $2
                WHERE id = $3 AND organization_id = $4
            `, [userId, shiftId, id, organizationId]);

            // Detach from recurring group if it was part of one
            await db.query(`
                UPDATE user_schedules 
                SET recurring_group_id = NULL
                WHERE id = $1 AND organization_id = $2
            `, [id, organizationId]);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating schedule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { id, modifyStrategy, recurringGroupId, date } = body;

        const organizationId = session.organizationId;

        if (modifyStrategy === 'all' && recurringGroupId) {
            const existing = await db.one('SELECT user_id FROM user_schedules WHERE id = $1 AND organization_id = $2', [id, organizationId]);
            if (existing) {
                await db.query(`
                    DELETE FROM user_schedules 
                    WHERE organization_id = $1 AND recurring_group_id = $2 AND user_id = $3
                `, [organizationId, recurringGroupId, existing.user_id]);
            }
        } else if (modifyStrategy === 'following' && recurringGroupId && date) {
            const existing = await db.one('SELECT user_id FROM user_schedules WHERE id = $1 AND organization_id = $2', [id, organizationId]);
            if (existing) {
                await db.query(`
                    DELETE FROM user_schedules 
                    WHERE organization_id = $1 AND recurring_group_id = $2 AND date >= $3 AND user_id = $4
                `, [organizationId, recurringGroupId, date, existing.user_id]);
            }
        } else {
            await db.query('DELETE FROM user_schedules WHERE id = $1 AND organization_id = $2', [id, organizationId]);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
