import { NextRequest } from 'next/server';
import { db } from './db';
import crypto from 'crypto';

export type ApiScope =
    | 'inventory:read'
    | 'inventory:write'
    | 'orders:read'
    | 'orders:write'
    | 'audits:read'
    | 'audits:write'
    | 'locations:read'
    | 'categories:read'
    | '*';

export interface ApiSession {
    organizationId: number;
    scopes: ApiScope[];
    keyId: number;
    keyName: string;
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
    const raw = crypto.randomBytes(32).toString('hex');
    const key = `tsk_live_${raw}`;
    const prefix = `tsk_live_${raw.slice(0, 8)}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return { key, prefix, hash };
}

export async function getApiSession(req: NextRequest): Promise<ApiSession | null> {
    const auth = req.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer tsk_live_')) return null;

    const key = auth.slice(7);
    const hash = crypto.createHash('sha256').update(key).digest('hex');

    let row: any = null;
    try {
        row = await db.one(
            `SELECT id, organization_id, name, scopes FROM api_keys
             WHERE key_hash = $1 AND is_active = true`,
            [hash]
        );
    } catch {
        return null;
    }
    if (!row) return null;

    db.execute(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});

    return {
        organizationId: row.organization_id,
        scopes: row.scopes as ApiScope[],
        keyId: row.id,
        keyName: row.name,
    };
}

export function hasScope(session: ApiSession, required: ApiScope): boolean {
    return session.scopes.includes('*') || session.scopes.includes(required);
}

export async function ensureApiKeysTable(): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id              SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name            VARCHAR(120) NOT NULL,
            key_hash        VARCHAR(64) NOT NULL UNIQUE,
            prefix          VARCHAR(32) NOT NULL,
            scopes          TEXT[] NOT NULL DEFAULT ARRAY['*'],
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
            last_used_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(organization_id)`);
}
