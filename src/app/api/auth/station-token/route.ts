import { NextRequest, NextResponse } from 'next/server';
import { OrgScope } from '@/lib/dba';
import { getSession } from '@/lib/auth';

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
        const { deviceName } = body;

        // Use user's organizationId
        const scope = new OrgScope(session.organizationId);
        const result = await scope.createStationToken(deviceName || 'Unknown Device');

        // Set the cookie on the response
        const response = NextResponse.json({ success: true, expiresAt: result.expiresAt });

        // Set a long-lived cookie for the station_token
        response.cookies.set('station_token', result.token, {
            httpOnly: true,
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
