import { NextResponse } from 'next/server';

const hasClerkKeys = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
);

// Protected route matchers
const ADMIN_PATHS = ['/admin', '/admin/'];
const PRO_PATHS = ['/pro/dashboard', '/pro/dashboard/'];
// Lock-in is always public — patients access via email link

function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/') && !pathname.startsWith('/admin/login');
}

function isProPath(pathname) {
  return pathname === '/pro/dashboard' || pathname.startsWith('/pro/dashboard/');
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // No Clerk keys → pass everything through (mock auth mode)
  if (!hasClerkKeys) {
    return NextResponse.next();
  }

  // Dynamically load Clerk middleware only when keys are present
  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');

  const isProtectedAdmin = createRouteMatcher(['/admin', '/admin/(?!login)(.*)']);
  const isProtectedPro = createRouteMatcher(['/pro/dashboard', '/pro/dashboard/(.*)']);

  return clerkMiddleware(async (auth, req) => {
    const { userId, sessionClaims } = await auth();
    const role = sessionClaims?.publicMetadata?.role;

    if (isProtectedAdmin(req)) {
      if (!userId || role !== 'admin') {
        const signInUrl = new URL('/sign-in', req.url);
        signInUrl.searchParams.set('redirect_url', req.url);
        return NextResponse.redirect(signInUrl);
      }
    }

    if (isProtectedPro(req)) {
      if (!userId || (role !== 'professional' && role !== 'admin')) {
        const signInUrl = new URL('/sign-in', req.url);
        signInUrl.searchParams.set('redirect_url', req.url);
        return NextResponse.redirect(signInUrl);
      }
    }

    return NextResponse.next();
  })(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
