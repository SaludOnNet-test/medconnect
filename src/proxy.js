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

      // Not signed in → send to /pro/sign-in with a return URL. (Was
      // /sign-in originally, switched after the auth split — pros that
      // lose their session shouldn't land on the patient flow.)
      if (!userId) {
        const url = new URL('/pro/sign-in', req.url);
        url.searchParams.set('redirect_url', req.url);
        return NextResponse.redirect(url);
      }

      // Try the session token first (fast path). Clerk v7 only includes
      // publicMetadata in the JWT when the dashboard's session-token
      // template has been customized to add it — many instances don't,
      // so the claim arrives undefined even after the role is set.
      let role = sessionClaims?.publicMetadata?.role;

      // Slow fallback — fetch the user fresh from Clerk's API. ~50 ms
      // latency on /pro/dashboard requests. Only triggers when the
      // session-token route didn't return a role, so once the dashboard
      // template includes publicMetadata this code path goes unused.
      if (role !== 'professional' && role !== 'admin') {
        try {
          const { clerkClient } = await import('@clerk/nextjs/server');
          const client = await clerkClient();
          const user = await client.users.getUser(userId);
          role = user?.publicMetadata?.role;
        } catch (err) {
          console.error('[proxy] failed to refetch user role', err);
        }
      }

      // Signed in but no professional/admin role yet → send to the pending-
      // approval page so the user understands WHY they can't get in.
      // Ops promotes them via POST /api/admin/professionals/grant or via
      // the Clerk webhook on /pro/sign-up.
      if (role !== 'professional' && role !== 'admin') {
        return NextResponse.redirect(new URL('/pro/pending-approval', req.url));
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
