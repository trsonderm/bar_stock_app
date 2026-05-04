import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { to } = await req.json();
        if (!to) return NextResponse.json({ error: 'Phone number required' }, { status: 400 });

        const rows = await db.query('SELECT key, value FROM system_settings WHERE key IN ($1,$2,$3)', [
            'twilio_sid', 'twilio_token', 'twilio_from',
        ]);
        const cfg: Record<string, string> = {};
        rows.forEach((r: any) => { cfg[r.key] = r.value; });

        if (!cfg.twilio_sid || !cfg.twilio_token || !cfg.twilio_from) {
            return NextResponse.json({ error: 'Twilio not configured — save credentials first' }, { status: 400 });
        }

        const body = new URLSearchParams({
            To: to,
            From: cfg.twilio_from,
            Body: 'TopShelf test SMS — your Twilio integration is working correctly.',
        });

        const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilio_sid}/Messages.json`,
            {
                method: 'POST',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(`${cfg.twilio_sid}:${cfg.twilio_token}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body.toString(),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            return NextResponse.json({ error: data.message || 'Twilio error' }, { status: 400 });
        }

        return NextResponse.json({ ok: true, sid: data.sid });
    } catch (err) {
        console.error('Test SMS error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
