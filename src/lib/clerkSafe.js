'use client';

/**
 * SSG-tolerant wrappers around Clerk's `useUser` / `useClerk` hooks.
 *
 * The static-prerender phase of `next build` renders client components in
 * an environment where `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` may be missing —
 * when that happens, `src/app/layout.js` skips the `<ClerkProvider>` and
 * any raw `useUser()` / `useClerk()` call throws "useUser can only be used
 * within the <ClerkProvider /> component", failing the whole build.
 *
 * The hooks are still called on every render (rules-of-hooks happy); we
 * just catch the throw and return a signed-out fallback. At runtime in
 * production the publishable key is present, ClerkProvider wraps as usual,
 * and these wrappers return the real hook result transparently.
 *
 * Pages that should never be prerendered (e.g. `/pro/dashboard`) already
 * declare `export const dynamic = 'force-dynamic'`; using these wrappers
 * in addition is belt-and-braces — the build worker can still prerender
 * such pages by mistake (it does in Next 16's static collection phase).
 */

import { useUser, useClerk } from '@clerk/nextjs';

export function useUserSafe() {
  try {
    return useUser();
  } catch {
    return { isLoaded: false, isSignedIn: false, user: null };
  }
}

export function useClerkSafe() {
  try {
    return useClerk();
  } catch {
    return null;
  }
}
