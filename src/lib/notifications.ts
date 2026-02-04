import { db } from './db';

// Helper to check user preferences and insert notification
export async function createNotification(
    organizationId: number,
    type: 'price_change' | 'stock_change' | 'system',
    title: string,
    message: string,
    data: any = {}
) {
    try {
        // 1. Find users in the org who want this notification
        // Parsing JSONB in SQL or JS? 
        // Let's fetch all users in Org and filter in JS to avoid complex JSONB queries if not sure of syntax support
        // Note: For large apps, do this in SQL.
        const users = await db.query(`
            SELECT id, notification_preferences FROM users 
            WHERE organization_id = $1 
        `, [organizationId]);

        const values: any[] = [];
        const placeholders: string[] = [];
        let pIndex = 1;

        for (const user of users) {
            const prefs = user.notification_preferences || {};
            // If pref is explicitly false, skip. Default true.
            // My schema default was: '{"price_changes": true, "stock_changes": true, "system": true}'
            // Types map: 
            // 'price_change' -> prefs.price_changes
            // 'stock_change' -> prefs.stock_changes
            // 'system' -> prefs.system

            let shouldNotify = true;
            if (type === 'price_change' && prefs.price_changes === false) shouldNotify = false;
            if (type === 'stock_change' && prefs.stock_changes === false) shouldNotify = false;
            // system usually always on or prefs.system

            if (shouldNotify) {
                await db.execute(`
                    INSERT INTO notifications (organization_id, user_id, type, title, message, data)
                    VALUES ($1, $2, $3, $4, $5, $6)
                 `, [organizationId, user.id, type, title, message, JSON.stringify(data)]);
            }
        }

    } catch (e) {
        console.error('Failed to create notification', e);
    }
}
