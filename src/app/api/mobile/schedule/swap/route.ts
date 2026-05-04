import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { notify } from '@/lib/push-notifications';

// GET /api/mobile/schedule/swap — list swap requests involving this user
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const status = req.nextUrl.searchParams.get('status'); // optional filter

        const swaps = await db.query(
            `SELECT ssr.id, ssr.status, ssr.message, ssr.decline_reason,
                    ssr.requester_id, ssr.target_id,
                    ssr.employee_responded_at, ssr.manager_responded_at,
                    ssr.created_at,
                    COALESCE(ru.display_name, ru.first_name || ' ' || ru.last_name) AS requester_name,
                    ru.profile_picture AS requester_avatar,
                    COALESCE(tu.display_name, tu.first_name || ' ' || tu.last_name) AS target_name,
                    tu.profile_picture AS target_avatar,
                    rs.date AS requester_date,
                    rsh.label AS requester_shift, rsh.start_time AS requester_start, rsh.end_time AS requester_end,
                    ts.date AS target_date,
                    tsh.label AS target_shift, tsh.start_time AS target_start, tsh.end_time AS target_end
             FROM shift_swap_requests ssr
             JOIN users ru ON ru.id = ssr.requester_id
             JOIN users tu ON tu.id = ssr.target_id
             JOIN user_schedules rs ON rs.id = ssr.requester_schedule_id
             JOIN user_schedules ts ON ts.id = ssr.target_schedule_id
             JOIN shifts rsh ON rsh.id = rs.shift_id
             JOIN shifts tsh ON tsh.id = ts.shift_id
             WHERE ssr.organization_id = $1
               AND (ssr.requester_id = $2 OR ssr.target_id = $2)
               ${status ? `AND ssr.status = '${status.replace(/'/g, "''")}'` : ''}
             ORDER BY ssr.created_at DESC
             LIMIT 50`,
            [session.organizationId, session.id]
        );

        // Enrich each swap with a human-readable status message
        const enriched = swaps.map((s: any) => ({
            ...s,
            status_detail: getStatusDetail(s, session.id),
        }));

        return NextResponse.json({ swaps: enriched });
    } catch (err) {
        console.error('Swap GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function getStatusDetail(swap: any, myId: number): string {
    const iAmRequester = swap.requester_id === myId;
    const iAmTarget = swap.target_id === myId;

    switch (swap.status) {
        case 'pending_employee':
            if (iAmTarget) return `${swap.requester_name} wants to swap shifts with you. Waiting for your response.`;
            return `Waiting for ${swap.target_name} to accept or decline your swap request.`;

        case 'pending_manager':
            // Both employees agreed, waiting for manager
            if (iAmRequester) return `${swap.target_name} accepted! Waiting for a manager to approve.`;
            if (iAmTarget) return `You accepted. Waiting for a manager to approve the swap.`;
            return 'Both employees agreed. Waiting for manager approval.';

        case 'approved':
            return `Swap approved! ${swap.requester_name} and ${swap.target_name} have swapped shifts.`;

        case 'declined':
            if (swap.decline_reason) return `Swap declined: ${swap.decline_reason}`;
            return 'Swap request was declined.';

        default:
            return swap.status;
    }
}

// POST /api/mobile/schedule/swap — create a new swap request
// Body: { my_schedule_id, their_schedule_id, target_user_id, message? }
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { my_schedule_id, their_schedule_id, target_user_id, message } = await req.json();
        if (!my_schedule_id || !their_schedule_id || !target_user_id) {
            return NextResponse.json({ error: 'my_schedule_id, their_schedule_id, and target_user_id required' }, { status: 400 });
        }

        // Verify both schedules belong to this org
        const [mySchedule, theirSchedule] = await Promise.all([
            db.one('SELECT id, user_id, date FROM user_schedules WHERE id = $1 AND organization_id = $2 AND user_id = $3',
                [my_schedule_id, session.organizationId, session.id]),
            db.one('SELECT id, user_id, date FROM user_schedules WHERE id = $1 AND organization_id = $2 AND user_id = $3',
                [their_schedule_id, session.organizationId, target_user_id]),
        ]);

        if (!mySchedule) return NextResponse.json({ error: 'Your schedule entry not found' }, { status: 404 });
        if (!theirSchedule) return NextResponse.json({ error: 'Target schedule entry not found' }, { status: 404 });

        // Check no duplicate pending request
        const existing = await db.query(
            `SELECT id FROM shift_swap_requests
             WHERE organization_id = $1
               AND requester_id = $2
               AND requester_schedule_id = $3
               AND status IN ('pending_employee','pending_manager')`,
            [session.organizationId, session.id, my_schedule_id]
        );
        if (existing.length > 0) {
            return NextResponse.json({ error: 'A pending swap request already exists for that shift' }, { status: 409 });
        }

        const row = await db.one(
            `INSERT INTO shift_swap_requests
               (organization_id, requester_id, target_id, requester_schedule_id, target_schedule_id, message)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [session.organizationId, session.id, target_user_id, my_schedule_id, their_schedule_id, message || null]
        );

        // Notify target employee
        const myName = `${session.firstName} ${session.lastName}`;
        await notify(
            target_user_id,
            session.organizationId,
            'swap_request',
            '🔄 Shift Swap Request',
            `${myName} wants to swap shifts with you on ${mySchedule.date}`,
            { swap_id: String(row.id), type: 'swap_request' }
        );

        return NextResponse.json({ ok: true, swap_id: row.id });
    } catch (err) {
        console.error('Swap POST error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/mobile/schedule/swap — respond to a swap (employee accept/decline)
// Body: { swap_id, action: 'accept' | 'decline', decline_reason? }
export async function PATCH(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { swap_id, action, decline_reason } = await req.json();
        if (!swap_id || !['accept', 'decline'].includes(action)) {
            return NextResponse.json({ error: 'swap_id and action (accept|decline) required' }, { status: 400 });
        }

        const swap = await db.one(
            `SELECT ssr.*,
                    COALESCE(ru.display_name, ru.first_name||' '||ru.last_name) AS requester_name,
                    COALESCE(tu.display_name, tu.first_name||' '||tu.last_name) AS target_name,
                    rs.date AS requester_date, ts.date AS target_date
             FROM shift_swap_requests ssr
             JOIN users ru ON ru.id = ssr.requester_id
             JOIN users tu ON tu.id = ssr.target_id
             JOIN user_schedules rs ON rs.id = ssr.requester_schedule_id
             JOIN user_schedules ts ON ts.id = ssr.target_schedule_id
             WHERE ssr.id = $1 AND ssr.organization_id = $2`,
            [swap_id, session.organizationId]
        );

        if (!swap) return NextResponse.json({ error: 'Swap not found' }, { status: 404 });
        if (swap.target_id !== session.id) return NextResponse.json({ error: 'Not your swap to respond to' }, { status: 403 });
        if (swap.status !== 'pending_employee') return NextResponse.json({ error: 'Swap is not awaiting your response' }, { status: 409 });

        if (action === 'decline') {
            await db.execute(
                `UPDATE shift_swap_requests SET status = 'declined', employee_responded_at = NOW(), decline_reason = $1, updated_at = NOW() WHERE id = $2`,
                [decline_reason || 'Declined by employee', swap_id]
            );
            await notify(swap.requester_id, session.organizationId, 'swap_declined',
                '❌ Swap Declined',
                `${swap.target_name} declined your swap request for ${swap.requester_date}`,
                { swap_id: String(swap_id), type: 'swap_declined' }
            );
        } else {
            // Accept → move to pending_manager
            await db.execute(
                `UPDATE shift_swap_requests SET status = 'pending_manager', employee_responded_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [swap_id]
            );

            // Notify requester
            await notify(swap.requester_id, session.organizationId, 'swap_accepted_employee',
                '✅ Swap Accepted',
                `${swap.target_name} accepted your swap request! Waiting for manager approval.`,
                { swap_id: String(swap_id), type: 'swap_accepted_employee' }
            );

            // Notify all admins in the org
            const admins = await db.query(
                `SELECT id FROM users WHERE organization_id = $1 AND role = 'admin' AND COALESCE(is_archived,false) = false`,
                [session.organizationId]
            );
            for (const admin of admins) {
                await notify(admin.id, session.organizationId, 'swap_pending_approval',
                    '⏳ Shift Swap Needs Approval',
                    `${swap.requester_name} and ${swap.target_name} agreed to swap shifts. Action required.`,
                    { swap_id: String(swap_id), type: 'swap_pending_approval' }
                );
            }
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Swap PATCH error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
