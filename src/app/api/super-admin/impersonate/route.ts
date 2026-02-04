import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, createSessionToken, COOKIE_OPTIONS, UserRole } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');

    if (!session || !isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await req.json();
    if (!orgId) return NextResponse.json({ error: 'Org ID required' }, { status: 400 });

    const org = await db.one('SELECT * FROM organizations WHERE id = $1', [orgId]);
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

    // Switch context
    const newToken = await createSessionToken({
        id: session.id,
        firstName: session.firstName,
        lastName: session.lastName,
        email: session.email,
        role: 'admin', // Assume admin power in that org
        permissions: ['all', 'super_admin'], // Keep super_admin permission
        organizationId: orgId,
        isSuperAdmin: true,
        isImpersonating: true
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set('session', newToken, COOKIE_OPTIONS);

    return response;
}
