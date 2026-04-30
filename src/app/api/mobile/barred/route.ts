import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/barred?trespassed_only=true
export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const trespassedOnly = searchParams.get('trespassed_only') === 'true';

    const rows = await db.query(
        `SELECT id, name, aliases, photo, description, barred_by_name, trespassed, created_at
         FROM security_barred
         WHERE organization_id = $1 ${trespassedOnly ? 'AND trespassed = TRUE' : ''}
         ORDER BY trespassed DESC, created_at DESC`,
        [session.organizationId]
    );
    return NextResponse.json({ barred: rows, total: rows.length });
}
