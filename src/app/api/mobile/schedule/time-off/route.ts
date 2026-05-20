import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { notify } from '@/lib/push-notifications';

// GET /api/mobile/schedule/time-off — list time-off requests
// Admins see all org requests (defaulting to pending); employees see only their own
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const isAdmin = session.role === 'admin';
        const status = req.nextUrl.searchParams.get('status');

        let rows: any[];

        if (isAdmin) {
            rows = await db.query(
                `SELECT tor.id, tor.start_date, tor.end_date, tor.reason, tor.status,
                        tor.user_id, tor.created_at, tor.reviewed_at, tor.decline_reason,
                        COALESCE(eu.display_name, eu.first_name || ' ' || eu.last_name) AS employee_name,
                        eu.profile_picture AS employee_avatar,
                        COALESCE(ru.display_name, ru.first_name || ' ' || ru.last_name) AS reviewed_by_name
                 FROM time_off_requests tor
                 JOIN users eu ON eu.id = tor.user_id
                 LEFT JOIN users ru ON ru.id = tor.reviewed_by
                 WHERE tor.organization_id = $1
                   ${status ? `AND tor.status = '${status.replace(/'/g, "''")}'` : `AND tor.status = 'pending'`}
                 ORDER BY tor.created_at DESC
                 LIMIT 100`,
                [session.organizationId]
            );
        } else {
            rows = await db.query(
                `SELECT tor.id, tor.start_date, tor.end_date, tor.reason, tor.status,
                        tor.created_at, tor.reviewed_at,
                        COALESCE(ru.display_name, ru.first_name || ' ' || ru.last_name) AS reviewed_by_name
                 FROM time_off_requests tor
                 LEFT JOIN users ru ON ru.id = tor.reviewed_by
                 WHERE tor.organization_id = $1 AND tor.user_id = $2
                   ${status ? `AND tor.status = '${status.replace(/'/g, "''")}'` : ''}
                 ORDER BY tor.created_at DESC
                 LIMIT 50`,
                [session.organizationId, session.id]
            );
        }

        return NextResponse.json({ requests: rows, is_admin: isAdmin });
    } catch (err) {
        console.error('Time-off GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/mobile/schedule/time-off — submit a time-off request
// Body: { start_date: YYYY-MM-DD, end_date: YYYY-MM-DD, reason? }
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { start_date, end_date, reason } = await req.json();
        if (!start_date || !end_date) {
            return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 });
        }
        if (end_date < start_date) {
            return NextResponse.json({ error: 'end_date must be on or after start_date' }, { status: 400 });
        }

        const row = await db.one(
            `INSERT INTO time_off_requests (organization_id, user_id, start_date, end_date, reason)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [session.organizationId, session.id, start_date, end_date, reason || null]
        );

        // Notify all admins
        const myName = `${session.firstName} ${session.lastName}`;
        const admins = await db.query(
            `SELECT id FROM users WHERE organization_id = $1 AND role = 'admin' AND COALESCE(is_archived, false) = false`,
            [session.organizationId]
        );
        for (const admin of admins) {
            await notify(
                admin.id,
                session.organizationId,
                'time_off_request',
                '📅 Time-Off Request',
                `${myName} requested time off from ${start_date} to ${end_date}${reason ? `: ${reason}` : '.'}`,
                { request_id: String(row.id), type: 'time_off_request' }
            );
        }

        return NextResponse.json({ ok: true, id: row.id });
    } catch (err) {
        console.error('Time-off POST error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/mobile/schedule/time-off — admin approve or decline
// Body: { id, action: 'approve' | 'decline', note? }
export async function PATCH(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (session.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { id, action, decline_reason } = await req.json();
        if (!id || !['approve', 'decline'].includes(action)) {
            return NextResponse.json({ error: 'id and action (approve|decline) required' }, { status: 400 });
        }

        const request = await db.one(
            `SELECT tor.*, COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS employee_name
             FROM time_off_requests tor
             JOIN users u ON u.id = tor.user_id
             WHERE tor.id = $1 AND tor.organization_id = $2`,
            [id, session.organizationId]
        );

        if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        if (request.status !== 'pending') {
            return NextResponse.json({ error: 'Request has already been reviewed' }, { status: 409 });
        }

        const newStatus = action === 'approve' ? 'approved' : 'declined';
        const managerName = `${session.firstName} ${session.lastName}`;

        await db.execute(
            `UPDATE time_off_requests
             SET status = $1, reviewed_by = $2, reviewed_at = NOW(), decline_reason = $3
             WHERE id = $4`,
            [newStatus, session.id, action === 'decline' ? (decline_reason || `Declined by ${managerName}`) : null, id]
        );

        const icon = action === 'approve' ? '✅' : '❌';
        const verb = action === 'approve' ? 'approved' : 'declined';
        await notify(
            request.user_id,
            session.organizationId,
            `time_off_${newStatus}`,
            `${icon} Time-Off Request ${verb.charAt(0).toUpperCase() + verb.slice(1)}`,
            `${managerName} ${verb} your time-off request from ${request.start_date} to ${request.end_date}${decline_reason ? `: ${decline_reason}` : '.'}`,
            { request_id: String(id), type: `time_off_${newStatus}` }
        );

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Time-off PATCH error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
