import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const to = body.report_emails?.to?.[0] || (typeof body.report_emails === 'string' ? body.report_emails.split(',')[0].trim() : null);

        if (!to) {
            return NextResponse.json({ error: 'No recipient email configured. Add report recipients first.' }, { status: 400 });
        }

        const sent = await sendEmail('reporting', {
            to,
            subject: `Test Email from TopShelf — ${new Date().toLocaleTimeString()}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #10b981;">SMTP Connection Successful</h2>
                    <p>Your reporting email settings are configured correctly.</p>
                    <p style="color: #666; font-size: 0.9em;">
                        This test was sent via the <strong>Reporting</strong> mail account configured in Super Admin &rarr; Mail Accounts.
                    </p>
                </div>
            `,
        });

        if (sent) {
            return NextResponse.json({ success: true, message: `Test email sent to ${to}` });
        } else {
            return NextResponse.json({ error: 'SMTP not configured for the reporting tier. Check Super Admin → Mail Accounts.' }, { status: 500 });
        }
    } catch (e: any) {
        console.error('Test Email Failed:', e);
        return NextResponse.json({ error: e.message || 'Failed to send email' }, { status: 500 });
    }
}
