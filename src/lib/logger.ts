/**
 * Writes a row to activity_logs (the per-organization audit trail), unless the
 * super admin has turned logging off via system_settings.logging_enabled.
 * Never throws: logging failures are only reported to the console.
 */
import { db } from '@/lib/db';

export async function logActivity(organizationId: number | null, userId: number, action: string, details: any) {
    try {
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
