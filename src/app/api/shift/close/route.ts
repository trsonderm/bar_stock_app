import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { organizationId } = session;

    const searchParams = req.nextUrl.searchParams;
    const locationId = searchParams.get('locationId') ? parseInt(searchParams.get('locationId')!) : null;

    let query: string;
    let params: any[];

    if (locationId) {
        query = `
            SELECT sc.*, u.first_name || ' ' || u.last_name AS user_name
            FROM shift_closes sc
            LEFT JOIN users u ON sc.user_id = u.id
            WHERE sc.organization_id = $1 AND sc.location_id = $2
            ORDER BY sc.closed_at DESC
            LIMIT 20
        `;
        params = [organizationId, locationId];
    } else {
        query = `
            SELECT sc.*, u.first_name || ' ' || u.last_name AS user_name
            FROM shift_closes sc
            LEFT JOIN users u ON sc.user_id = u.id
            WHERE sc.organization_id = $1
            ORDER BY sc.closed_at DESC
            LIMIT 20
        `;
        params = [organizationId];
    }

    const rows = await db.query(query, params);
    return NextResponse.json({ shiftCloses: rows });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id: userId, organizationId } = session;

    const body = await req.json();
    const {
        locationId,
        bankStart,
        bankEnd,
        cashSales,
        cashTips,
        ccSales,
        ccTips,
        payouts = [],
        ccTipsCashPayout,
        notes,
        receiptRegisterData,
        receiptCcData,
    } = body;

    const n = (v: any) => parseFloat(v) || 0;

    const totalPayouts = payouts.reduce((sum: number, p: any) => sum + n(p.amount), 0);
    const ccTipsCashAmount = ccTipsCashPayout ? n(ccTips) : 0;
    const bagAmount = n(bankEnd) - n(bankStart) - totalPayouts - ccTipsCashAmount;
    const overShort =
        n(bankEnd) - (n(bankStart) + n(cashSales) + n(cashTips) - totalPayouts - ccTipsCashAmount);

    const result = await db.one(
        `INSERT INTO shift_closes (
            organization_id, location_id, user_id,
            bank_start, bank_end, cash_sales, cash_tips,
            cc_sales, cc_tips, payouts_json,
            cc_tips_cash_payout, bag_amount, over_short,
            notes, receipt_register_data, receipt_cc_data
        ) VALUES (
            $1, $2, $3,
            $4, $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16
        ) RETURNING id, closed_at`,
        [
            organizationId,
            locationId || null,
            userId,
            n(bankStart),
            n(bankEnd),
            n(cashSales),
            n(cashTips),
            n(ccSales),
            n(ccTips),
            JSON.stringify(payouts),
            ccTipsCashPayout ? true : false,
            bagAmount,
            overShort,
            notes || null,
            receiptRegisterData ? JSON.stringify(receiptRegisterData) : null,
            receiptCcData ? JSON.stringify(receiptCcData) : null,
        ]
    );

    await db.execute(
        'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
        [
            organizationId,
            userId,
            'CLOSE_SHIFT',
            JSON.stringify({
                shiftCloseId: (result as any)?.id,
                bankStart: n(bankStart),
                bankEnd: n(bankEnd),
                cashSales: n(cashSales),
                cashTips: n(cashTips),
                ccSales: n(ccSales),
                ccTips: n(ccTips),
                totalPayouts,
                bagAmount,
                overShort,
                ccTipsCashPayout: ccTipsCashPayout ? true : false,
                locationId: locationId || null,
            }),
        ]
    );

    return NextResponse.json({
        success: true,
        shiftClose: result,
        bagAmount,
        overShort,
    }, { status: 201 });
}
