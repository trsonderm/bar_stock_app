import { NextRequest, NextResponse } from 'next/server';
import { OrgScope } from '@/lib/dba';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (session.role !== 'admin' && !session.permissions.includes('all')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { deviceName, fingerprintHash } = body;

        // Capture IP and User-Agent for device binding
        const registeredIp =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            'unknown';
        const userAgent = request.headers.get('user-agent') || 'unknown';

        const scope = new OrgScope(session.organizationId);
        const result = await scope.createStationToken(
            deviceName || 'Unknown Device',
            90,
            fingerprintHash || undefined,
            registeredIp,
            userAgent
        );

        // Fetch the org's subdomain so the client can redirect to the PIN login
        const org = await db.one('SELECT subdomain FROM organizations WHERE id = $1', [session.organizationId]);

        const response = NextResponse.json({
            success: true,
            expiresAt: result.expiresAt,
            subdomain: org?.subdomain || null,
            orgId: session.organizationId,
        });

        // Long-lived station_token cookie — httpOnly so it persists through page reloads
        response.cookies.set('station_token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: new Date(result.expiresAt),
            path: '/'
        });

        // Also store orgId in a readable cookie so the PIN page knows which org this is
        response.cookies.set('station_org_id', String(session.organizationId), {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: new Date(result.expiresAt),
            path: '/'
        });

        return response;

    } catch (error) {
        console.error('Error creating station token:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
