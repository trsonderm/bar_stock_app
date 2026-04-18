import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';
import { buildShiftReportHtml } from '@/lib/shift-report-email';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const orgId = session.organizationId;

    const [users, locations, payoutTypes] = await Promise.all([
        db.query(
            `SELECT id, first_name || ' ' || last_name AS name FROM users WHERE organization_id = $1 ORDER BY first_name ASC`,
            [orgId]
        ),
        db.query(
            `SELECT id, name FROM locations WHERE organization_id = $1 ORDER BY name ASC`,
            [orgId]
        ),
        db.query(
            `SELECT id, name FROM payout_types WHERE organization_id = $1 ORDER BY sort_order ASC, name ASC`,
            [orgId]
        ),
    ]);

    return NextResponse.json({ users, locations, payoutTypes });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const { id: adminId, organizationId } = session;

    let body: any;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const {
        userId,
        closedAt,
        locationId,
        bankStart,
        bankEnd,
        cashSales,
        cashTips,
        ccSales,
        ccTips,
        payouts = [],
        ccTipsCashPayout = false,
        notes,
    } = body;

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const targetUser = await db.one(
        `SELECT id, first_name || ' ' || last_name AS name FROM users WHERE id = $1 AND organization_id = $2`,
        [parseInt(userId), organizationId]
    );
    if (!targetUser) return NextResponse.json({ error: 'User not found in this organization' }, { status: 404 });

    const n = (v: any) => parseFloat(v) || 0;
    const totalPayouts = payouts.reduce((sum: number, p: any) => sum + n(p.amount), 0);
    const ccTipsCashAmount = ccTipsCashPayout ? n(ccTips) : 0;
    const bagAmount = n(bankEnd) - totalPayouts - ccTipsCashAmount;
    const overShort = n(bankEnd) - (n(bankStart) + n(cashSales) + n(cashTips) - totalPayouts - ccTipsCashAmount);

    const shiftTime = closedAt ? new Date(closedAt) : new Date();

    const result = await db.one(
        `INSERT INTO shift_closes (
            organization_id, location_id, user_id, closed_at,
            bank_start, bank_end, cash_sales, cash_tips,
            cc_sales, cc_tips, payouts_json,
            cc_tips_cash_payout, bag_amount, over_short, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id, closed_at`,
        [
            organizationId,
            locationId ? parseInt(locationId) : null,
            parseInt(userId),
            shiftTime.toISOString(),
            n(bankStart), n(bankEnd), n(cashSales), n(cashTips),
            n(ccSales), n(ccTips),
            JSON.stringify(payouts),
            ccTipsCashPayout ? true : false,
            bagAmount, overShort,
            notes || null,
        ]
    );

    await db.execute(
        `INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
        [organizationId, adminId, 'ADMIN_CREATE_SHIFT_CLOSE',
            JSON.stringify({ shiftCloseId: (result as any)?.id, targetUserId: userId, closedAt: shiftTime.toISOString() })]
    );

    // Send per-shift email if configured
    try {
        const shiftSettings = await db.query(
            `SELECT key, value FROM settings WHERE organization_id = $1 AND key IN ('shift_report_enabled','shift_report_emails','shift_report_schedule','shift_report_title')`,
            [organizationId]
        );
        const sm: Record<string, string> = {};
        shiftSettings.forEach((r: any) => { sm[r.key] = r.value; });

        if (sm.shift_report_enabled === 'true') {
            let schedule: any = { frequency: 'per_shift' };
            try { if (sm.shift_report_schedule) schedule = JSON.parse(sm.shift_report_schedule); } catch { }
            if (schedule.frequency === 'per_shift') {
                let recipients: string[] = [];
                try {
                    const parsed = sm.shift_report_emails ? JSON.parse(sm.shift_report_emails) : null;
                    if (parsed?.to) recipients = parsed.to;
                    else if (sm.shift_report_emails) recipients = sm.shift_report_emails.split(',').map((e: string) => e.trim()).filter(Boolean);
                } catch { }
                if (recipients.length > 0 && result) {
                    const org = await db.one('SELECT name FROM organizations WHERE id = $1', [organizationId]);
                    const orgName = org?.name || 'TopShelf';
                    const fullShift = await db.one(
                        `SELECT sc.*, u.first_name || ' ' || u.last_name AS user_name, l.name AS location_name
                         FROM shift_closes sc
                         LEFT JOIN users u ON sc.user_id = u.id
                         LEFT JOIN locations l ON sc.location_id = l.id
                         WHERE sc.id = $1`,
                        [(result as any).id]
                    );
                    if (fullShift) {
                        const subject = sm.shift_report_title || 'Shift Close Report';
                        const dateStr = new Date((result as any).closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const html = buildShiftReportHtml(fullShift, orgName);
                        await sendEmail('reporting', {
                            to: recipients,
                            subject: `${subject} — ${fullShift.user_name || 'Staff'} — ${dateStr}`,
                            html,
                            text: `Shift Close Report\nDate: ${dateStr}\nStaff: ${fullShift.user_name}\nBag: ${bagAmount}\nOver/Short: ${overShort}`,
                        }, { emailType: 'shift_report', organizationId, orgName });
                    }
                }
            }
        }
    } catch (e) {
        console.error('[Admin Shift Close] email error:', e);
    }

    return NextResponse.json({ success: true, shiftClose: result, bagAmount, overShort }, { status: 201 });
}
