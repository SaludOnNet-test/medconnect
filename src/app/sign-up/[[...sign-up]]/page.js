import { SignUp } from '@clerk/nextjs';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignUpPage({ searchParams }) {
  const acceptCookies = searchParams?.accept_cookies === '1';

  if (!hasClerkKeys) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <div style={{ padding: '2rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.5rem', color: '#856404' }}>Auth no configurada</h2>
          <p style={{ margin: 0, color: '#856404', fontSize: '0.9rem' }}>
            Añade las claves de Clerk en <code>.env.local</code> para activar el registro.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell auth-shell--column">
      {acceptCookies && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '0.75rem 1rem',
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '8px',
          maxWidth: 'min(400px, calc(100vw - 2rem))',
          width: '100%',
          fontSize: '0.9rem',
          color: '#166534',
          lineHeight: '1.5',
        }}>
          ✅ <strong>Al crear tu cuenta aceptas el uso de cookies analíticas</strong> (Google Analytics y Microsoft Clarity) para mejorar el servicio. Puedes gestionar tus preferencias en cualquier momento desde la <a href="/cookies" style={{ color: '#166534' }}>Política de cookies</a>.
        </div>
      )}
      <SignUp
        afterSignUpUrl={acceptCookies ? '/accept-cookies' : '/'}
      />
    </main>
  );
}
