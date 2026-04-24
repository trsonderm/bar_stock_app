import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import path from 'path';
import fs from 'fs';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const filename = req.nextUrl.searchParams.get('file');
    if (!filename || filename.includes('..') || filename.includes('/')) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const backupDir = path.join(process.cwd(), 'backups');
    const filepath = path.join(backupDir, filename);

    if (!filepath.startsWith(backupDir) || !fs.existsSync(filepath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const stat = fs.statSync(filepath);
    const stream = fs.createReadStream(filepath);

    // Convert Node.js ReadStream to Web ReadableStream
    const webStream = new ReadableStream({
        start(controller) {
            stream.on('data', chunk => controller.enqueue(chunk));
            stream.on('end', () => controller.close());
            stream.on('error', err => controller.error(err));
        },
        cancel() {
            stream.destroy();
        },
    });

    return new NextResponse(webStream, {
        headers: {
            'Content-Type': 'application/sql',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(stat.size),
        },
    });
}
