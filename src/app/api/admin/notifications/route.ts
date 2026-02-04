import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        const notifications = await db.query(`
            SELECT id, type, title, message, is_read, created_at, data 
            FROM notifications 
            WHERE organization_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
        `, [session.organizationId, limit, offset]);

        return NextResponse.json({ notifications });

    } catch (error) {
        console.error('Notification Fetch Error', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
