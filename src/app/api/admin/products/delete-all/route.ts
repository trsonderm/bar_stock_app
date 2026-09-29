/**
 * DELETE /api/admin/products/delete-all
 *
 * Admin-only. Permanently removes every item (and its stock rows) belonging
 * to the caller's organization, and records the action in the activity log.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (session.role !== 'admin') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        await db.transaction(async (tx) => {
            await tx.execute('DELETE FROM inventory WHERE organization_id = $1', [session.organizationId]);
            await tx.execute('DELETE FROM items WHERE organization_id = $1', [session.organizationId]);

            await tx.execute(
                'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
                [session.organizationId, session.id, 'DELETE_ALL_PRODUCTS', JSON.stringify({ timestamp: new Date().toISOString() })]
            );
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete All Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
