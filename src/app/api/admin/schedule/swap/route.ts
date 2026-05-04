import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { notify } from '@/lib/push-notifications';

// GET /api/admin/schedule/swap?status=pending_manager — list swaps awaiting manager action
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const status = req.nextUrl.searchParams.get('status') || 'pending_manager';

    const swaps = await db.query(
        `SELECT ssr.id, ssr.status, ssr.message, ssr.decline_reason,
                ssr.requester_id, ssr.target_id, ssr.created_at,
                ssr.employee_responded_at, ssr.manager_responded_at,
                COALESCE(ru.display_name, ru.first_name||' '||ru.last_name) AS requester_name,
                ru.profile_picture AS requester_avatar,
                COALESCE(tu.display_name, tu.first_name||' '||tu.last_name) AS target_name,
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
         WHERE ssr.organization_id = $1 AND ssr.status = $2
         ORDER BY ssr.employee_responded_at DESC NULLS LAST`,
        [session.organizationId, status]
    );

    return NextResponse.json({ swaps });
}

// PATCH /api/admin/schedule/swap — manager approve or decline
// Body: { swap_id, action: 'approve' | 'decline', decline_reason? }
export async function PATCH(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { swap_id, action, decline_reason } = await req.json();
    if (!swap_id || !['approve', 'decline'].includes(action)) {
        return NextResponse.json({ error: 'swap_id and action (approve|decline) required' }, { status: 400 });
    }

    const swap = await db.one(
        `SELECT ssr.*,
                COALESCE(ru.display_name, ru.first_name||' '||ru.last_name) AS requester_name,
                COALESCE(tu.display_name, tu.first_name||' '||tu.last_name) AS target_name,
                rs.date AS requester_date, rs.shift_id AS requester_shift_id,
                ts.date AS target_date, ts.shift_id AS target_shift_id,
                rsh.label AS requester_shift_name, tsh.label AS target_shift_name
         FROM shift_swap_requests ssr
         JOIN users ru ON ru.id = ssr.requester_id
         JOIN users tu ON tu.id = ssr.target_id
         JOIN user_schedules rs ON rs.id = ssr.requester_schedule_id
         JOIN user_schedules ts ON ts.id = ssr.target_schedule_id
         JOIN shifts rsh ON rsh.id = rs.shift_id
         JOIN shifts tsh ON tsh.id = ts.shift_id
         WHERE ssr.id = $1 AND ssr.organization_id = $2`,
        [swap_id, session.organizationId]
    );

    if (!swap) return NextResponse.json({ error: 'Swap not found' }, { status: 404 });
    if (swap.status !== 'pending_manager') return NextResponse.json({ error: 'Swap is not awaiting manager approval' }, { status: 409 });

    const managerName = `${session.firstName} ${session.lastName}`;

    if (action === 'decline') {
        await db.execute(
            `UPDATE shift_swap_requests SET status = 'declined', manager_id = $1, manager_responded_at = NOW(), decline_reason = $2, updated_at = NOW() WHERE id = $3`,
            [session.id, decline_reason || `Declined by manager ${managerName}`, swap_id]
        );

        const msg = `Your shift swap was declined by ${managerName}${decline_reason ? `: ${decline_reason}` : '.'}`;
        await Promise.all([
            notify(swap.requester_id, session.organizationId, 'swap_manager_declined', '❌ Swap Declined by Manager', msg, { swap_id: String(swap_id) }),
            notify(swap.target_id, session.organizationId, 'swap_manager_declined', '❌ Swap Declined by Manager', msg, { swap_id: String(swap_id) }),
        ]);
    } else {
        // Approve — swap the shift assignments in user_schedules
        await db.execute(
            `UPDATE user_schedules SET shift_id = $1 WHERE id = $2`,
            [swap.target_shift_id, swap.requester_schedule_id]
        );
        await db.execute(
            `UPDATE user_schedules SET shift_id = $1 WHERE id = $2`,
            [swap.requester_shift_id, swap.target_schedule_id]
        );
        await db.execute(
            `UPDATE shift_swap_requests SET status = 'approved', manager_id = $1, manager_responded_at = NOW(), updated_at = NOW() WHERE id = $2`,
            [session.id, swap_id]
        );

        const approvedMsg = (name: string, otherName: string) =>
            `✅ Shift swap approved by ${managerName}! You are now working ${name}'s shift.`;

        await Promise.all([
            notify(swap.requester_id, session.organizationId, 'swap_approved', '✅ Shift Swap Approved!',
                approvedMsg(swap.target_name, swap.requester_name),
                { swap_id: String(swap_id), type: 'swap_approved' }),
            notify(swap.target_id, session.organizationId, 'swap_approved', '✅ Shift Swap Approved!',
                approvedMsg(swap.requester_name, swap.target_name),
                { swap_id: String(swap_id), type: 'swap_approved' }),
        ]);
    }

    return NextResponse.json({ ok: true });
}
