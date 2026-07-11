/**
 * GET /api/mobile/sync?since=ISO8601&location_id=N
 *
 * Lightweight poll endpoint for mobile apps.
 * Returns a list of data_types whose updated_at is newer than `since`
 * (or all types if `since` is omitted), along with the refresh endpoint
 * the client should call to get fresh data.
 *
 * Response shape:
 * {
 *   server_time: string,         // current server ISO timestamp
 *   organization_id: number,
 *   location_id: number,
 *   stale: string[] | null,      // types newer than `since`; null = check `data` for timestamps
 *   data: {
 *     [data_type]: { updated_at: string, endpoint: string }
 *   }
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

const DATA_ENDPOINTS: Record<string, string> = {
    products:      '/api/mobile/products',
    categories:    '/api/mobile/admin/categories',
    suppliers:     '/api/mobile/admin/suppliers',
    inventory:     '/api/mobile/inventory',
    stock:         '/api/mobile/stock',
    schedule:      '/api/mobile/schedule',
    messages:      '/api/mobile/messages',
    users:         '/api/mobile/admin/users',
    settings:      '/api/mobile/settings',
    recipes:       '/api/mobile/recipes',
    orders:        '/api/mobile/orders',
    bar_map:       '/api/admin/bar-map',
    security:      '/api/mobile/barred',
    locations:     '/api/mobile/admin/locations',
    pricing_bands: '/api/mobile/admin/pricing-bands',
};

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since');
    const locationId = parseInt(searchParams.get('location_id') || '0') || 0;
    const organizationId: number = session.organizationId;

    // Fetch all data_sync rows for this org + location combo
    // Include org-wide rows (location_id=0) and location-specific rows
    const rows = await db.query(
        `SELECT data_type, MAX(updated_at) AS updated_at
         FROM data_sync
         WHERE organization_id = $1
           AND (location_id = 0 OR location_id = $2)
         GROUP BY data_type`,
        [organizationId, locationId]
    );

    const serverTime = new Date().toISOString();

    const data: Record<string, { updated_at: string; endpoint: string }> = {};
    const stale: string[] = [];
    const sinceDate = since ? new Date(since) : null;

    for (const row of rows) {
        const endpoint = DATA_ENDPOINTS[row.data_type] ?? `/api/mobile/${row.data_type}`;
        const updatedAt: string = new Date(row.updated_at).toISOString();
        data[row.data_type] = { updated_at: updatedAt, endpoint };
        if (sinceDate && new Date(row.updated_at) > sinceDate) {
            stale.push(row.data_type);
        }
    }

    return NextResponse.json({
        server_time: serverTime,
        organization_id: organizationId,
        location_id: locationId,
        stale: sinceDate ? stale : null,
        data,
    });
}
