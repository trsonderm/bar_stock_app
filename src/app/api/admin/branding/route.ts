import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { saveFile } from '@/lib/upload';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await db.one('SELECT settings FROM organizations WHERE id = $1', [session.organizationId]);
    const s = org?.settings || {};
    return NextResponse.json({
        logo_url: s.logo_url || null,
        brand_color: s.brand_color || '#f59e0b',
        brand_name: s.brand_name || '',
        logo_position: s.logo_position || 'left',
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const contentType = req.headers.get('content-type') || '';
        const org = await db.one('SELECT settings FROM organizations WHERE id = $1', [session.organizationId]);
        let currentSettings: any = org?.settings || {};

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const file = formData.get('logo') as File | null;
            const brand_color = formData.get('brand_color') as string | null;
            const brand_name = formData.get('brand_name') as string | null;
            const logo_position = formData.get('logo_position') as string | null;

            if (file && file.size > 0) {
                const url = await saveFile(file);
                currentSettings.logo_url = url;
            }
            if (brand_color) currentSettings.brand_color = brand_color;
            if (brand_name !== null) currentSettings.brand_name = brand_name;
            if (logo_position) currentSettings.logo_position = logo_position;
        } else {
            const body = await req.json();
            if (body.brand_color !== undefined) currentSettings.brand_color = body.brand_color;
            if (body.brand_name !== undefined) currentSettings.brand_name = body.brand_name;
            if (body.logo_position !== undefined) currentSettings.logo_position = body.logo_position;
            if (body.remove_logo) currentSettings.logo_url = null;
        }

        await db.execute('UPDATE organizations SET settings = $1 WHERE id = $2', [currentSettings, session.organizationId]);
        return NextResponse.json({ success: true, settings: currentSettings });
    } catch (e: any) {
        console.error('[Branding POST]', e);
        return NextResponse.json({ error: e.message || 'Internal Error' }, { status: 500 });
    }
}
