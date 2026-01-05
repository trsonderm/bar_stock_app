import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
    (await cookies()).delete('session');
    return NextResponse.json({ success: true });
}
