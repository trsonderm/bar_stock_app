import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

// DELETE — revoke a station token
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const tokenId = Number(params.id);
        if (!tokenId) {
            return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
        }

        const result = await db.one(`
            UPDATE organization_tokens
            SET revoked_at = NOW(), revoked_by = $2
            WHERE id = $1 AND revoked_at IS NULL
            RETURNING id, device_name
        `, [tokenId, session.id]);

        if (!result) {
            return NextResponse.json({ error: 'Token not found or already revoked' }, { status: 404 });
        }

        return NextResponse.json({ success: true, revokedId: result.id, deviceName: result.device_name });

    } catch (error) {
        console.error('DELETE /api/super-admin/devices/[id] error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
