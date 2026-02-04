import { db } from '@/lib/db';

export async function logActivity(organizationId: number | null, userId: number, action: string, details: any) {
    try {
        // Check if logging is enabled
        // Query optimization: This could be cached or stored in process env if updated via webhooks, 
        // but for now a direct query is safest.

        // We can use a single query check?
        const setting = await db.one("SELECT value FROM system_settings WHERE key = 'logging_enabled'");
        if (setting && setting.value === 'false') {
            return; // Logging Disabled
        }

        await db.execute(
            'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, userId, action, JSON.stringify(details)]
        );
    } catch (e) {
        console.error('Logging failed', e);
    }
}
