import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const orgId = session.organizationId;
    const { searchParams } = req.nextUrl;
    const period = searchParams.get('period') || 'month';
    const userId = searchParams.get('userId');

    const now = new Date();
    let since: Date;
    let until: Date = new Date(now);

    if (period === 'week') {
        since = new Date(now.getTime() - 7 * 86400000);
    } else if (period === 'month') {
        since = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
        since = new Date(now.getFullYear(), 0, 1);
    } else {
        since = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const params: any[] = [orgId, since, until];
    let userFilter = '';
    if (userId) {
        userFilter = ` AND sc.user_id = $4`;
        params.push(parseInt(userId));
    }

    try {
        const [rows, users] = await Promise.all([
            db.query(`
                SELECT
                    sc.id, sc.closed_at, sc.user_id,
                    u.first_name || ' ' || u.last_name AS user_name,
                    l.name AS location_name,
                    sc.cash_sales::float AS cash_sales,
                    sc.cc_sales::float AS cc_sales,
                    sc.cash_tips::float AS cash_tips,
                    sc.cc_tips::float AS cc_tips,
                    sc.payouts_json,
                    sc.bag_amount::float AS bag_amount,
                    sc.over_short::float AS over_short,
                    sc.bank_start::float AS bank_start,
                    sc.bank_end::float AS bank_end
                FROM shift_closes sc
                LEFT JOIN users u ON sc.user_id = u.id
                LEFT JOIN locations l ON sc.location_id = l.id
                WHERE sc.organization_id = $1
                  AND sc.closed_at >= $2
                  AND sc.closed_at <= $3
                  ${userFilter}
                ORDER BY sc.closed_at ASC
            `, params),
            db.query(`
                SELECT DISTINCT sc.user_id AS id, u.first_name || ' ' || u.last_name AS name
                FROM shift_closes sc
                JOIN users u ON sc.user_id = u.id
                WHERE sc.organization_id = $1
                ORDER BY name ASC
            `, [orgId]),
        ]);

        return NextResponse.json({
            rows,
            users,
            period,
            since: since.toISOString(),
            until: until.toISOString(),
        });
    } catch (err: any) {
        console.error('[finances] Error:', err);
        return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
    }
}
