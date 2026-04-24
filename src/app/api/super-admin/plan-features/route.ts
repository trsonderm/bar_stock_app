import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { DEFAULT_FEATURES, type PlanFeature } from '@/lib/plan-features';

async function getFeatures(): Promise<PlanFeature[]> {
    try {
        const row = await db.one("SELECT value FROM system_settings WHERE key='plan_features'");
        if (row?.value) return JSON.parse(row.value) as PlanFeature[];
    } catch {}
    return DEFAULT_FEATURES;
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const features = await getFeatures();
    return NextResponse.json({ features });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { features } = await req.json();
    if (!Array.isArray(features)) return NextResponse.json({ error: 'features array required' }, { status: 400 });

    await db.execute(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('plan_features', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
        [JSON.stringify(features)]
    );

    return NextResponse.json({ saved: true });
}
