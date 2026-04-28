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
        forceRedirectUrl={acceptCookies ? '/accept-cookies' : '/'}
      />
    </AuthLayout>
  );
}
