import { SignIn } from '@clerk/nextjs';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignInPage() {
  if (!hasClerkKeys) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <div style={{ padding: '2rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.5rem', color: '#856404' }}>Auth no configurada</h2>
          <p style={{ margin: 0, color: '#856404', fontSize: '0.9rem' }}>
            Añade <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> y <code>CLERK_SECRET_KEY</code> en <code>.env.local</code> para activar el login.
          </p>
          <p style={{ margin: '1rem 0 0', fontSize: '0.85rem', color: '#6c757d' }}>
            Demo: usa <a href="/pro/login" style={{ color: '#856404' }}>/pro/login</a> o <a href="/admin/login" style={{ color: '#856404' }}>/admin/login</a> con Admin / ADMIN
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: 'flex', justifyContent: 'center', padding: '4rem 1rem' }}>
      <SignIn />
    </main>
  );
}
