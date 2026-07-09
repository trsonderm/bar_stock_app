/**
 * GET  /api/mobile/products  — list all products with full detail (admin only)
 * POST /api/mobile/products  — create a new product (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

function requireAdmin(session: any) {
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return null;
}

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    const err = requireAdmin(session);
    if (err) return err;

    const { searchParams } = req.nextUrl;
    const q = searchParams.get('q') || '';
    const type = searchParams.get('type') || '';
    const locationId = searchParams.get('location_id') ? parseInt(searchParams.get('location_id')!) : null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    try {
        const params: any[] = [session.organizationId];
        let where = 'WHERE i.organization_id = $1 AND i.archived_at IS NULL';
        let idx = 2;

        if (q) { where += ` AND (i.name ILIKE $${idx} OR i.type ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
        if (type) { where += ` AND i.type = $${idx}`; params.push(type); idx++; }

        const locJoin = locationId
            ? `LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.location_id = $${idx}`
            : `LEFT JOIN inventory inv ON inv.item_id = i.id`;

        if (locationId) { params.push(locationId); idx++; }

        const rows = await db.query(
            `SELECT
                i.id, i.name, i.type, i.secondary_type,
                i.unit_cost, i.sale_price, i.package_price,
                COALESCE(i.package_sale_enabled, false) AS package_sale_enabled,
                i.supplier, i.order_size,
                COALESCE(i.barcodes, '[]'::jsonb) AS barcodes,
                COALESCE(i.aliases, '[]'::jsonb) AS aliases,
                i.low_stock_threshold,
                COALESCE(i.low_stock_threshold_type, 'fixed') AS low_stock_threshold_type,
                i.low_stock_threshold_factor,
                COALESCE(i.include_in_low_stock_alerts, true) AS include_in_low_stock_alerts,
                COALESCE(i.exclude_from_smart_order, false) AS exclude_from_smart_order,
                COALESCE(i.include_in_audit, true) AS include_in_audit,
                i.bottle_size_amount, i.bottle_size_unit,
                COALESCE(i.is_alcohol, true) AS is_alcohol,
                COALESCE(i.stock_display_mode, 'units') AS stock_display_mode,
                COALESCE(i.inventory_display_mode, 'units') AS inventory_display_mode,
                COALESCE(i.stock_unit_label, 'unit') AS stock_unit_label,
                COALESCE(i.stock_unit_size, 1) AS stock_unit_size,
                COALESCE(i.order_unit_label, 'case') AS order_unit_label,
                COALESCE(i.order_unit_size, 1) AS order_unit_size,
                COALESCE(i.use_category_qty_defaults, true) AS use_category_qty_defaults,
                i.stock_options,
                COALESCE(SUM(inv.quantity), 0) AS quantity,
                (SELECT igl.global_product_id FROM item_global_links igl WHERE igl.item_id = i.id LIMIT 1) AS global_product_id
             FROM items i
             ${locJoin}
             ${where}
             GROUP BY i.id
             ORDER BY i.name ASC
             LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        const total = await db.one(
            `SELECT COUNT(*) AS count FROM items i ${where}`,
            params.slice(0, idx - 1 - (locationId ? 1 : 0))
        );

        return NextResponse.json({
            items: rows,
            total: parseInt(total?.count || '0'),
            limit,
            offset,
        });
    } catch (err) {
        console.error('[Mobile products GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    const err = requireAdmin(session);
    if (err) return err;

    try {
        const body = await req.json();
        const {
            name, type, secondary_type, supplier, supplier_id,
            unit_cost, order_size, low_stock_threshold, low_stock_threshold_type,
            low_stock_threshold_factor, stock_options, include_in_audit,
            include_in_low_stock_alerts, exclude_from_smart_order,
            barcodes, aliases, bottle_size_amount, bottle_size_unit,
            package_sale_enabled, is_alcohol,
            stock_display_mode, inventory_display_mode,
            stock_unit_label, stock_unit_size, order_unit_label, order_unit_size,
            use_category_qty_defaults, assigned_locations,
        } = body;

        if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
        if (!type?.trim()) return NextResponse.json({ error: 'type (category) is required' }, { status: 400 });

        const res = await db.one(
            `INSERT INTO items (name, type, secondary_type, supplier, organization_id,
                low_stock_threshold, low_stock_threshold_type, low_stock_threshold_factor,
                order_size, stock_options, include_in_audit, unit_cost,
                barcodes, aliases, package_sale_enabled, is_alcohol,
                stock_display_mode, inventory_display_mode,
                stock_unit_label, stock_unit_size, order_unit_label, order_unit_size,
                use_category_qty_defaults, bottle_size_amount, bottle_size_unit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
             RETURNING id`,
            [
                name.trim(), type, secondary_type || null, supplier || null,
                session.organizationId,
                low_stock_threshold != null ? Number(low_stock_threshold) : 5,
                low_stock_threshold_type || 'fixed',
                low_stock_threshold_factor != null ? Number(low_stock_threshold_factor) : null,
                JSON.stringify(Array.isArray(order_size) ? order_size : [{ label: 'Unit', amount: 1 }]),
                stock_options ? JSON.stringify(stock_options) : null,
                include_in_audit !== false,
                unit_cost ? Number(unit_cost) : 0,
                JSON.stringify(Array.isArray(barcodes) ? barcodes : []),
                JSON.stringify(Array.isArray(aliases) ? aliases : []),
                package_sale_enabled === true,
                is_alcohol !== false,
                stock_display_mode || 'units',
                inventory_display_mode || 'units',
                stock_unit_label || 'unit',
                stock_unit_size ? Number(stock_unit_size) : 1,
                order_unit_label || 'case',
                order_unit_size ? Number(order_unit_size) : 1,
                use_category_qty_defaults !== false,
                bottle_size_amount != null ? Number(bottle_size_amount) : null,
                bottle_size_unit || null,
            ]
        );

        const itemId = res.id;

        // Set supplier link
        if (supplier_id) {
            await db.execute(
                `INSERT INTO item_suppliers (item_id, supplier_id, is_preferred)
                 VALUES ($1, $2, true) ON CONFLICT (item_id, supplier_id) DO UPDATE SET is_preferred = true`,
                [itemId, supplier_id]
            ).catch(() => {});
        }

        // Set include_in_low_stock_alerts separately (may not exist in older schemas)
        await db.execute(
            `UPDATE items SET include_in_low_stock_alerts = $1 WHERE id = $2`,
            [include_in_low_stock_alerts !== false, itemId]
        ).catch(() => {});

        // Assign to locations
        const locs: number[] = Array.isArray(assigned_locations) ? assigned_locations : [];
        if (locs.length === 0) {
            // Default to all org locations
            const orgLocs = await db.query('SELECT id FROM locations WHERE organization_id = $1', [session.organizationId]);
            orgLocs.forEach(l => locs.push(l.id));
        }
        for (const locId of locs) {
            await db.execute(
                `INSERT INTO inventory (item_id, location_id, organization_id, quantity)
                 VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING`,
                [itemId, locId, session.organizationId]
            ).catch(() => {});
        }

        return NextResponse.json({ ok: true, id: itemId });
    } catch (err: any) {
        console.error('[Mobile products POST]', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
