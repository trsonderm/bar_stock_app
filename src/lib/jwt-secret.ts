/**
 * Shared JWT signing key for session cookies.
 *
 * Kept in its own module (no Node-only imports) so it can be used from both
 * the Edge middleware and Node route handlers.
 *
 * In production the JWT_SECRET environment variable is mandatory: falling back
 * to a hard-coded key would let anyone who has read this repository forge a
 * session token (including a super-admin one). In development a fixed key is
 * used so the app runs without extra setup.
 */

const DEV_FALLBACK_SECRET = 'topshelf-dev-secret-do-not-use-in-production';

let cachedKey: Uint8Array | null = null;

/** Returns the HMAC key used to sign and verify session JWTs. */
export function getJwtSecretKey(): Uint8Array {
    if (cachedKey) return cachedKey;

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET environment variable must be set in production.');
        }
        console.warn('[auth] JWT_SECRET is not set; using an insecure development key.');
    }

    cachedKey = new TextEncoder().encode(secret || DEV_FALLBACK_SECRET);
    return cachedKey;
}

/** JWT signing algorithm used for session tokens. */
export const JWT_ALG = 'HS256';
