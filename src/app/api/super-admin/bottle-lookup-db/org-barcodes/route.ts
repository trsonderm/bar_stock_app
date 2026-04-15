import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET — return all items across all orgs that have at least one barcode saved,
//        joined with org name for display. Used by the "import from orgs" tool.
export async function GET(_req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Items that have a JSONB barcodes array with at least one entry
        const rows = await db.query(
            `SELECT
                i.id           AS item_id,
                i.name         AS item_name,
                i.type,
                i.secondary_type,
                i.supplier,
                o.id           AS org_id,
                o.name         AS org_name,
                elem.value     AS barcode
             FROM items i
             JOIN organizations o ON i.organization_id = o.id
             JOIN LATERAL jsonb_array_elements_text(
                CASE
                  WHEN i.barcodes IS NOT NULL AND jsonb_typeof(i.barcodes) = 'array'
                  THEN i.barcodes
                  ELSE '[]'::jsonb
                END
             ) AS elem ON TRUE
             WHERE elem.value IS NOT NULL AND elem.value != ''
             UNION ALL
             SELECT
                i.id, i.name, i.type, i.secondary_type, i.supplier,
                o.id, o.name,
                i.barcode
             FROM items i
             JOIN organizations o ON i.organization_id = o.id
             WHERE i.barcode IS NOT NULL AND i.barcode != ''
               AND (i.barcodes IS NULL OR jsonb_typeof(i.barcodes) != 'array'
                    OR NOT (i.barcodes @> to_jsonb(i.barcode)))
             ORDER BY org_name, item_name`,
            []
        );

        // Also get which barcodes are already in site_bottle_db so UI can mark them
        const existing = await db.query(`SELECT barcode FROM site_bottle_db`, []);
        const existingSet = new Set(existing.map((r: any) => r.barcode));

        const enriched = rows.map((r: any) => ({
            ...r,
            already_in_site_db: existingSet.has(r.barcode),
        }));

        return NextResponse.json({ items: enriched });
    } catch (e) {
        console.error('[org-barcodes GET]', e);
        return NextResponse.json({ error: 'Failed to load org barcodes' }, { status: 500 });
    }
}
