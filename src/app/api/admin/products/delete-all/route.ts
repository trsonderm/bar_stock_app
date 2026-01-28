import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Strict Admin Check
        if (session.role !== 'admin') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        await db.execute('BEGIN');

        try {
            await db.execute('DELETE FROM inventory');
            await db.execute('DELETE FROM items');

            // Log the action
            await db.execute(
                'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
                [session.id, 'DELETE_ALL_PRODUCTS', JSON.stringify({ timestamp: new Date().toISOString() })]
            );

            await db.execute('COMMIT');
            return NextResponse.json({ success: true });

        } catch (err) {
            await db.execute('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('Delete All Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
