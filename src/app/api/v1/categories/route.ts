/**
 * GET /api/v1/categories
 * List all item categories for the organization.
 *
 * Query params:
 *   include_counts  boolean  If true, include item count per category
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiList, Err } from '@/lib/api-response';

export async function GET(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'categories:read')) return Err.forbidden('categories:read');

    const includeCounts = new URL(req.url).searchParams.get('include_counts') === 'true';

    const rows = await db.query(
        `SELECT c.id, c.name, c.description,
                ${includeCounts ? '(SELECT COUNT(*) FROM items i WHERE i.organization_id = $1 AND i.type = c.name) AS item_count,' : ''}
                c.created_at
         FROM categories c
         WHERE c.organization_id = $1
         ORDER BY c.name ASC`,
        [session.organizationId]
    );

    return apiList(
        rows.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            ...(includeCounts ? { item_count: Number(r.item_count) } : {}),
        })),
        { total: rows.length, limit: rows.length, offset: 0 },
    );
}
