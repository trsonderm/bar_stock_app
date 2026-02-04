import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import si from 'systeminformation';

export async function GET(req: NextRequest) {
    const session = await getSession();
    // Strict Super Admin Check
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!session || !isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        const fsKey = (process.platform === 'win32') ? 'C:' : '/';
        const fsSize = await si.fsSize();
        const mainDisk = fsSize.find(d => d.mount === fsKey) || fsSize[0];

        return NextResponse.json({
            cpu: cpu.currentLoad.toFixed(1),
            mem: {
                total: (mem.total / 1024 / 1024 / 1024).toFixed(1),
                used: (mem.active / 1024 / 1024 / 1024).toFixed(1),
                free: (mem.available / 1024 / 1024 / 1024).toFixed(1)
            },
            disk: {
                size: (mainDisk.size / 1024 / 1024 / 1024).toFixed(0),
                used: (mainDisk.used / 1024 / 1024 / 1024).toFixed(0),
                percent: mainDisk.use.toFixed(1)
            },
            uptime: si.time().uptime
        });
    } catch (e) {
        console.error('System Info Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
