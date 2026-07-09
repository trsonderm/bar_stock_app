/**
 * GET    /api/mobile/admin/categories          — list all org categories with sub-categories
 * POST   /api/mobile/admin/categories          — create a category
 * PUT    /api/mobile/admin/categories          — update a category (name, stock_options, sub_categories)
 * DELETE /api/mobile/admin/categories?id=<id>  — delete a category (blocked if items use it)
 *
 * GET: any authenticated user.  Write methods: admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

async function fetchCategories(orgId: number) {
    try {
        const rows = await db.query(
            `SELECT c.*,
                COALESCE(
                    json_agg(sc.name ORDER BY sc.display_order, sc.name)
                    FILTER (WHERE sc.name IS NOT NULL),
                    '[]'::json
                ) AS sub_categories_list
             FROM categories c
             LEFT JOIN sub_categories sc ON sc.category_id = c.id AND sc.organization_id = $1
             WHERE c.organization_id = $1
             GROUP BY c.id
             ORDER BY c.name ASC`,
            [orgId]
        );
        return rows.map((c: any) => ({
            id: c.id,
            name: c.name,
            stock_options: typeof c.stock_options === 'string' ? JSON.parse(c.stock_options) : (c.stock_options || [1]),
            sub_categories: Array.isArray(c.sub_categories_list) ? c.sub_categories_list : (c.sub_categories || []),
            enable_low_stock_reporting: c.enable_low_stock_reporting,
            default_stock_unit_label: c.default_stock_unit_label,
            default_stock_unit_size: c.default_stock_unit_size,
            default_order_unit_label: c.default_order_unit_label,
            default_order_unit_size: c.default_order_unit_size,
        }));
    } catch {
        const rows = await db.query(
            'SELECT id, name, stock_options, sub_categories, enable_low_stock_reporting FROM categories WHERE organization_id = $1 ORDER BY name ASC',
            [orgId]
        );
        return rows.map((c: any) => ({
            ...c,
            stock_options: typeof c.stock_options === 'string' ? JSON.parse(c.stock_options) : (c.stock_options || [1]),
            sub_categories: Array.isArray(c.sub_categories) ? c.sub_categories : [],
        }));
    }
}

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const categories = await fetchCategories(session.organizationId);
    return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const {
        name,
        stock_options,
        sub_categories,
        enable_low_stock_reporting,
        default_stock_unit_label,
        default_stock_unit_size,
        default_order_unit_label,
        default_order_unit_size,
    } = await req.json();

    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    try {
        const row = await db.one(
            `INSERT INTO categories
                (organization_id, name, stock_options, sub_categories, enable_low_stock_reporting,
                 default_stock_unit_label, default_stock_unit_size, default_order_unit_label, default_order_unit_size)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING id`,
            [
                session.organizationId,
                name.trim(),
                JSON.stringify(stock_options || [1]),
                JSON.stringify(sub_categories || []),
                enable_low_stock_reporting !== false,
                default_stock_unit_label || 'unit',
                default_stock_unit_size || 1,
                default_order_unit_label || 'case',
                default_order_unit_size || 1,
            ]
        );
        return NextResponse.json({ ok: true, id: row.id });
    } catch (e: any) {
        if (e.code === '23505') return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 });
        throw e;
    }
}

export async function PUT(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const {
        id,
        name,
        stock_options,
        sub_categories,
        enable_low_stock_reporting,
        default_stock_unit_label,
        default_stock_unit_size,
        default_order_unit_label,
        default_order_unit_size,
    } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name.trim()); }
    if (stock_options !== undefined) { updates.push(`stock_options = $${idx++}`); params.push(JSON.stringify(stock_options)); }
    if (sub_categories !== undefined) { updates.push(`sub_categories = $${idx++}`); params.push(JSON.stringify(sub_categories)); }
    if (enable_low_stock_reporting !== undefined) { updates.push(`enable_low_stock_reporting = $${idx++}`); params.push(enable_low_stock_reporting); }
    if (default_stock_unit_label !== undefined) { updates.push(`default_stock_unit_label = $${idx++}`); params.push(default_stock_unit_label); }
    if (default_stock_unit_size !== undefined) { updates.push(`default_stock_unit_size = $${idx++}`); params.push(default_stock_unit_size); }
    if (default_order_unit_label !== undefined) { updates.push(`default_order_unit_label = $${idx++}`); params.push(default_order_unit_label); }
    if (default_order_unit_size !== undefined) { updates.push(`default_order_unit_size = $${idx++}`); params.push(default_order_unit_size); }

    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id, session.organizationId);

    const result = await db.execute(
        `UPDATE categories SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
        params
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const inUse = await db.query(
        'SELECT id FROM items WHERE category_id = $1 AND organization_id = $2 LIMIT 1',
        [id, session.organizationId]
    );
    if (inUse.length > 0) {
        return NextResponse.json({ error: 'Category is in use by one or more products. Re-assign them before deleting.' }, { status: 409 });
    }

    await db.execute(
        'DELETE FROM categories WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    return NextResponse.json({ ok: true });
}
