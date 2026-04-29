'use client';

/**
 * ClerkProBridge — read-only client bridge that reports a signed-in
 * professional/admin Clerk user up to a parent component via callback.
 *
 * Why a separate file (and why dynamic-imported with ssr:false from /book):
 * the previous inline `require('@clerk/nextjs')` bridge in /book broke
 * production hydration after the live-keys swap (commented out 2026-04-28).
 * Isolating the Clerk import here AND deferring it to client-only via
 * `next/dynamic({ ssr: false })` means Clerk's hooks never participate in
 * SSR for the /book page, so there is no server-vs-client render mismatch
 * to recover from. The cost is one extra client chunk load when a pro
 * lands on /book — negligible.
 *
 * Renders nothing — it's a side-effect component.
 *
 * Props:
 *   onSignedInPro({ email, name, role }) — called once Clerk has loaded
 *     AND the current user has publicMetadata.role of 'professional' or
 *     'admin'. Not called for patients (no role) or signed-out users, so
 *     the consumer can flip state unconditionally without guarding.
 */
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

export default function ClerkProBridge({ onSignedInPro }) {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded || !user || typeof onSignedInPro !== 'function') return;
    const role = user.publicMetadata?.role;
    if (role !== 'professional' && role !== 'admin') return;

    onSignedInPro({
      email: user.primaryEmailAddress?.emailAddress || '',
      name: user.fullName || user.firstName || '',
      role,
    });
  }, [isLoaded, user, onSignedInPro]);

  return null;
}
