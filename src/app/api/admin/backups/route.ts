import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { scheduler } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = session.organizationId;
    if (!orgId) {
        return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    const snapshots = scheduler.getOrgSnapshots().filter((s: any) => s.orgId === orgId);

    return NextResponse.json({
        snapshots: snapshots.map((s: any) => ({
            file: s.name,
            created: s.created,
            orgName: s.orgName,
        })),
    });
}
