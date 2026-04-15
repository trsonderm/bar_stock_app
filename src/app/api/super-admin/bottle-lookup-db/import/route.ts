import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

interface ImportItem {
    barcode: string;
    item_name: string;
    type?: string;
    secondary_type?: string;
    org_id: number;
}

// POST — bulk import org barcodes into site_bottle_db
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { items }: { items: ImportItem[] } = await req.json();
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'No items provided' }, { status: 400 });
        }

        let imported = 0;
        let skipped = 0;

        for (const item of items) {
            if (!item.barcode?.trim() || !item.item_name?.trim()) { skipped++; continue; }
            try {
                await db.execute(
                    `INSERT INTO site_bottle_db (barcode, name, type, secondary_type, imported_from_org_id, added_by)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (barcode) DO NOTHING`,
                    [
                        item.barcode.trim(),
                        item.item_name.trim(),
                        item.type || null,
                        item.secondary_type || null,
                        item.org_id || null,
                        session.id,
                    ]
                );
                imported++;
            } catch {
                skipped++;
            }
        }

        return NextResponse.json({ imported, skipped });
    } catch (e) {
        console.error('[bottle-lookup-db import POST]', e);
        return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
}
