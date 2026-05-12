import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureRecipeTables } from '@/lib/api-auth';

interface ImportRecord {
    name?: string;
    description?: string;
    ingredients?: any[];
    instructions?: string;
    category?: string;
    tags?: string[];
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureRecipeTables();

    const body = await req.json().catch(() => ({}));
    const { records = [], skipDuplicates = true } = body as { records: ImportRecord[]; skipDuplicates: boolean };

    if (!Array.isArray(records) || records.length === 0) {
        return NextResponse.json({ error: 'No records provided' }, { status: 400 });
    }

    const existingNames = skipDuplicates
        ? new Set<string>(
              (await db.query(
                  `SELECT LOWER(name) AS n FROM org_recipes WHERE organization_id = $1`,
                  [session.organizationId]
              )).map((r: any) => r.n)
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

        try {
            await db.one(
                `INSERT INTO org_recipes (organization_id, name, description, ingredients, instructions, category, glass, amount, tags)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [
                    session.organizationId,
                    name,
                    rec.description?.trim() || null,
                    JSON.stringify(Array.isArray(rec.ingredients) ? rec.ingredients : []),
                    rec.instructions?.trim() || null,
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
