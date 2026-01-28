import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import InventoryClient from './InventoryClient';

export default async function InventoryPage() {
    const session = await getSession();

    if (!session) {
        redirect('/');
    }

    // Pass necessary user info to client
    const user = {
        firstName: session.firstName,
        role: session.role,
        permissions: session.permissions as string[],
        iat: session.iat
    };

    // Fetch Global Settings
    let trackBottleLevels = false;
    let bottleOptions: any[] = [];
    try {
        const row = await db.one("SELECT value FROM settings WHERE key = 'track_bottle_levels'");
        if (row && row.value === 'true') {
            trackBottleLevels = true;
            bottleOptions = await db.query('SELECT * FROM bottle_level_options ORDER BY display_order ASC, id ASC');
        }
    } catch (e) {
        console.error("Failed to load settings in inventory page", e);
    }

    return <InventoryClient user={user} trackBottleLevels={trackBottleLevels} bottleOptions={bottleOptions} />;
}
