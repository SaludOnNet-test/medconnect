import { SignUp } from '@clerk/nextjs';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignUpPage() {
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
    <main style={{ display: 'flex', justifyContent: 'center', padding: '4rem 1rem' }}>
      <SignUp />
    </main>
  );
}
