import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoints } = await req.json() as { endpoints: { method: string; path: string }[] };
    if (!Array.isArray(endpoints)) {
        return NextResponse.json({ error: 'endpoints array required' }, { status: 400 });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const results = await Promise.allSettled(
        endpoints.map(async ({ method, path }) => {
            const start = Date.now();
            try {
                const res = await fetch(`${base}${path}`, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(8000),
                });
                const ms = Date.now() - start;
                // 401/403/405 all mean the route exists and is running
                const up = res.status < 500;
                return { path, method, status: res.status, ms, up };
            } catch (err: any) {
                return { path, method, status: 0, ms: Date.now() - start, up: false, error: err.message };
            }
        })
    );

    const checks = results.map((r, i) =>
        r.status === 'fulfilled'
            ? r.value
            : { path: endpoints[i].path, method: endpoints[i].method, status: 0, ms: 0, up: false, error: 'Check failed' }
    );

    return NextResponse.json({ checks });
}
