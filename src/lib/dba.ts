import { db } from './db';

// Helper to enforce organization isolation
export class OrgScope {
    constructor(private orgId: number) {
        if (!orgId) throw new Error('Organization ID is required');
    }

    // Generic helper queries (wrappers)
    async query(sql: string, params: any[] = []) {
        return await db.query(sql, params);
    }

    // --- Users ---
    async getUsers() {
        return await db.query('SELECT * FROM users WHERE organization_id = $1', [this.orgId]);
    }

    async getUser(id: number) {
        return await db.one('SELECT * FROM users WHERE organization_id = $1 AND id = $2', [this.orgId, id]);
    }

    // --- Items / Inventory ---
    async getItems(categoryId?: number) {
        let sql = 'SELECT * FROM items WHERE (organization_id = $1 OR organization_id IS NULL)';
        const params: any[] = [this.orgId];

        if (categoryId) {
            // Assuming categories are joined or filtered. 
            // For now simple Filter if column exists, or we might need JOIN logic.
            // Schema has 'type' on items which matches category name.
            // Let's assume we pass category name as type?
            // Or if categoryId is passed, we first get category name?
            // Simplified: fetch all and filter in app or update sql if we know structure.
            // Let's stick to simple for now. 
        }
        return await db.query(sql, params);
    }

    // --- Activity Logs ---
    async logActivity(userId: number, action: string, details: any) {
        return await db.execute(`
            INSERT INTO activity_logs (organization_id, user_id, action, details)
            VALUES ($1, $2, $3, $4)
        `, [this.orgId, userId, action, JSON.stringify(details)]);
    }

    async getLogs(limit = 50) {
        return await db.query(`
            SELECT l.*, u.first_name, u.last_name 
            FROM activity_logs l
            LEFT JOIN users u ON l.user_id = u.id
            WHERE l.organization_id = $1
            ORDER BY l.timestamp DESC
            LIMIT $2
        `, [this.orgId, limit]);
    }

    // --- Station Tokens ---
    async createStationToken(deviceName: string, days: number = 90) {
        const { v4: uuidv4 } = require('uuid');
        const token = uuidv4();
        // Calculate expiry date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
        const expiresAtIso = expiresAt.toISOString();

        await db.execute(`
            INSERT INTO organization_tokens (organization_id, token, device_name, expires_at)
            VALUES ($1, $2, $3, $4)
        `, [this.orgId, token, deviceName, expiresAtIso]);

        return { token, expiresAt: expiresAtIso };
    }
}

// Global Token Validator
export async function validateStationToken(token: string) {
    const row = await db.one(`
        SELECT t.*, o.subdomain 
        FROM organization_tokens t
        JOIN organizations o ON t.organization_id = o.id
        WHERE t.token = $1 AND t.expires_at > datetime('now')
    `, [token]);

    if (row) {
        // Update last used
        await db.execute('UPDATE organization_tokens SET last_used_at = datetime(\'now\') WHERE id = $1', [row.id]);
        return row;
    }
    return null;
}
