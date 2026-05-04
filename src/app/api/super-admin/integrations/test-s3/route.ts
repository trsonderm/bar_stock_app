import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const rows = await db.query('SELECT key, value FROM system_settings WHERE key IN ($1,$2,$3,$4)', [
            's3_bucket', 's3_region', 's3_access_key', 's3_secret_key',
        ]);
        const cfg: Record<string, string> = {};
        rows.forEach((r: any) => { cfg[r.key] = r.value; });

        if (!cfg.s3_bucket || !cfg.s3_region || !cfg.s3_access_key || !cfg.s3_secret_key) {
            return NextResponse.json({ error: 'S3 not fully configured — save all fields first' }, { status: 400 });
        }

        // Use AWS SigV4 to do a simple ListObjectsV2 with max-keys=1 as a connectivity test
        const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');

        const client = new S3Client({
            region: cfg.s3_region,
            credentials: {
                accessKeyId: cfg.s3_access_key,
                secretAccessKey: cfg.s3_secret_key,
            },
        });

        await client.send(new ListObjectsV2Command({
            Bucket: cfg.s3_bucket,
            MaxKeys: 1,
        }));

        return NextResponse.json({ ok: true, message: `Connected to s3://${cfg.s3_bucket} in ${cfg.s3_region}` });
    } catch (err: any) {
        console.error('Test S3 error:', err);
        const msg = err?.message || 'Connection failed';
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
