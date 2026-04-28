import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import os from 'os';
import { execSync } from 'child_process';

function getCpuUsage(): number {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
        for (const type of Object.values(cpu.times)) total += type;
        idle += cpu.times.idle;
    }
    return parseFloat(((1 - idle / total) * 100).toFixed(1));
}

function getDiskUsage(): { size: string; used: string; percent: string } | null {
    try {
        const platform = process.platform;
        if (platform === 'win32') {
            const out = execSync('wmic logicaldisk get size,freespace,caption', { timeout: 3000 }).toString();
            const lines = out.trim().split('\n').slice(1).filter(Boolean);
            let totalSize = 0, totalFree = 0;
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    totalFree += parseInt(parts[1]) || 0;
                    totalSize += parseInt(parts[2]) || 0;
                }
            }
            if (!totalSize) return null;
            const used = totalSize - totalFree;
            return {
                size: (totalSize / 1024 / 1024 / 1024).toFixed(0),
                used: (used / 1024 / 1024 / 1024).toFixed(0),
                percent: ((used / totalSize) * 100).toFixed(1),
            };
        } else {
            const out = execSync('df -k /', { timeout: 3000 }).toString();
            const lines = out.trim().split('\n');
            const parts = lines[lines.length - 1].trim().split(/\s+/);
            const totalKB = parseInt(parts[1]);
            const usedKB = parseInt(parts[2]);
            if (!totalKB) return null;
            return {
                size: (totalKB / 1024 / 1024).toFixed(0),
                used: (usedKB / 1024 / 1024).toFixed(0),
                percent: ((usedKB / totalKB) * 100).toFixed(1),
            };
        }
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!session || !isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const disk = getDiskUsage();

    return NextResponse.json({
        cpu: getCpuUsage(),
        mem: {
            total: (totalMem / 1024 / 1024 / 1024).toFixed(1),
            used: (usedMem / 1024 / 1024 / 1024).toFixed(1),
            free: (freeMem / 1024 / 1024 / 1024).toFixed(1),
        },
        disk: disk || { size: '—', used: '—', percent: '—' },
        uptime: Math.floor(os.uptime()),
    });
}
