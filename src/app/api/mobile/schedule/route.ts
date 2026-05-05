import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/schedule?location_id=&start=YYYY-MM-DD&end=YYYY-MM-DD&view=week|month
// Returns the full org schedule for dates requested, with the requesting user's own shifts flagged
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = req.nextUrl;
        const locationId = searchParams.get('location_id');
        const view = searchParams.get('view') || 'week';

        // Default date range
        let start = searchParams.get('start');
        let end = searchParams.get('end');
        if (!start) {
            const today = new Date();
            if (view === 'month') {
                start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
            } else {
                // Week: Mon–Sun
                const dow = today.getDay();
                const mon = new Date(today);
                mon.setDate(today.getDate() - ((dow + 6) % 7));
                const sun = new Date(mon);
                sun.setDate(mon.getDate() + 6);
                start = mon.toISOString().split('T')[0];
                end = sun.toISOString().split('T')[0];
            }
        }
        if (!end) end = start;

        // Expand fetch range 1 day earlier to capture overnight shifts that spill into range start
        const fetchStart = new Date(start + 'T00:00:00');
        fetchStart.setDate(fetchStart.getDate() - 1);
        const fetchStartStr = fetchStart.toISOString().split('T')[0];

        // Build location filter
        let locationJoin = '';
        const params: any[] = [session.organizationId, fetchStartStr, end];
        let idx = 4;

        if (locationId) {
            locationJoin = `JOIN user_locations ul ON ul.user_id = us.user_id AND ul.location_id = $${idx}`;
            params.push(parseInt(locationId));
            idx++;
        }

        const rawSchedules = await db.query(
            `SELECT us.id, us.date, us.user_id, us.shift_id, us.recurring_group_id,
                    s.label AS shift_name, s.start_time, s.end_time, s.color,
                    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS user_name,
                    u.profile_picture AS user_avatar,
                    u.position,
                    (us.user_id = $${idx}) AS is_mine
             FROM user_schedules us
             JOIN shifts s ON s.id = us.shift_id
             JOIN users u ON u.id = us.user_id
             ${locationJoin}
             WHERE us.organization_id = $1
               AND us.date BETWEEN $2 AND $3
               AND COALESCE(u.is_archived, false) = false
             ORDER BY us.date, s.start_time, u.first_name`,
            [...params, session.id]
        );

        // Annotate entries with crosses_midnight and spillover flags
        const schedules = rawSchedules.map((s: any) => {
            const [sh, sm] = s.start_time.split(':').map(Number);
            const [eh, em] = s.end_time.split(':').map(Number);
            const crossesMidnight = (sh * 60 + sm) > (eh * 60 + em);

            // Compute the spillover date (day after shift date)
            let spilloverDate: string | null = null;
            if (crossesMidnight) {
                const d = new Date(s.date + 'T00:00:00');
                d.setDate(d.getDate() + 1);
                spilloverDate = d.toISOString().split('T')[0];
            }

            return {
                ...s,
                date: typeof s.date === 'string' ? s.date.split('T')[0] : s.date,
                crosses_midnight: crossesMidnight,
                spillover_date: spilloverDate,
                // Mark if this entry was fetched only for spillover context (before requested range)
                is_pre_range: s.date < start,
            };
        });

        // Pending swap requests that involve this user (for badge/alert display)
        const pendingSwaps = await db.query(
            `SELECT ssr.id, ssr.status, ssr.message,
                    ssr.requester_id, ssr.target_id,
                    COALESCE(ru.display_name, ru.first_name || ' ' || ru.last_name) AS requester_name,
                    COALESCE(tu.display_name, tu.first_name || ' ' || tu.last_name) AS target_name,
                    rs.date AS requester_date, rs.shift_id AS requester_shift_id,
                    rsh.label AS requester_shift_name, rsh.start_time AS requester_start, rsh.end_time AS requester_end,
                    ts.date AS target_date, ts.shift_id AS target_shift_id,
                    tsh.label AS target_shift_name, tsh.start_time AS target_start, tsh.end_time AS target_end
             FROM shift_swap_requests ssr
             JOIN users ru ON ru.id = ssr.requester_id
             JOIN users tu ON tu.id = ssr.target_id
             JOIN user_schedules rs ON rs.id = ssr.requester_schedule_id
             JOIN user_schedules ts ON ts.id = ssr.target_schedule_id
             JOIN shifts rsh ON rsh.id = rs.shift_id
             JOIN shifts tsh ON tsh.id = ts.shift_id
             WHERE ssr.organization_id = $1
               AND (ssr.requester_id = $2 OR ssr.target_id = $2)
               AND ssr.status IN ('pending_employee','pending_manager')
             ORDER BY ssr.created_at DESC`,
            [session.organizationId, session.id]
        );

        return NextResponse.json({ schedules, pending_swaps: pendingSwaps, start, end, view });
    } catch (err) {
        console.error('Mobile schedule GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
