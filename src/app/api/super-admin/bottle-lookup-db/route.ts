import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET — list all entries, with optional search
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const search = req.nextUrl.searchParams.get('search')?.trim() ?? '';
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '100'), 500);
    const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0');

    try {
        let rows: any[];
        if (search) {
            rows = await db.query(
                `SELECT id, barcode, brand, name, size, abv, type, secondary_type,
                        image_data IS NOT NULL AND image_data != '' AS has_image,
                        imported_from_org_id, created_at
                 FROM site_bottle_db
                 WHERE lower(name) LIKE $1 OR lower(brand) LIKE $1 OR barcode LIKE $2
                 ORDER BY name ASC LIMIT $3 OFFSET $4`,
                [`%${search.toLowerCase()}%`, `%${search}%`, limit, offset]
            );
        } else {
            rows = await db.query(
                `SELECT id, barcode, brand, name, size, abv, type, secondary_type,
                        image_data IS NOT NULL AND image_data != '' AS has_image,
                        imported_from_org_id, created_at
                 FROM site_bottle_db
                 ORDER BY name ASC LIMIT $1 OFFSET $2`,
                [limit, offset]
            );
        }

        const total = await db.one(
            search
                ? `SELECT COUNT(*)::int AS n FROM site_bottle_db WHERE lower(name) LIKE $1 OR lower(brand) LIKE $1 OR barcode LIKE $2`
                : `SELECT COUNT(*)::int AS n FROM site_bottle_db`,
            search ? [`%${search.toLowerCase()}%`, `%${search}%`] : []
        );

        return NextResponse.json({ entries: rows, total: total?.n ?? 0 });
    } catch (e) {
        console.error('[bottle-lookup-db GET]', e);
        return NextResponse.json({ error: 'Failed to load database' }, { status: 500 });
    }
}

// POST — add a single entry
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { barcode, brand, name, size, abv, type, secondary_type, image_data } = body;

        if (!barcode?.trim()) return NextResponse.json({ error: 'Barcode required' }, { status: 400 });
        if (!name?.trim()) return NextResponse.json({ error: 'Product name required' }, { status: 400 });

        // Normalize UPC-A/EAN-13: strip leading 0 from 13-digit codes
        const normalizedBarcode = barcode.trim().length === 13 && barcode.trim().startsWith('0')
            ? barcode.trim().slice(1)
            : barcode.trim();

        const row = await db.one(
            `INSERT INTO site_bottle_db (barcode, brand, name, size, abv, type, secondary_type, image_data, added_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (barcode) DO UPDATE SET
               brand = EXCLUDED.brand,
               name = EXCLUDED.name,
               size = EXCLUDED.size,
               abv = EXCLUDED.abv,
               type = EXCLUDED.type,
               secondary_type = EXCLUDED.secondary_type,
               image_data = COALESCE(NULLIF(EXCLUDED.image_data, ''), site_bottle_db.image_data),
               updated_at = NOW()
             RETURNING id, barcode, brand, name, size, abv, type, secondary_type, created_at`,
            [
                normalizedBarcode,
                brand?.trim() || null,
                name.trim(),
                size?.trim() || null,
                abv ? parseFloat(abv) : null,
                type?.trim() || null,
                secondary_type?.trim() || null,
                image_data || null,
                session.id,
            ]
        );

        return NextResponse.json({ entry: row });
    } catch (e) {
        console.error('[bottle-lookup-db POST]', e);
        return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 });
    }
}

// DELETE — remove an entry by id (passed as ?id=)
export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        await db.execute(`DELETE FROM site_bottle_db WHERE id = $1`, [parseInt(id)]);
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('[bottle-lookup-db DELETE]', e);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
