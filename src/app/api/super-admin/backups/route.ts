import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { scheduler } from '@/lib/scheduler';
import fs from 'fs';
import path from 'path';

// START Scheduler if not started (Next.js serverless makes this tricky, usually better in separate worker or custom server)
// But for this simple app, we can lazy init. Warning: Serverless functions might kill it. 
// In Docker container mode with `next start`, the process stays alive, so a singleton works okay if hit at least once.
scheduler.start();

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const backups = scheduler.getBackups().sort((a, b) => b.created.getTime() - a.created.getTime());
        return NextResponse.json({ backups });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await req.json();

    try {
        if (action === 'backup') {
            await scheduler.runBackup();
            return NextResponse.json({ success: true });
        }
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
    }
}
