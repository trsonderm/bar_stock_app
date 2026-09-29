/**
 * Station (PIN-login device) tokens.
 *
 * An admin registers a device as a station for their organization; the device
 * then holds a long-lived `station_token` cookie. PIN login and the station
 * PIN pad pages are only available while that token is valid.
 */
import { randomUUID } from 'crypto';
import { db } from './db';

/** Organization-scoped operations. */
export class OrgScope {
    constructor(private orgId: number) {
        if (!orgId) throw new Error('Organization ID is required');
    }

    /**
     * Issues a new station token for this organization, valid for `days` days,
     * optionally bound to a browser fingerprint, IP and user agent.
     */
    async createStationToken(
        deviceName: string,
        days: number = 90,
        fingerprintHash?: string,
        registeredIp?: string,
        userAgent?: string
    ) {
        const token = randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
        const expiresAtIso = expiresAt.toISOString();

        await db.execute(`
            INSERT INTO organization_tokens
                (organization_id, token, device_name, expires_at, fingerprint_hash, registered_ip, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [this.orgId, token, deviceName, expiresAtIso,
            fingerprintHash || null, registeredIp || null, userAgent || null]);

        return { token, expiresAt: expiresAtIso };
    }
}

/**
 * Returns the token row (with org_id, org_name and subdomain) if `token` is
 * unexpired and not revoked, otherwise null. When the token was registered
 * with a fingerprint and one is supplied, they must match. Updates last_used_at.
 */
export async function validateStationToken(token: string, fingerprintHash?: string) {
    const row = await db.one(`
        SELECT t.*, o.subdomain, o.id as org_id, o.name as org_name
        FROM organization_tokens t
        JOIN organizations o ON t.organization_id = o.id
        WHERE t.token = $1
          AND t.expires_at > NOW()
          AND t.revoked_at IS NULL
    `, [token]);

    if (!row) return null;

    if (fingerprintHash && row.fingerprint_hash && fingerprintHash !== row.fingerprint_hash) {
        return null;
    }

    await db.execute('UPDATE organization_tokens SET last_used_at = NOW() WHERE id = $1', [row.id]);
    return row;
}
