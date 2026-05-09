/**
 * GET /api/v1/locations
 * List all locations for the organization.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiList, Err } from '@/lib/api-response';

export async function GET(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'locations:read')) return Err.forbidden('locations:read');

    const rows = await db.query(
        `SELECT id, name, address, created_at FROM locations WHERE organization_id = $1 ORDER BY name ASC`,
        [session.organizationId]
    );

    return apiList(rows, { total: rows.length, limit: rows.length, offset: 0 });
}
