import { NextRequest, NextResponse } from 'next/server';
import { validateStationToken } from '@/lib/dba';

export async function POST(req: NextRequest) {
    const stationToken = req.cookies.get('station_token')?.value;

    let registeredDevice = false;
    if (stationToken) {
        try {
            const row = await validateStationToken(stationToken);
            registeredDevice = !!row;
        } catch {}
    }

    const response = NextResponse.json({ success: true, registeredDevice });
    response.cookies.delete('session');
    return response;
}
