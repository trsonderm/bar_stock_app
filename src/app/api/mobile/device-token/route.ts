import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// POST /api/mobile/device-token
// Body: { token: string, platform: 'ios' | 'android' }
// Call this after login and whenever the FCM/APNs token refreshes
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { token, platform } = await req.json();
        if (!token || !['ios', 'android'].includes(platform)) {
            return NextResponse.json({ error: 'token and platform (ios|android) required' }, { status: 400 });
        }

        await db.execute(
            `INSERT INTO device_tokens (user_id, organization_id, token, platform, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (user_id, token) DO UPDATE SET platform = $4, updated_at = NOW()`,
            [session.id, session.organizationId, token, platform]
        );

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Device token error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/mobile/device-token — unregister on logout
export async function DELETE(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { token } = await req.json();
        if (token) {
            await db.execute('DELETE FROM device_tokens WHERE user_id = $1 AND token = $2', [session.id, token]);
        } else {
            // Remove all tokens for this user (full logout)
            await db.execute('DELETE FROM device_tokens WHERE user_id = $1', [session.id]);
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
