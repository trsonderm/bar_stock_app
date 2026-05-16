import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logActivity } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canManage = session.role === 'admin'
        || session.permissions.includes('manage_products')
        || session.permissions.includes('all');
    if (!canManage) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let organizationId = session.organizationId;
    if (session.isSuperAdmin && searchParams.get('orgId')) {
        organizationId = parseInt(searchParams.get('orgId') as string, 10);
    }

    const body = await req.json();
    const { id, archive } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Verify item belongs to this org
    const item = await db.one('SELECT id, name FROM items WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    await db.execute(
        'UPDATE items SET archived_at = $1 WHERE id = $2 AND organization_id = $3',
        [archive ? new Date() : null, id, organizationId],
    );

    await logActivity(
        organizationId,
        session.id,
        archive ? 'ARCHIVE_ITEM' : 'UNARCHIVE_ITEM',
        { itemId: id, name: item.name },
    );

    return NextResponse.json({ success: true, archived: archive });
}
