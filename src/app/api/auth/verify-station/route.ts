import { NextRequest, NextResponse } from 'next/server';
import { validateStationToken } from '@/lib/dba';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const stationToken = cookieStore.get('station_token')?.value;

        if (!stationToken) {
            return NextResponse.json({ valid: false, reason: 'no_token' }, { status: 401 });
        }

        const body = await request.json();
        const { fingerprintHash, orgId } = body;

        const row = await validateStationToken(stationToken, fingerprintHash);

        if (!row) {
            return NextResponse.json({ valid: false, reason: 'invalid_token' }, { status: 401 });
        }

        // If caller provided an orgId, ensure the token belongs to that org
        if (orgId && Number(orgId) !== Number(row.org_id)) {
            return NextResponse.json({ valid: false, reason: 'org_mismatch' }, { status: 403 });
        }

        return NextResponse.json({
            valid: true,
            orgName: row.org_name,
            orgId: row.org_id,
            subdomain: row.subdomain,
        });

    } catch (error) {
        console.error('verify-station error:', error);
        return NextResponse.json({ valid: false, reason: 'error' }, { status: 500 });
    }
}
