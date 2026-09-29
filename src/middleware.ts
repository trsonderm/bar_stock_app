/**
 * Edge middleware: page-level authentication and role-based routing.
 *
 * - Public paths pass straight through.
 * - Everything else requires a valid `session` JWT, otherwise the visitor is
 *   sent to /login.
 * - /super-admin/* is restricted to super admins.
 * - /admin/* is restricted to tenant admins; a super admin must impersonate an
 *   organization before using tenant admin pages.
 *
 * API routes still perform their own authorization via `getSession()`; this
 * middleware is a first line of defence, not the only one.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecretKey, JWT_ALG } from '@/lib/jwt-secret';

/** Exact paths reachable without a session. */
const PUBLIC_PATHS = ['/', '/login', '/register', '/pin'];

/**
 * Path prefixes reachable without a session. Each of these either needs no
 * auth or authenticates by other means (station token, one-time order token).
 */
const PUBLIC_PREFIXES = [
    '/api/auth',
    '/api/register',
    '/api/system/',              // quick-login flag for the login page (GET only is public)
    '/api/orders/public',        // supplier order approval via one-time token
    '/api/organizations/check-slug',
    '/o/',                       // station PIN pad, gated by station_token cookie
    '/orders/',                  // order approval page, gated by one-time token
    '/_next',
];

const PUBLIC_FILE = /\.(png|jpg|jpeg|svg|ico|webp)$|^\/manifest\.json$|^\/favicon\.ico$/;

function isPublic(path: string): boolean {
    return (
        PUBLIC_PATHS.includes(path) ||
        PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix)) ||
        PUBLIC_FILE.test(path)
    );
}

export async function middleware(request: NextRequest) {
    const session = request.cookies.get('session')?.value;
    const path = request.nextUrl.pathname;

    if (isPublic(path)) {
        return NextResponse.next();
    }

    if (!session) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
        const { payload } = await jwtVerify(session, getJwtSecretKey(), { algorithms: [JWT_ALG] });
        const role = (payload as any).role;
        const permissions = (payload as any).permissions || [];
        const isSuperAdmin = (payload as any).isSuperAdmin || permissions.includes('super_admin');
        const isImpersonating = (payload as any).isImpersonating || false;

        if (path.startsWith('/super-admin') && !isSuperAdmin) {
            return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        }

        if (path.startsWith('/admin')) {
            // Super admins must impersonate an organization before using tenant admin pages.
            if (isSuperAdmin && !isImpersonating) {
                return NextResponse.redirect(new URL('/super-admin', request.url));
            }

            if (role !== 'admin') {
                return NextResponse.redirect(new URL('/inventory', request.url));
            }
        }

        return NextResponse.next();
    } catch (error) {
        return NextResponse.redirect(new URL('/login', request.url));
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
