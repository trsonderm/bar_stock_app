import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { DEFAULT_ML_CONFIG, MLModelConfig } from '@/lib/ml';

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const row = await db.one(
      "SELECT value FROM system_settings WHERE key = 'ml_model_config' LIMIT 1",
      []
    );

    if (!row) {
      return NextResponse.json({ config: DEFAULT_ML_CONFIG });
    }

    const parsed = JSON.parse(row.value);
    const config: MLModelConfig = { ...DEFAULT_ML_CONFIG, ...parsed };
    return NextResponse.json({ config });
  } catch (e) {
    console.error('[ml-models GET]', e);
    return NextResponse.json({ config: DEFAULT_ML_CONFIG });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const config: MLModelConfig = { ...DEFAULT_ML_CONFIG, ...body };

    await db.execute(
      "INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      ['ml_model_config', JSON.stringify(config)]
    );

    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error('[ml-models POST]', e);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}
