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

        const mappingJson = formData.get('mapping') as string;
        let mapping: Record<string, number> | null = null;
        if (mappingJson) {
            try {
                mapping = JSON.parse(mappingJson);
            } catch (e) { }
        }

        // Expected Header: Name,Type,Secondary Type,Cost,Quantity (Legacy fallback)
        const startIdx = 1; // Always skip header if mapping provided, or assume header exists

        let successCount = 0;
        let skipCount = 0;

        await db.execute('BEGIN');

        try {
            for (let i = startIdx; i < lines.length; i++) {
                const row = lines[i];
                // Simple parser matching frontend
                const cols: string[] = [];
                let current = '';
                let inQuote = false;
                for (let c = 0; c < row.length; c++) {
                    const char = row[c];
                    if (char === '"') inQuote = !inQuote;
                    else if (char === ',' && !inQuote) {
                        cols.push(current.trim().replace(/^"|"$/g, ''));
                        current = '';
                    } else current += char;
                }
                cols.push(current.trim().replace(/^"|"$/g, ''));

                if (cols.length < 2) continue;

                let name, type, secType, cost, qty, orderSize, threshold;

                if (mapping) {
                    name = mapping['name'] !== undefined ? cols[mapping['name']] : null;
                    type = mapping['type'] !== undefined ? cols[mapping['type']] : null;
                    secType = mapping['secondary_type'] !== undefined ? cols[mapping['secondary_type']] : null;
                    const costVal = mapping['unit_cost'] !== undefined ? cols[mapping['unit_cost']] : '0';
                    const qtyVal = mapping['quantity'] !== undefined ? cols[mapping['quantity']] : '0';
                    const orderSizeVal = mapping['order_size'] !== undefined ? cols[mapping['order_size']] : '1';
                    const thresholdVal = mapping['low_stock_threshold'] !== undefined ? cols[mapping['low_stock_threshold']] : '5';

                    cost = parseFloat(costVal?.replace(/[^0-9.]/g, '') || '0');
                    qty = parseInt(qtyVal?.replace(/[^0-9]/g, '') || '0');
                    orderSize = parseInt(orderSizeVal?.replace(/[^0-9]/g, '') || '1');
                    threshold = parseInt(thresholdVal?.replace(/[^0-9]/g, '') || '5');
                } else {
                    // Legacy Fallback
                    name = cols[0];
                    type = cols[1];
                    secType = cols[2] || null;
                    cost = parseFloat(cols[3]) || 0;
                    qty = parseInt(cols[4]) || 0;
                    orderSize = 1;
                    threshold = 5;
                }

                if (!name || !type) continue;

                // Check existing
                const existing = await db.one('SELECT id FROM items WHERE name = $1', [name]);
                if (existing) {
                    skipCount++;
                    continue;
                }

                // Insert Item
                const res = await db.one(
                    'INSERT INTO items (name, type, secondary_type, unit_cost, order_size, low_stock_threshold) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                    [name, type, secType, cost, orderSize, threshold]
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
