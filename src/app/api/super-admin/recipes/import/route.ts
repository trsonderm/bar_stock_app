/**
 * POST /api/super-admin/recipes/import
 * Bulk-import recipes into the global library.
 *
 * Body:
 *   records        ImportRecord[]   Array of recipe records to import
 *   skipDuplicates boolean          Skip records whose name already exists (default true)
 *
 * ImportRecord:
 *   name          string   required
 *   description   string   optional
 *   ingredients   array    optional  [{ name, amount, unit, instructions? }]
 *   instructions  string   optional
 *   category      string   optional  resolved by name → category_id
 *   category_id   number   optional  takes precedence over category string
 *   tags          array    optional  string[]
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureRecipeTables } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

interface ImportRecord {
    name?: string;
    description?: string;
    ingredients?: any[];
    instructions?: string;
    category?: string;
    category_id?: number | null;
    tags?: string[];
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureRecipeTables();

    const body = await req.json().catch(() => ({}));
    const { records = [], skipDuplicates = true } = body as { records: ImportRecord[]; skipDuplicates: boolean };

    if (!Array.isArray(records) || records.length === 0) {
        return NextResponse.json({ error: 'No records provided' }, { status: 400 });
    }

    // Load all category names for resolution
    const catRows = await db.query(
        `SELECT id, name, LOWER(name) AS lower_name FROM recipe_categories WHERE org_id IS NULL`
    );
    const catByName = new Map<string, number>(catRows.map((r: any) => [r.lower_name, r.id]));

    // Load existing recipe names for duplicate detection
    const existingNames = skipDuplicates
        ? new Set<string>(
              (await db.query(`SELECT LOWER(name) AS n FROM recipes`)).map((r: any) => r.n)
          )
        : new Set<string>();

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const name = rec.name?.trim();
        if (!name) { skipped++; continue; }

        if (skipDuplicates && existingNames.has(name.toLowerCase())) {
            skipped++;
            continue;
        }

        // Resolve category
        let categoryId: number | null = rec.category_id ?? null;
        if (!categoryId && rec.category?.trim()) {
            const lc = rec.category.trim().toLowerCase();
            if (catByName.has(lc)) {
                categoryId = catByName.get(lc)!;
            } else {
                // Create new category on the fly
                const slug = lc.replace(/[^a-z0-9]+/g, '-');
                const newCat = await db.one(
                    `INSERT INTO recipe_categories (name, slug, is_system)
                     VALUES ($1, $2, FALSE) RETURNING id`,
                    [rec.category.trim(), slug]
                ).catch(() => null);
                if (newCat) {
                    categoryId = newCat.id;
                    catByName.set(lc, newCat.id);
                }
            }
        }

        try {
            await db.one(
                `INSERT INTO recipes (name, description, ingredients, instructions, category_id, category, glass, amount, tags)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [
                    name,
                    rec.description?.trim() || null,
                    JSON.stringify(Array.isArray(rec.ingredients) ? rec.ingredients : []),
                    rec.instructions?.trim() || null,
                    categoryId,
                    rec.category?.trim() || null,
                    (rec as any).glass?.trim() || null,
                    (rec as any).amount?.trim() || null,
                    Array.isArray(rec.tags) ? rec.tags : [],
                ]
            );
            existingNames.add(name.toLowerCase());
            imported++;
        } catch (err: any) {
            errors.push(`Row ${i + 1} (${name}): ${err?.message || 'insert failed'}`);
            skipped++;
        }
    }

    return NextResponse.json({ ok: true, imported, skipped, errors });
}
