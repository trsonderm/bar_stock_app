import { NextResponse } from 'next/server';
import { validateStationToken } from '@/lib/dba';
import { cookies } from 'next/headers';

// GET — lightweight check: does this browser have a valid station_token cookie?
// Used by the login page to default to PIN mode on registered tablets.
export async function GET() {
    try {
        const cookieStore = await cookies();
        const stationToken = cookieStore.get('station_token')?.value;

        if (!stationToken) {
            return NextResponse.json({ isRegisteredDevice: false });
        }

        const row = await validateStationToken(stationToken);
        return NextResponse.json({ isRegisteredDevice: !!row });
    } catch {
        return NextResponse.json({ isRegisteredDevice: false });
    }
}
