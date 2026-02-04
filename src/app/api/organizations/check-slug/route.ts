import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const slug = searchParams.get('slug');

    if (!slug) {
        return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    try {
        // Query database for organization by subdomain/slug
        const org = await db.one('SELECT id, name, subdomain FROM organizations WHERE subdomain = ?', [slug]);

        if (org) {
            return NextResponse.redirect(new URL(`/o/${org.subdomain}`, request.url));
        } else {
            // If not found, maybe redirect back to landing with error?
            return NextResponse.redirect(new URL('/?error=org_not_found', request.url));
        }

    } catch (error) {
        console.error('Error checking organization slug:', error);
        return NextResponse.redirect(new URL('/?error=server_error', request.url));
    }
}
