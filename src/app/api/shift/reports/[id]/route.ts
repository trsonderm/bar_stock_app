import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';
import { buildShiftReportHtml } from '@/lib/shift-report-email';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organizationId } = session;
    const id = parseInt(params.id);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const shift = await db.one(`
        SELECT sc.*,
            u.first_name || ' ' || u.last_name AS user_name,
            l.name AS location_name
        FROM shift_closes sc
        LEFT JOIN users u ON sc.user_id = u.id
        LEFT JOIN locations l ON sc.location_id = l.id
        WHERE sc.id = $1 AND sc.organization_id = $2
    `, [id, organizationId]);

    if (!shift) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ shiftClose: shift });
}

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organizationId } = session;
    const id = parseInt(params.id);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const shift = await db.one(`
        SELECT sc.*,
            u.first_name || ' ' || u.last_name AS user_name,
            l.name AS location_name
        FROM shift_closes sc
        LEFT JOIN users u ON sc.user_id = u.id
        LEFT JOIN locations l ON sc.location_id = l.id
        WHERE sc.id = $1 AND sc.organization_id = $2
    `, [id, organizationId]);

    if (!shift) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    let emails: string[] = body.emails || [];

    if (emails.length === 0) {
        // Fall back to org's shift_report_emails setting
        const setting = await db.one(
            "SELECT value FROM settings WHERE organization_id = $1 AND key = 'shift_report_emails'",
            [organizationId]
        );
        if (setting?.value) {
            try {
                const parsed = JSON.parse(setting.value);
                emails = parsed?.to || [];
            } catch {
                emails = setting.value.split(',').map((e: string) => e.trim()).filter(Boolean);
            }
        }
    }

    if (emails.length === 0) {
        return NextResponse.json({ error: 'No recipients configured' }, { status: 400 });
    }

    // Get org name
    const org = await db.one('SELECT name FROM organizations WHERE id = $1', [organizationId]);
    const orgName = org?.name || 'TopShelf';

    // Get subject from settings
    const titleSetting = await db.one(
        "SELECT value FROM settings WHERE organization_id = $1 AND key = 'shift_report_title'",
        [organizationId]
    );
    const subject = titleSetting?.value || 'Shift Close Report';

    const html = buildShiftReportHtml(shift, orgName);
    const dateStr = new Date(shift.closed_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });

    const sent = await sendEmail('reporting', {
        to: emails,
        subject: `${subject} — ${shift.user_name || 'Staff'} — ${dateStr}`,
        html,
        text: `Shift Close Report\nDate: ${dateStr}\nStaff: ${shift.user_name || 'N/A'}\nLocation: ${shift.location_name || 'N/A'}\nBag Amount: ${shift.bag_amount}\nOver/Short: ${shift.over_short}`,
    });

    if (!sent) {
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, sentTo: emails });
}
