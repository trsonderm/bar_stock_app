import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const since = searchParams.get('since');
        const until = searchParams.get('until');
        const posType = searchParams.get('pos_type');
        const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000);
        const page = Math.max(0, parseInt(searchParams.get('page') || '0'));

        const conditions = ['t.organization_id = $1'];
        const params: any[] = [session.organizationId];
        let pIdx = 2;

        if (since) { conditions.push(`t.transaction_at >= $${pIdx++}`); params.push(since); }
        if (until) { conditions.push(`t.transaction_at <= $${pIdx++}`); params.push(until); }
        if (posType) { conditions.push(`t.pos_type = $${pIdx++}`); params.push(posType); }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const [transactions, countRow] = await Promise.all([
            db.query(
                `SELECT t.id, t.pos_type, t.external_id, t.transaction_at,
                        t.total_amount, t.tax_amount, t.tip_amount, t.payment_type, t.status,
                        COUNT(i.id)::int as item_count
                 FROM pos_transactions t
                 LEFT JOIN pos_transaction_items i ON i.transaction_id = t.id
                 ${where}
                 GROUP BY t.id
                 ORDER BY t.transaction_at DESC
                 LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
                [...params, limit, page * limit]
            ),
            db.one(
                `SELECT COUNT(*) as total FROM pos_transactions t ${where}`,
                params
            ),
        ]);

        return NextResponse.json({ transactions, total: parseInt(countRow.total), page, limit });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
