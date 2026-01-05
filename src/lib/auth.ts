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
}

export async function createSession(user: { id: number; role: UserRole; permissions: string | string[]; firstName: string; last_name: string }) {
    const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;

    const token = await new SignJWT({
        id: user.id,
        role: user.role,
        permissions,
        firstName: user.firstName, // Note: DB field is first_name, we use firstName in session
        lastName: user.last_name
    })
        .setProtectedHeader({ alg: ALG })
        .setIssuedAt()
        .setExpirationTime('7d') // Keep logged in for 7 days
        .sign(SECRET_KEY);

    (await cookies()).set('session', token, {
        httpOnly: true,
        secure: false, // process.env.NODE_ENV === 'production', // Disable secure for HTTP support
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7 // 7 days
    });
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

export async function logout() {
    (await cookies()).delete('session');
}

export function verifyPin(pin: string, hash: string): boolean {
    return bcrypt.compareSync(pin, hash);
}

export function hashPin(pin: string): string {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(pin, salt);
}
