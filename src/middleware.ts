import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || 'fosters-secret-key-change-in-prod');

export async function middleware(request: NextRequest) {
    const session = request.cookies.get('session')?.value;
    const path = request.nextUrl.pathname;

    // Public routes
    if (path === '/' || path === '/admin/login' || path.startsWith('/api/auth') || path.startsWith('/_next') || path.startsWith('/favicon.ico')) {
        // If logged in and at / or /admin/login, maybe redirect?
        // For now, let them access login pages even if logged in, or redirect to dashboard/inventory
        if (session && path === '/') {
            // Verify session valid
            try {
                await jwtVerify(session, SECRET_KEY);
                return NextResponse.redirect(new URL('/inventory', request.url));
            } catch (e) {
                // Invalid session, let them proceed to login
            }
        }
        return NextResponse.next();
    }

    // Protected routes
    if (!session) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    try {
        const { payload } = await jwtVerify(session, SECRET_KEY);
        const role = (payload as any).role;

        // Admin only routes
        if (path.startsWith('/admin') && path !== '/admin/login') {
            if (role !== 'admin') {
                return NextResponse.redirect(new URL('/inventory', request.url)); // Usage page
            }
        }

        return NextResponse.next();
    } catch (error) {
        return NextResponse.redirect(new URL('/', request.url));
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes, some might be protected manually or here)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
