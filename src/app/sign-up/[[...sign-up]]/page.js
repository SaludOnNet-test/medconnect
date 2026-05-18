import { SignUp } from '@clerk/nextjs';
import AuthLayout from '@/components/brand/AuthLayout';
import Card from '@/components/brand/Card';
import Icon from '@/components/icons/Icon';
import { brandClerkAppearance } from '@/lib/clerkAppearance';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default async function SignUpPage({ searchParams }) {
  // Next 16 returns searchParams as a promise from page components.
  const params = (typeof searchParams?.then === 'function') ? await searchParams : (searchParams || {});
  const acceptCookies = params?.accept_cookies === '1';

  if (!hasClerkKeys) {
    return (
      <AuthLayout mode="sign-up">
        <Card surface="50">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', margin: 0 }}>
            Auth no configurada
          </h2>
          <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)' }}>
            Añade las claves de Clerk en <code>.env.local</code> para activar el registro.
          </p>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode="sign-up">
      {acceptCookies && (
        <Card
          surface="50"
          style={{
            marginBottom: 'var(--space-4)',
            background: 'var(--sage-100)',
            borderColor: 'var(--sage-200)',
            color: 'var(--sage-700)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)' }}>
            <Icon name="check-circle" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <strong>Al crear tu cuenta aceptas el uso de cookies analíticas</strong> (Google Analytics y Microsoft Clarity) para mejorar el servicio. Puedes gestionar tus preferencias en cualquier momento desde la <a href="/cookies">Política de cookies</a>.
            </span>
          </div>
        </Card>
      )}
      <SignUp
        path="/sign-up"
        signInUrl="/sign-in"
        appearance={brandClerkAppearance}
        // After sign-up, route patients to /mi-cuenta so they see the
        // bookings the webhook just linked to their account (the "Crear
        // mi cuenta" CTA on /book's success screen brings them here
        // specifically to see their booking history). The accept-cookies
        // detour still wins when present — it's a one-shot consent screen
        // that redirects onward to /mi-cuenta after the user clicks
        // accept.
        forceRedirectUrl={acceptCookies ? '/accept-cookies?next=/mi-cuenta' : '/mi-cuenta'}
      />
      {/* No explicit `<div id="clerk-captcha" />` here. Adding the anchor
          while bot-sign-up protection is OFF in the Clerk dashboard
          surfaces "You attempted to complete a CAPTCHA, but they are not
          enabled" — the SDK tries to verify a token its config no longer
          expects. Re-add this div only when bot protection is turned back
          on in the Clerk dashboard. */}
    </AuthLayout>
  );
}
