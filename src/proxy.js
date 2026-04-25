import { NextResponse } from 'next/server';

const hasClerkKeys = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
);

export async function proxy(request) {
  // No Clerk keys — pass all requests through (local / mock mode)
  if (!hasClerkKeys) return NextResponse.next();

  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');

  // /admin/** uses its own auth (admin_users table + HMAC tokens, see src/lib/adminAuth.js).
  // Clerk only protects /pro/dashboard.
  const isProRoute = createRouteMatcher(['/pro/dashboard', '/pro/dashboard/:path+']);

  return clerkMiddleware(async (auth, req) => {
    if (isProRoute(req)) {
      const { userId, sessionClaims } = await auth();
      const role = sessionClaims?.publicMetadata?.role;
      if (!userId || (role !== 'professional' && role !== 'admin')) {
        const url = new URL('/sign-in', req.url);
        url.searchParams.set('redirect_url', req.url);
        return NextResponse.redirect(url);
      }
    }
  })(request);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
