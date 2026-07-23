import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import InventoryClient from './InventoryClient';

export default async function InventoryPage() {
    const session = await getSession();

    if (!session) {
        redirect('/');
    }

    const user = {
        firstName: session.firstName,
        role: session.role,
        permissions: session.permissions as string[],
        iat: session.iat
    };

    let trackBottleLevels = false;
    let bottleOptions: any[] = [];
    try {
        const row = await db.one("SELECT value FROM settings WHERE key = 'track_bottle_levels' AND organization_id = $1", [session.organizationId]);
        if (row && row.value === 'true') {
            trackBottleLevels = true;
            bottleOptions = await db.query('SELECT * FROM bottle_level_options WHERE organization_id = $1 ORDER BY display_order ASC, id ASC', [session.organizationId]);
        }
    } catch (e) {
        console.error("Failed to load settings in inventory page", e);
    }

    let orgLocations: { id: number; name: string }[] = [];
    // Also load location audit settings so the client knows which buttons to show per location
    let locationAuditSettings: Record<number, Record<string, any>> = {};
    try {
        const locs = await db.query(
            'SELECT id, name, COALESCE(settings, \'{}\') AS settings FROM locations WHERE organization_id = $1 ORDER BY id ASC',
            [session.organizationId]
        );
        orgLocations = locs.map((l: any) => ({ id: l.id, name: l.name }));
        for (const l of locs) locationAuditSettings[l.id] = l.settings || {};
    } catch {}

    let organizationMode = 'bar_and_food';
    try {
        const orgRow = await db.one('SELECT settings FROM organizations WHERE id = $1', [session.organizationId]);
        if (orgRow?.settings?.organization_mode) organizationMode = orgRow.settings.organization_mode;
    } catch {}

    return (
        <InventoryClient
            user={user}
            trackBottleLevels={trackBottleLevels}
            bottleOptions={bottleOptions}
            orgLocations={orgLocations}
            organizationMode={organizationMode}
            locationAuditSettings={locationAuditSettings}
        />
    );
}
