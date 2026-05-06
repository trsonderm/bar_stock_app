import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB base64 limit
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ── POST /api/mobile/profile/picture ─────────────────────────────────────────
// Upload or replace the authenticated user's profile picture.
// Body: { image: "data:image/jpeg;base64,..." }
//
// Accepts JPEG, PNG, WebP, or GIF as base64 data-URIs.
// Max size: 5 MB (encoded). Images are stored as data-URIs in profile_picture.
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image } = body as { image?: string };

        if (!image || typeof image !== 'string')
            return NextResponse.json({ error: 'image (base64 data-URI) required' }, { status: 400 });

        if (!image.startsWith('data:image/'))
            return NextResponse.json({ error: 'image must be a base64 data-URI (data:image/...)' }, { status: 400 });

        // Validate MIME type
        const mimeMatch = image.match(/^data:(image\/[^;]+);base64,/);
        if (!mimeMatch || !ALLOWED_MIME.includes(mimeMatch[1]))
            return NextResponse.json(
                { error: `Unsupported image type. Allowed: ${ALLOWED_MIME.join(', ')}` },
                { status: 400 }
            );

        // Enforce size limit
        if (image.length > MAX_SIZE_BYTES)
            return NextResponse.json({ error: 'Image too large (max 5 MB)' }, { status: 413 });

        await db.execute(
            `UPDATE users SET profile_picture = $1 WHERE id = $2 AND organization_id = $3`,
            [image, session.id, session.organizationId]
        );

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('POST /api/mobile/profile/picture error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ── DELETE /api/mobile/profile/picture ───────────────────────────────────────
// Remove the profile picture (sets to null).
export async function DELETE(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await db.execute(
            `UPDATE users SET profile_picture = NULL WHERE id = $1 AND organization_id = $2`,
            [session.id, session.organizationId]
        );

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('DELETE /api/mobile/profile/picture error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
