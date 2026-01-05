import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPin, createSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const { pin } = await req.json();

        if (!pin || typeof pin !== 'string') {
            return NextResponse.json({ error: 'PIN is required' }, { status: 400 });
        }

        // Since we use salted hashes and only have the PIN, and the requirement is "all they use to login" is the PIN,
        // we must iterate users to find a match. This is acceptable for a small number of users (bar staff).
        // Optimization: If this scales, store a deterministic hash for lookup, or require user selection.

        const users = db.prepare('SELECT * FROM users').all() as any[];

        let matchedUser = null;

        for (const user of users) {
            if (verifyPin(pin, user.pin_hash)) {
                matchedUser = user;
                break;
            }
        }

        if (matchedUser) {
            await createSession(matchedUser); // Sets cookie
            return NextResponse.json({ success: true, role: matchedUser.role });
        } else {
            return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
        }

    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
