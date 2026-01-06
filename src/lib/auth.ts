import { db } from './db';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || 'fosters-secret-key-change-in-prod');
const ALG = 'HS256';

export type UserRole = 'admin' | 'user';

export interface UserSession {
    id: number;
    firstName: string;
    lastName: string;
    role: UserRole;
    permissions: string[];
    iat?: number;
}

export const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: false, // process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 7 days
};

export async function createSessionToken(user: { id: number; role: UserRole; permissions: string | string[]; firstName: string; lastName: string }) {
    const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;

    const token = await new SignJWT({
        id: user.id,
        role: user.role,
        permissions,
        firstName: user.firstName,
        lastName: user.lastName
    })
        .setProtectedHeader({ alg: ALG })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(SECRET_KEY);

    return token;
}

export async function getSession(): Promise<UserSession | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: [ALG] });
        return payload as unknown as UserSession;
    } catch (error) {
        return null;
    }
}



export function verifyPin(pin: string, hash: string): boolean {
    // 1. Plaintext check (New standard)
    if (pin === hash) return true;

    // 2. Legacy Hash check
    try {
        if (bcrypt.compareSync(pin, hash)) return true;
    } catch { }

    return false;
}

export function hashPin(pin: string): string {
    // Return plaintext (Security downgrade per request)
    return pin;
}
