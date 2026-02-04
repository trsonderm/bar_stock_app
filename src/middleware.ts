import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || 'topshelf-secret-key-change-in-prod');

export async function middleware(request: NextRequest) {
    const session = request.cookies.get('session')?.value;
    const path = request.nextUrl.pathname;

    // Public routes (include register and login)
    const publicPaths = ['/', '/login', '/register'];
    if (publicPaths.includes(path) || path.startsWith('/api/auth') || path.startsWith('/api/register') || path.startsWith('/api/system') || path.startsWith('/_next') || path.startsWith('/favicon.ico') || path.startsWith('/manifest.json')) {
        // Optional: Redirect logged in users away from login/register?
        // For now, allow access.
        return NextResponse.next();
    }

    // Protected routes
    if (!session) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
        const { payload } = await jwtVerify(session, SECRET_KEY);
        const role = (payload as any).role;
        const permissions = (payload as any).permissions || [];
        const isSuperAdmin = (payload as any).isSuperAdmin || permissions.includes('super_admin');
        const isImpersonating = (payload as any).isImpersonating || false;

        // Super Admin Route Protection
        if (path.startsWith('/super-admin')) {
            if (!isSuperAdmin) {
                // If not super admin, block access completely
                return NextResponse.redirect(new URL('/admin/dashboard', request.url));
            }
        }

        // Admin Route Protection
        if (path.startsWith('/admin')) {
            // STRICT SEPARATION: If Super Admin is trying to access Tenant Admin pages WITHOUT impersonating,
            // redirect them to the Super Admin Dashboard.
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
