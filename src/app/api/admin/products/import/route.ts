import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (session.role !== 'admin') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

        // Expected Header: Name,Type,Secondary Type,Cost,Quantity
        const startIdx = lines[0].toLowerCase().startsWith('name') ? 1 : 0;

        let successCount = 0;
        let skipCount = 0;

        await db.execute('BEGIN');

        try {
            for (let i = startIdx; i < lines.length; i++) {
                const row = lines[i];
                const cols = row.split(',').map((c: string) => c.trim());
                if (cols.length < 2) continue;

                const name = cols[0];
                const type = cols[1];
                const secType = cols[2] || null;
                const cost = parseFloat(cols[3]) || 0;
                const qty = parseInt(cols[4]) || 0;

                if (!name || !type) continue;

                // Check existing
                const existing = await db.one('SELECT id FROM items WHERE name = $1', [name]);
                if (existing) {
                    skipCount++;
                    continue;
                }

                // Insert Item
                const res = await db.one(
                    'INSERT INTO items (name, type, secondary_type, unit_cost) VALUES ($1, $2, $3, $4) RETURNING id',
                    [name, type, secType, cost]
                );

                // Insert Stock (Location 1 default)
                await db.execute(
                    'INSERT INTO inventory (item_id, location_id, quantity) VALUES ($1, 1, $2)',
                    [res.id, qty]
                );

                successCount++;
            }

            // Log action
            await db.execute(
                'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
                [session.id, 'IMPORT_CSV', JSON.stringify({ success: successCount, skipped: skipCount })]
            );

            await db.execute('COMMIT');
            return NextResponse.json({ success: true, count: successCount, skipped: skipCount });

        } catch (err) {
            await db.execute('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('Import Error:', error);
        return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
}
