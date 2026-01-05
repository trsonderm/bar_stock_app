import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPin, createSessionToken, COOKIE_OPTIONS, UserRole } from '@/lib/auth';
import * as fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { pin } = body;

        if (!pin || typeof pin !== 'string') {
            return NextResponse.json({ error: 'PIN is required' }, { status: 400 });
        }

        // Since we use salted hashes and only have the PIN, and the requirement is "all they use to login" is the PIN,
        // we must iterate users to find a match. This is acceptable for a small number of users (bar staff).
        // Optimization: If this scales, store a deterministic hash for lookup, or require user selection.

        const users = db.prepare('SELECT * FROM users').all() as any[];

        let matchedUser = null;

        for (const user of users) {
            // Basic check to ensure pin_hash exists
            if (user.pin_hash && verifyPin(pin, user.pin_hash)) {
                matchedUser = user;
                break;
            }
        }

        if (matchedUser) {
            // Map snake_case DB fields to camelCase expected by auth lib
            const sessionUser = {
                id: matchedUser.id,
                role: matchedUser.role as UserRole,
                permissions: matchedUser.permissions,
                firstName: matchedUser.first_name,
                lastName: matchedUser.last_name
            };

            const token = await createSessionToken(sessionUser);

            const response = NextResponse.json({ success: true, role: matchedUser.role });

            // Set cookie on the response object
            response.cookies.set('session', token, COOKIE_OPTIONS);

            return response;
        } else {
            return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
        }

    } catch (error) {
        const logPath = path.join(process.cwd(), 'login_debug.log');
        const logMsg = `Login Error [${new Date().toISOString()}]: ${error instanceof Error ? error.stack : JSON.stringify(error)}\n`;
        try {
            fs.appendFileSync(logPath, logMsg);
        } catch (e) {
            console.error('Failed to write to login_debug.log', e);
        }

        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
