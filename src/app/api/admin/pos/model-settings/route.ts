import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const row = await db.one(
            `SELECT sensitivity, padding_pct, oz_per_shot, default_view, custom_rules
             FROM pos_model_settings WHERE organization_id = $1`,
            [session.organizationId]
        ).catch(() => null);

        return NextResponse.json({
            settings: row ?? {
                sensitivity: 0.50,
                padding_pct: 5.00,
                oz_per_shot: 1.50,
                default_view: 'weekly',
                custom_rules: {},
            },
        });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { sensitivity, padding_pct, oz_per_shot, default_view, custom_rules } = await req.json();

        await db.execute(
            `INSERT INTO pos_model_settings (organization_id, sensitivity, padding_pct, oz_per_shot, default_view, custom_rules, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW())
             ON CONFLICT (organization_id) DO UPDATE SET
                sensitivity  = EXCLUDED.sensitivity,
                padding_pct  = EXCLUDED.padding_pct,
                oz_per_shot  = EXCLUDED.oz_per_shot,
                default_view = EXCLUDED.default_view,
                custom_rules = EXCLUDED.custom_rules,
                updated_at   = NOW()`,
            [
                session.organizationId,
                Math.max(0, Math.min(1, sensitivity ?? 0.5)),
                Math.max(0, Math.min(100, padding_pct ?? 5)),
                Math.max(0.25, oz_per_shot ?? 1.5),
                ['weekly', 'monthly'].includes(default_view) ? default_view : 'weekly',
                JSON.stringify(custom_rules || {}),
            ]
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Error saving settings' }, { status: 500 });
    }
}
