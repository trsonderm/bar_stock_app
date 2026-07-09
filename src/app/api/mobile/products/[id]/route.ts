/**
 * GET    /api/mobile/products/<id>  — full product detail (admin)
 * PUT    /api/mobile/products/<id>  — update any product field (admin)
 * DELETE /api/mobile/products/<id>  — delete product (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

function requireAdmin(session: any) {
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await verifyMobileToken(req);
    const err = requireAdmin(session);
    if (err) return err;

    const id = parseInt(params.id);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    try {
        const item = await db.one(
            `SELECT
                i.id, i.name, i.type, i.secondary_type,
                i.unit_cost, i.sale_price, i.package_price,
                COALESCE(i.package_sale_enabled, false) AS package_sale_enabled,
                i.supplier,
                (SELECT s.id FROM item_suppliers isp JOIN suppliers s ON s.id = isp.supplier_id
                 WHERE isp.item_id = i.id AND isp.is_preferred = true
                 ORDER BY isp.id ASC LIMIT 1) AS supplier_id,
                i.order_size,
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
                COALESCE(
                    (SELECT json_agg(location_id) FROM inventory WHERE item_id = i.id),
                    '[]'::json
                ) AS assigned_locations,
                (SELECT json_agg(row_to_json(loc_data)) FROM (
                    SELECT inv.location_id, l.name AS location_name, COALESCE(inv.quantity, 0) AS quantity
                    FROM inventory inv JOIN locations l ON l.id = inv.location_id
                    WHERE inv.item_id = i.id AND inv.organization_id = $2
                ) loc_data) AS location_quantities,
                (SELECT igl.global_product_id FROM item_global_links igl WHERE igl.item_id = i.id LIMIT 1) AS global_product_id
             FROM items i
             WHERE i.id = $1 AND i.organization_id = $2 AND i.archived_at IS NULL`,
            [id, session.organizationId]
        );

        if (!item) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

        return NextResponse.json({ item });
    } catch (err) {
        console.error('[Mobile products GET/:id]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await verifyMobileToken(req);
    const err = requireAdmin(session);
    if (err) return err;

    const id = parseInt(params.id);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    try {
        const body = await req.json();
        const {
            name, type, secondary_type, supplier, supplier_id,
            unit_cost, sale_price, package_price, package_sale_enabled,
            order_size, low_stock_threshold, low_stock_threshold_type,
            low_stock_threshold_factor, stock_options, include_in_audit,
            include_in_low_stock_alerts, exclude_from_smart_order,
            barcodes, aliases, bottle_size_amount, bottle_size_unit,
            is_alcohol, stock_display_mode, inventory_display_mode,
            stock_unit_label, stock_unit_size, order_unit_label, order_unit_size,
            use_category_qty_defaults, assigned_locations,
        } = body;

        const updates: string[] = [];
        const vals: any[] = [];
        let idx = 1;

        const set = (col: string, val: any) => { updates.push(`${col} = $${idx++}`); vals.push(val); };

        if (name !== undefined) set('name', name.trim());
        if (type !== undefined) set('type', type);
        if (secondary_type !== undefined) set('secondary_type', secondary_type || null);
        if (supplier !== undefined) set('supplier', supplier || null);
        if (unit_cost !== undefined) set('unit_cost', Number(unit_cost));
        if (sale_price !== undefined) set('sale_price', sale_price !== null ? Number(sale_price) : null);
        if (package_price !== undefined) set('package_price', package_price !== null && package_price !== '' ? Number(package_price) : null);
        if (package_sale_enabled !== undefined) set('package_sale_enabled', package_sale_enabled === true);
        if (order_size !== undefined) set('order_size', JSON.stringify(Array.isArray(order_size) ? order_size : [order_size]));
        if (low_stock_threshold !== undefined) set('low_stock_threshold', low_stock_threshold);
        if (low_stock_threshold_type !== undefined) set('low_stock_threshold_type', low_stock_threshold_type || 'fixed');
        if (low_stock_threshold_factor !== undefined) set('low_stock_threshold_factor', low_stock_threshold_factor != null ? Number(low_stock_threshold_factor) : null);
        if (exclude_from_smart_order !== undefined) set('exclude_from_smart_order', exclude_from_smart_order === true);
        if (include_in_audit !== undefined) set('include_in_audit', include_in_audit !== false);
        if (stock_options !== undefined) set('stock_options', stock_options ? JSON.stringify(stock_options) : null);
        if (barcodes !== undefined) set('barcodes', JSON.stringify(Array.isArray(barcodes) ? barcodes : []));
        if (aliases !== undefined) set('aliases', JSON.stringify(Array.isArray(aliases) ? aliases : []));
        if (bottle_size_amount !== undefined) set('bottle_size_amount', bottle_size_amount !== null && bottle_size_amount !== '' ? Number(bottle_size_amount) : null);
        if (bottle_size_unit !== undefined) set('bottle_size_unit', bottle_size_unit || null);
        if (is_alcohol !== undefined) set('is_alcohol', is_alcohol !== false);
        if (stock_display_mode !== undefined) set('stock_display_mode', stock_display_mode);
        if (inventory_display_mode !== undefined) set('inventory_display_mode', inventory_display_mode);
        if (stock_unit_label !== undefined) set('stock_unit_label', stock_unit_label);
        if (stock_unit_size !== undefined) set('stock_unit_size', Number(stock_unit_size));
        if (order_unit_label !== undefined) set('order_unit_label', order_unit_label);
        if (order_unit_size !== undefined) set('order_unit_size', Number(order_unit_size));
        if (use_category_qty_defaults !== undefined) set('use_category_qty_defaults', use_category_qty_defaults !== false);

        if (updates.length > 0) {
            vals.push(id, session.organizationId);
            const affected = await db.execute(
                `UPDATE items SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} AND archived_at IS NULL`,
                vals
            );
            if (affected.rowCount === 0) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // include_in_low_stock_alerts — separate, fault-tolerant
        if (include_in_low_stock_alerts !== undefined) {
            await db.execute(
                `UPDATE items SET include_in_low_stock_alerts = $1 WHERE id = $2 AND organization_id = $3`,
                [include_in_low_stock_alerts !== false, id, session.organizationId]
            ).catch(() => {});
        }

        // Supplier link
        if (supplier_id !== undefined) {
            if (supplier_id) {
                await db.execute(`UPDATE item_suppliers SET is_preferred = false WHERE item_id = $1`, [id]).catch(() => {});
                await db.execute(
                    `INSERT INTO item_suppliers (item_id, supplier_id, is_preferred) VALUES ($1, $2, true)
                     ON CONFLICT (item_id, supplier_id) DO UPDATE SET is_preferred = true`,
                    [id, supplier_id]
                ).catch(() => {});
            } else {
                await db.execute(`UPDATE item_suppliers SET is_preferred = false WHERE item_id = $1`, [id]).catch(() => {});
            }
        }

        // Location assignments — replace
        if (Array.isArray(assigned_locations)) {
            // Get current locations for this item
            const existing = await db.query(`SELECT location_id FROM inventory WHERE item_id = $1 AND organization_id = $2`, [id, session.organizationId]);
            const existingIds = new Set(existing.map((r: any) => r.location_id));
            const newSet = new Set(assigned_locations.map(Number));
            // Add new
            for (const locId of newSet) {
                if (!existingIds.has(locId)) {
                    await db.execute(
                        `INSERT INTO inventory (item_id, location_id, organization_id, quantity) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING`,
                        [id, locId, session.organizationId]
                    ).catch(() => {});
                }
            }
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[Mobile products PUT/:id]', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await verifyMobileToken(req);
    const err = requireAdmin(session);
    if (err) return err;

    const id = parseInt(params.id);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    try {
        const res = await db.execute(
            `DELETE FROM items WHERE id = $1 AND organization_id = $2`,
            [id, session.organizationId]
        );
        if (res.rowCount === 0) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[Mobile products DELETE/:id]', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
