/**
 * Authentication helpers: session JWT creation/verification and
 * password / PIN hashing.
 *
 * Sessions are stateless HS256 JWTs stored in the httpOnly `session` cookie.
 * The same token is verified in `src/middleware.ts` for page-level routing and
 * again in each API route via `getSession()`.
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import { getJwtSecretKey, JWT_ALG } from './jwt-secret';

export type UserRole = 'admin' | 'user';

/** Claims carried in the session JWT. */
export interface UserSession {
    id: number;
    firstName: string;
    lastName: string;
    email?: string;
    organizationId: number;
    isSuperAdmin: boolean;
    /** True when a super admin has switched into a tenant organization. */
    isImpersonating?: boolean;
    subscriptionPlan?: 'base' | 'pro' | 'free_trial' | string;
    role: UserRole;
    permissions: string[];
    iat?: number;
}

/**
 * Options for the `session` cookie.
 *
 * `secure` is opt-in via COOKIE_SECURE=true because some deployments serve the
 * app over plain HTTP on an internal port; enable it whenever the site is
 * reached over HTTPS.
 */
export const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 7 days
};

/** Signs a 7-day session token for the given user. */
export async function createSessionToken(user: { id: number; role: UserRole; permissions: string | string[]; firstName: string; lastName: string; email?: string; organizationId: number; isSuperAdmin?: boolean; isImpersonating?: boolean; subscriptionPlan?: string }) {
    let permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
    if (!permissions) permissions = [];

    const token = await new SignJWT({
        id: user.id,
        role: user.role,
        permissions,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        organizationId: user.organizationId,
        isSuperAdmin: user.isSuperAdmin || false,
        isImpersonating: user.isImpersonating || false,
        subscriptionPlan: user.subscriptionPlan || 'base'
    })
        .setProtectedHeader({ alg: JWT_ALG })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(getJwtSecretKey());

    return token;
}

/**
 * Reads and verifies the session cookie for the current request.
 *
 * Returns null when there is no cookie, the token is invalid/expired, the user
 * no longer exists or is locked, or their sessions were revoked (by a super
 * admin's "force logout") after this token was issued.
 */
export async function getSession(): Promise<UserSession | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (!token) return null;

    let session: UserSession;
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey(), { algorithms: [JWT_ALG] });
        session = payload as unknown as UserSession;
        if (!session.permissions) session.permissions = [];
    } catch (error) {
        return null;
    }

    try {
        const user = await db.one('SELECT is_locked, session_invalidated_at FROM users WHERE id = $1', [session.id]);
        if (!user || user.is_locked) return null;
        // `iat` has one-second resolution, so compare in whole seconds.
        if (user.session_invalidated_at && session.iat
            && session.iat < Math.floor(new Date(user.session_invalidated_at).getTime() / 1000)) {
            return null;
        }
    } catch {
        // Older schema without these columns: fall back to the token check alone.
    }

    return session;
}

export function verifyPassword(password: string, hash: string): boolean {
    if (!password || !hash) return false;
    try {
        return bcrypt.compareSync(password, hash);
    } catch {
        return false;
    }
}

export function hashPassword(password: string): string {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
}

/**
 * Checks a 4-digit PIN against the stored value.
 *
 * PINs are currently stored in plaintext (see `hashPin`); older accounts may
 * still hold a bcrypt hash, so both forms are accepted.
 */
export function verifyPin(pin: string, hash: string): boolean {
    if (pin === hash) return true;

    try {
        if (bcrypt.compareSync(pin, hash)) return true;
    } catch { }

    return false;
}

/**
 * Returns the value to store for a PIN.
 *
 * NOTE: PINs are intentionally stored in plaintext so admins can view them.
 * This is a deliberate product decision; PIN login is additionally gated by a
 * registered station token (see /api/auth/login).
 */
export function hashPin(pin: string): string {
    return pin;
}
