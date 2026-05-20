import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { notify } from '@/lib/push-notifications';

async function ensureSwapColumns() {
    try {
        await db.execute(`ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) NOT NULL DEFAULT 'direct'`);
        await db.execute(`ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS is_giveaway BOOLEAN NOT NULL DEFAULT false`);
    } catch {}
}

// GET /api/mobile/schedule/swap — list swap requests
// Admins see all org swaps (defaulting to pending_manager); employees see their own + open requests
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const isAdmin = session.role === 'admin';
        const status = req.nextUrl.searchParams.get('status');

        // Admins: show all org swaps (default to pending_manager queue); employees: their own + open
        const whereClause = isAdmin
            ? (status ? `AND ssr.status = '${status.replace(/'/g, "''")}'` : `AND ssr.status = 'pending_manager'`)
            : `AND (
                   ssr.requester_id = $2
                   OR ssr.target_id = $2
                   OR (COALESCE(ssr.request_type,'direct') = 'open' AND ssr.status = 'open')
               )
               ${status ? `AND ssr.status = '${status.replace(/'/g, "''")}'` : ''}`;

        const queryParams: any[] = isAdmin ? [session.organizationId] : [session.organizationId, session.id];

        const swaps = await db.query(
            `SELECT ssr.id, ssr.status, ssr.message, ssr.decline_reason,
                    ssr.requester_id, ssr.target_id,
                    COALESCE(ssr.request_type, 'direct') AS request_type,
                    COALESCE(ssr.is_giveaway, false) AS is_giveaway,
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
             LEFT JOIN users tu ON tu.id = ssr.target_id
             JOIN user_schedules rs ON rs.id = ssr.requester_schedule_id
             JOIN shifts rsh ON rsh.id = rs.shift_id
             LEFT JOIN user_schedules ts ON ts.id = ssr.target_schedule_id
             LEFT JOIN shifts tsh ON tsh.id = ts.shift_id
             WHERE ssr.organization_id = $1
             ${whereClause}
             ORDER BY ssr.created_at DESC
             LIMIT 100`,
            queryParams
        );

        const enriched = swaps.map((s: any) => ({
            ...s,
            status_detail: getStatusDetail(s, session.id),
        }));

        return NextResponse.json({ swaps: enriched, is_admin: isAdmin });
    } catch (err) {
        console.error('Swap GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function getStatusDetail(swap: any, myId: number): string {
    const iAmRequester = swap.requester_id === myId;
    const iAmTarget = swap.target_id === myId;
    const isOpen = swap.request_type === 'open';
    const isGiveaway = swap.is_giveaway;

    switch (swap.status) {
        case 'open':
            if (iAmRequester) {
                return isGiveaway
                    ? `You've posted your ${swap.requester_shift} shift on ${swap.requester_date} for anyone to take.`
                    : `You've posted your ${swap.requester_shift} shift on ${swap.requester_date} as open for anyone to swap with.`;
            }
            return isGiveaway
                ? `${swap.requester_name} is giving away their ${swap.requester_shift} shift on ${swap.requester_date}. Tap to claim it.`
                : `${swap.requester_name} is looking for someone to swap their ${swap.requester_shift} shift on ${swap.requester_date}.`;

        case 'pending_employee':
            if (iAmTarget) return `${swap.requester_name} wants to swap shifts with you. Waiting for your response.`;
            return `Waiting for ${swap.target_name} to accept or decline your swap request.`;

        case 'pending_manager':
            if (isOpen) {
                if (iAmRequester) return `${swap.target_name || 'Someone'} claimed your open shift request. Waiting for a manager to approve.`;
                if (iAmTarget) return `You claimed this open shift. Waiting for a manager to approve.`;
            }
            if (iAmRequester) return `${swap.target_name} accepted! Waiting for a manager to approve.`;
            if (iAmTarget) return `You accepted. Waiting for a manager to approve the swap.`;
            return 'Both parties agreed. Waiting for manager approval.';

        case 'approved':
            if (isGiveaway) {
                if (iAmRequester) return `Approved! ${swap.target_name} is now covering your ${swap.requester_shift} shift on ${swap.requester_date}.`;
                if (iAmTarget) return `Approved! You are now working the ${swap.requester_shift} shift on ${swap.requester_date}.`;
            }
            return `Swap approved! ${swap.requester_name} and ${swap.target_name} have swapped shifts.`;

        case 'declined':
            if (swap.decline_reason) return `Swap declined: ${swap.decline_reason}`;
            return 'Swap request was declined.';

        default:
            return swap.status;
    }
}

// POST /api/mobile/schedule/swap — create a swap request
// Direct swap: { my_schedule_id, their_schedule_id, target_user_id, message? }
// Open request: { my_schedule_id, is_giveaway?, message? }  (omit target fields)
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await ensureSwapColumns();

        const { my_schedule_id, their_schedule_id, target_user_id, message, is_giveaway } = await req.json();
        if (!my_schedule_id) {
            return NextResponse.json({ error: 'my_schedule_id is required' }, { status: 400 });
        }

        const isOpen = !target_user_id && !their_schedule_id;

        const mySchedule = await db.one(
            'SELECT id, user_id, date FROM user_schedules WHERE id = $1 AND organization_id = $2 AND user_id = $3',
            [my_schedule_id, session.organizationId, session.id]
        );
        if (!mySchedule) return NextResponse.json({ error: 'Your schedule entry not found' }, { status: 404 });

        const existing = await db.query(
            `SELECT id FROM shift_swap_requests
             WHERE organization_id = $1
               AND requester_id = $2
               AND requester_schedule_id = $3
               AND status IN ('pending_employee','pending_manager','open')`,
            [session.organizationId, session.id, my_schedule_id]
        );
        if (existing.length > 0) {
            return NextResponse.json({ error: 'A pending swap request already exists for that shift' }, { status: 409 });
        }

        const myName = `${session.firstName} ${session.lastName}`;

        if (isOpen) {
            const row = await db.one(
                `INSERT INTO shift_swap_requests
                   (organization_id, requester_id, requester_schedule_id, request_type, is_giveaway, status, message)
                 VALUES ($1,$2,$3,'open',$4,'open',$5) RETURNING id`,
                [session.organizationId, session.id, my_schedule_id, is_giveaway === true, message || null]
            );

            const orgUsers = await db.query(
                `SELECT id FROM users WHERE organization_id = $1 AND id != $2 AND COALESCE(is_archived,false) = false`,
                [session.organizationId, session.id]
            );
            const notifTitle = is_giveaway ? '📢 Shift Available to Claim' : '📢 Open Shift Swap Available';
            const notifBody = is_giveaway
                ? `${myName} is giving away their shift on ${mySchedule.date}. Tap to claim it.`
                : `${myName} is looking for someone to swap their shift on ${mySchedule.date}.`;

            for (const u of orgUsers) {
                await notify(u.id, session.organizationId, 'open_swap_request', notifTitle, notifBody, {
                    swap_id: String(row.id), type: 'open_swap_request'
                });
            }

            return NextResponse.json({ ok: true, swap_id: row.id });
        }

        // Direct swap — both target fields required
        if (!their_schedule_id || !target_user_id) {
            return NextResponse.json({ error: 'their_schedule_id and target_user_id are required for a direct swap' }, { status: 400 });
        }

        const theirSchedule = await db.one(
            'SELECT id, user_id, date FROM user_schedules WHERE id = $1 AND organization_id = $2 AND user_id = $3',
            [their_schedule_id, session.organizationId, target_user_id]
        );
        if (!theirSchedule) return NextResponse.json({ error: 'Target schedule entry not found' }, { status: 404 });

        const row = await db.one(
            `INSERT INTO shift_swap_requests
               (organization_id, requester_id, target_id, requester_schedule_id, target_schedule_id, request_type, message)
             VALUES ($1,$2,$3,$4,$5,'direct',$6) RETURNING id`,
            [session.organizationId, session.id, target_user_id, my_schedule_id, their_schedule_id, message || null]
        );

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

// PUT /api/mobile/schedule/swap — claim an open shift request
// Body: { swap_id, my_schedule_id? }  (my_schedule_id required for open swaps, not giveaways)
export async function PUT(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { swap_id, my_schedule_id } = await req.json();
        if (!swap_id) return NextResponse.json({ error: 'swap_id is required' }, { status: 400 });

        const swap = await db.one(
            `SELECT ssr.*,
                    COALESCE(ru.display_name, ru.first_name||' '||ru.last_name) AS requester_name,
                    rs.date AS requester_date
             FROM shift_swap_requests ssr
             JOIN users ru ON ru.id = ssr.requester_id
             JOIN user_schedules rs ON rs.id = ssr.requester_schedule_id
             WHERE ssr.id = $1 AND ssr.organization_id = $2`,
            [swap_id, session.organizationId]
        );

        if (!swap) return NextResponse.json({ error: 'Swap request not found' }, { status: 404 });
        if ((swap.request_type || 'direct') !== 'open') return NextResponse.json({ error: 'This is not an open request' }, { status: 400 });
        if (swap.status !== 'open') return NextResponse.json({ error: 'This request is no longer open' }, { status: 409 });
        if (swap.requester_id === session.id) return NextResponse.json({ error: 'You cannot claim your own request' }, { status: 400 });

        let targetScheduleId: number | null = null;

        if (!swap.is_giveaway) {
            if (!my_schedule_id) return NextResponse.json({ error: 'my_schedule_id is required to claim a swap request' }, { status: 400 });
            const mySchedule = await db.one(
                'SELECT id FROM user_schedules WHERE id = $1 AND organization_id = $2 AND user_id = $3',
                [my_schedule_id, session.organizationId, session.id]
            );
            if (!mySchedule) return NextResponse.json({ error: 'Your schedule entry not found' }, { status: 404 });
            targetScheduleId = my_schedule_id;
        }

        await db.execute(
            `UPDATE shift_swap_requests
             SET target_id = $1, target_schedule_id = $2, status = 'pending_manager', employee_responded_at = NOW(), updated_at = NOW()
             WHERE id = $3`,
            [session.id, targetScheduleId, swap_id]
        );

        const claimerName = `${session.firstName} ${session.lastName}`;

        await notify(
            swap.requester_id, session.organizationId, 'open_swap_claimed',
            '🙋 Open Shift Claimed',
            `${claimerName} has claimed your open shift request for ${swap.requester_date}. Waiting for manager approval.`,
            { swap_id: String(swap_id), type: 'open_swap_claimed' }
        );

        const admins = await db.query(
            `SELECT id FROM users WHERE organization_id = $1 AND role = 'admin' AND COALESCE(is_archived,false) = false`,
            [session.organizationId]
        );
        for (const admin of admins) {
            await notify(
                admin.id, session.organizationId, 'swap_pending_approval',
                '⏳ Open Shift Needs Approval',
                `${claimerName} claimed ${swap.requester_name}'s open shift request for ${swap.requester_date}. Action required.`,
                { swap_id: String(swap_id), type: 'swap_pending_approval' }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Swap PUT error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/mobile/schedule/swap — employee respond OR admin approve/decline
// Employee body: { swap_id, action: 'accept' | 'decline', decline_reason? }
// Admin body:    { swap_id, action: 'approve' | 'manager_decline', decline_reason? }
export async function PATCH(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { swap_id, action, decline_reason } = await req.json();
        if (!swap_id || !['accept', 'decline', 'approve', 'manager_decline'].includes(action)) {
            return NextResponse.json({ error: 'swap_id and action (accept|decline|approve|manager_decline) required' }, { status: 400 });
        }

        const isAdmin = session.role === 'admin';
        const isAdminAction = action === 'approve' || action === 'manager_decline';

        if (isAdminAction && !isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const swap = await db.one(
            `SELECT ssr.*,
                    COALESCE(ssr.request_type, 'direct') AS request_type,
                    COALESCE(ssr.is_giveaway, false) AS is_giveaway,
                    COALESCE(ru.display_name, ru.first_name||' '||ru.last_name) AS requester_name,
                    COALESCE(tu.display_name, tu.first_name||' '||tu.last_name) AS target_name,
                    rs.date AS requester_date, rs.shift_id AS requester_shift_id,
                    ts.date AS target_date, ts.shift_id AS target_shift_id,
                    rsh.label AS requester_shift_name, tsh.label AS target_shift_name
             FROM shift_swap_requests ssr
             JOIN users ru ON ru.id = ssr.requester_id
             LEFT JOIN users tu ON tu.id = ssr.target_id
             JOIN user_schedules rs ON rs.id = ssr.requester_schedule_id
             JOIN shifts rsh ON rsh.id = rs.shift_id
             LEFT JOIN user_schedules ts ON ts.id = ssr.target_schedule_id
             LEFT JOIN shifts tsh ON tsh.id = ts.shift_id
             WHERE ssr.id = $1 AND ssr.organization_id = $2`,
            [swap_id, session.organizationId]
        );

        if (!swap) return NextResponse.json({ error: 'Swap not found' }, { status: 404 });

        const managerName = `${session.firstName} ${session.lastName}`;

        // ── Admin: approve or decline a pending_manager swap ─────────────────
        if (isAdminAction) {
            if (swap.status !== 'pending_manager') {
                return NextResponse.json({ error: 'Swap is not awaiting manager approval' }, { status: 409 });
            }

            if (action === 'manager_decline') {
                const reason = decline_reason || `Declined by ${managerName}`;
                await db.execute(
                    `UPDATE shift_swap_requests
                     SET status = 'declined', manager_id = $1, manager_responded_at = NOW(), decline_reason = $2, updated_at = NOW()
                     WHERE id = $3`,
                    [session.id, reason, swap_id]
                );
                const msg = `Your shift swap was declined by ${managerName}${decline_reason ? `: ${decline_reason}` : '.'}`;
                const notifyIds = [swap.requester_id, ...(swap.target_id ? [swap.target_id] : [])];
                await Promise.all(notifyIds.map((uid: number) =>
                    notify(uid, session.organizationId, 'swap_manager_declined', '❌ Swap Declined by Manager', msg, { swap_id: String(swap_id), type: 'swap_manager_declined' })
                ));
            } else {
                // approve — mutate user_schedules
                if (swap.is_giveaway) {
                    // Giveaway: reassign requester's schedule entry to claimer
                    await db.execute(
                        `UPDATE user_schedules SET user_id = $1 WHERE id = $2`,
                        [swap.target_id, swap.requester_schedule_id]
                    );
                } else {
                    // Swap: exchange shift_id between both schedule entries
                    await db.execute(
                        `UPDATE user_schedules SET shift_id = $1 WHERE id = $2`,
                        [swap.target_shift_id, swap.requester_schedule_id]
                    );
                    await db.execute(
                        `UPDATE user_schedules SET shift_id = $1 WHERE id = $2`,
                        [swap.requester_shift_id, swap.target_schedule_id]
                    );
                }

                await db.execute(
                    `UPDATE shift_swap_requests
                     SET status = 'approved', manager_id = $1, manager_responded_at = NOW(), updated_at = NOW()
                     WHERE id = $2`,
                    [session.id, swap_id]
                );

                if (swap.is_giveaway) {
                    await Promise.all([
                        notify(swap.requester_id, session.organizationId, 'swap_approved', '✅ Shift Giveaway Approved!',
                            `Your ${swap.requester_shift_name} shift on ${swap.requester_date} has been transferred to ${swap.target_name}. Approved by ${managerName}.`,
                            { swap_id: String(swap_id), type: 'swap_approved' }),
                        ...(swap.target_id ? [notify(swap.target_id, session.organizationId, 'swap_approved', '✅ Shift Giveaway Approved!',
                            `You are now working the ${swap.requester_shift_name} shift on ${swap.requester_date}. Approved by ${managerName}.`,
                            { swap_id: String(swap_id), type: 'swap_approved' })] : []),
                    ]);
                } else {
                    await Promise.all([
                        notify(swap.requester_id, session.organizationId, 'swap_approved', '✅ Shift Swap Approved!',
                            `Shift swap approved by ${managerName}! You are now working ${swap.target_name}'s shift.`,
                            { swap_id: String(swap_id), type: 'swap_approved' }),
                        ...(swap.target_id ? [notify(swap.target_id, session.organizationId, 'swap_approved', '✅ Shift Swap Approved!',
                            `Shift swap approved by ${managerName}! You are now working ${swap.requester_name}'s shift.`,
                            { swap_id: String(swap_id), type: 'swap_approved' })] : []),
                    ]);
                }
            }

            return NextResponse.json({ ok: true });
        }

        // ── Employee: accept or decline a direct swap (pending_employee) ──────
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
            await db.execute(
                `UPDATE shift_swap_requests SET status = 'pending_manager', employee_responded_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [swap_id]
            );

            await notify(swap.requester_id, session.organizationId, 'swap_accepted_employee',
                '✅ Swap Accepted',
                `${swap.target_name} accepted your swap request! Waiting for manager approval.`,
                { swap_id: String(swap_id), type: 'swap_accepted_employee' }
            );

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
