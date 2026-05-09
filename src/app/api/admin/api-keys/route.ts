import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { generateApiKey, ensureApiKeysTable } from '@/lib/api-auth';

async function requireAdmin() {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') return null;
    return session;
}

// GET — list all API keys for this org (prefix only, never full key)
export async function GET() {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureApiKeysTable();

    const keys = await db.query(
        `SELECT id, name, prefix, scopes, is_active, last_used_at, created_at
         FROM api_keys
         WHERE organization_id = $1
         ORDER BY created_at DESC`,
        [session.organizationId]
    );

    return NextResponse.json({ keys });
}

// POST — create a new API key (returns the full key once — store it!)
export async function POST(req: NextRequest) {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureApiKeysTable();

    const body = await req.json();
    const { name, scopes = ['*'] } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const validScopes = [
        'inventory:read', 'inventory:write',
        'orders:read', 'orders:write',
        'audits:read', 'audits:write',
        'locations:read', 'categories:read',
        '*',
    ];
    const badScope = (scopes as string[]).find(s => !validScopes.includes(s));
    if (badScope) return NextResponse.json({ error: `Invalid scope: ${badScope}` }, { status: 400 });

    const { key, prefix, hash } = generateApiKey();

    const row = await db.one(
        `INSERT INTO api_keys (organization_id, name, key_hash, prefix, scopes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, prefix, scopes, created_at`,
        [session.organizationId, name.trim(), hash, prefix, scopes, session.id]
    );

    // Return the full key exactly once
    return NextResponse.json({ key: { ...row, full_key: key } }, { status: 201 });
}

// DELETE — revoke a key by id
export async function DELETE(req: NextRequest) {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const result = await db.execute(
        `UPDATE api_keys SET is_active = false WHERE id = $1 AND organization_id = $2`,
        [id, session.organizationId]
    );

    if ((result as any).rowCount === 0) {
        return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
}
