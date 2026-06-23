import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Ensure the relational sub_categories table exists (added in migration 32,
// may be absent on databases that weren't fully migrated).
let _subCatsEnsured = false;
async function ensureSubCategoriesTable() {
    if (_subCatsEnsured) return;
    await db.execute(`
        CREATE TABLE IF NOT EXISTS sub_categories (
            id              SERIAL PRIMARY KEY,
            category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            display_order   INTEGER NOT NULL DEFAULT 0,
            UNIQUE(category_id, name)
        )
    `).catch(() => {});
    await db.execute(`CREATE INDEX IF NOT EXISTS sub_categories_category_idx ON sub_categories(category_id)`).catch(() => {});
    await db.execute(`CREATE INDEX IF NOT EXISTS sub_categories_org_idx ON sub_categories(organization_id)`).catch(() => {});
    // Remove duplicate (category_id, name) rows before ensuring the unique index.
    await db.execute(`
        DELETE FROM sub_categories a
        USING sub_categories b
        WHERE a.id > b.id
          AND a.category_id = b.category_id
          AND a.name = b.name
    `).catch(() => {});
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS sub_categories_category_name_uniq ON sub_categories(category_id, name)`).catch(() => {});
    // Migrate any existing JSONB sub_categories data into the relational table.
    // Safe to re-run — ON CONFLICT DO NOTHING skips already-migrated rows.
    await db.execute(`
        INSERT INTO sub_categories (category_id, organization_id, name, display_order)
        SELECT
            c.id,
            c.organization_id,
            elem.value,
            (elem.ord - 1)::int
        FROM categories c,
             jsonb_array_elements_text(c.sub_categories) WITH ORDINALITY AS elem(value, ord)
        WHERE c.sub_categories IS NOT NULL
          AND jsonb_typeof(c.sub_categories) = 'array'
          AND jsonb_array_length(c.sub_categories) > 0
          AND elem.value <> ''
        ON CONFLICT (category_id, name) DO NOTHING
    `).catch(() => {});
    _subCatsEnsured = true;
}

// ── Shared query: fetch categories with sub_categories aggregated from relational table ──
async function fetchCategoriesForOrg(orgId: number) {
    // Use a distinct alias for the aggregate so it never collides with the
    // legacy JSONB c.sub_categories column that c.* expands to include.
    const dedupe = (rows: any[], subKey: string) => {
        const seen = new Set<string>();
        return rows
            .filter((c: any) => {
                if (seen.has(c.name)) return false;
                seen.add(c.name);
                return true;
            })
            .map((c: any) => ({
                ...c,
                stock_options: typeof c.stock_options === 'string'
                    ? JSON.parse(c.stock_options)
                    : (c.stock_options || [1]),
                sub_categories: Array.isArray(c[subKey])
                    ? [...new Set<string>(c[subKey])]
                    : [],
            }));
    };

    try {
        const rows = await db.query(
            `SELECT c.*,
                COALESCE(
                    json_agg(sc.name ORDER BY sc.display_order, sc.name)
                    FILTER (WHERE sc.name IS NOT NULL),
                    '[]'::json
                ) AS sc_relational
             FROM categories c
             LEFT JOIN sub_categories sc ON sc.category_id = c.id AND sc.organization_id = $1
             WHERE c.organization_id = $1
             GROUP BY c.id
             ORDER BY c.name ASC`,
            [orgId]
        );
        return dedupe(rows, 'sc_relational');
    } catch (e: any) {
        console.warn('[fetchCategoriesForOrg] sub_categories join failed, using fallback:', e.message);
        const rows = await db.query(
            `SELECT * FROM categories WHERE organization_id = $1 ORDER BY name ASC`,
            [orgId]
        );
        // In fallback, read sub_categories from the JSONB column if present
        return dedupe(rows, 'sub_categories');
    }
}

// ── Sync sub_categories rows for a category (replace all) ──
async function syncSubCategories(categoryId: number, orgId: number, names: string[]) {
    try {
        await db.execute(
            'DELETE FROM sub_categories WHERE category_id = $1 AND organization_id = $2',
            [categoryId, orgId]
        );
        for (let i = 0; i < names.length; i++) {
            const name = names[i].trim();
            if (!name) continue;
            await db.execute(
                `INSERT INTO sub_categories (category_id, organization_id, name, display_order)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (category_id, name) DO UPDATE SET display_order = EXCLUDED.display_order`,
                [categoryId, orgId, name, i]
            );
        }
    } catch (e: any) {
        console.warn('[syncSubCategories] sub_categories table may not exist yet:', e.message);
    }
}

export async function GET(req: NextRequest) {
    await ensureSubCategoriesTable();
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        let orgId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            orgId = parseInt(searchParams.get('orgId') as string, 10);
        }

        const categories = await fetchCategoriesForOrg(orgId);
        return NextResponse.json({ categories });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    await ensureSubCategoriesTable();
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (session.role !== 'admin' && !session.permissions.includes('all')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { name, stock_options, sub_categories, enable_low_stock_reporting } = await req.json();
        if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

        const options = stock_options ? JSON.stringify(stock_options) : JSON.stringify([1]);
        const enableReporting = enable_low_stock_reporting !== false;

        const res = await db.one(
            'INSERT INTO categories (name, stock_options, enable_low_stock_reporting, organization_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, options, enableReporting, session.organizationId]
        );

        if (Array.isArray(sub_categories) && sub_categories.length > 0) {
            await syncSubCategories(res.id, session.organizationId, sub_categories);
        }

        return NextResponse.json({ success: true, id: res.id });
    } catch (e: any) {
        if (e.message?.includes('unique constraint') || e.message?.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Category already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    await ensureSubCategoriesTable();
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        const { id, name, stock_options, sub_categories, enable_low_stock_reporting } = await req.json();
        if (!id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        const options = stock_options ? JSON.stringify(stock_options) : JSON.stringify([1]);
        const enableReporting = enable_low_stock_reporting !== false;

        await db.execute(
            'UPDATE categories SET name = $1, stock_options = $2, enable_low_stock_reporting = $3 WHERE id = $4 AND organization_id = $5',
            [name, options, enableReporting, id, session.organizationId]
        );

        await syncSubCategories(id, session.organizationId, Array.isArray(sub_categories) ? sub_categories : []);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        if (e.message?.includes('unique constraint') || e.message?.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Category name already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const cat = await db.one(
            'SELECT name FROM categories WHERE id = $1 AND organization_id = $2',
            [id, session.organizationId]
        );
        if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const used = await db.one(
            'SELECT COUNT(*) as count FROM items WHERE type = $1 AND organization_id = $2',
            [cat.name, session.organizationId]
        );
        if (parseInt(used.count) > 0) {
            return NextResponse.json({ error: `Cannot delete: ${used.count} items are using this category.` }, { status: 400 });
        }

        // sub_categories rows cascade-delete via FK
        await db.execute(
            'DELETE FROM categories WHERE id = $1 AND organization_id = $2',
            [id, session.organizationId]
        );
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
