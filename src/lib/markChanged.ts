import { db } from './db';

/**
 * Fire-and-forget upsert into data_sync.
 * Call after any successful mutation to let mobile clients know
 * they need to refresh the named data types.
 *
 * location_id = 0 means org-wide (no specific location).
 */
export function markChanged(organizationId: number, locationId: number, ...dataTypes: string[]): void {
    for (const dataType of dataTypes) {
        db.execute(
            `INSERT INTO data_sync (organization_id, location_id, data_type, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (organization_id, location_id, data_type)
             DO UPDATE SET updated_at = NOW()`,
            [organizationId, locationId, dataType]
        ).catch(() => {});
    }
}
