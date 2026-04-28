import { SignUp } from '@clerk/nextjs';
import AuthLayout from '@/components/brand/AuthLayout';
import Card from '@/components/brand/Card';
import { brandClerkAppearance } from '@/lib/clerkAppearance';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const metadata = {
  title: 'Crear cuenta — Pro · Med Connect',
  description: 'Crea tu cuenta de profesional para empezar a derivar pacientes y vender huecos prioritarios en tu clínica.',
};

/**
 * /pro/sign-up — pro-only sign-up flow.
 *
 * The widget tags the new Clerk user with
 * `unsafeMetadata.signupSource = 'pro'`, which the Clerk webhook (see
 * /api/clerk/webhook) reads to auto-promote the account to
 * publicMetadata.role = 'professional' without needing manual ops grant.
 *
 * Path props are explicit on both this widget and the patient
 * /sign-up/page.js so Clerk doesn't bounce between routes when both
 * <SignUp> instances coexist in the same app.
 */
export default function ProSignUpPage() {
  if (!hasClerkKeys) {
    return (
      <AuthLayout mode="sign-up" audience="pro">
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
    <AuthLayout mode="sign-up" audience="pro">
      <SignUp
        path="/pro/sign-up"
        signInUrl="/pro/sign-in"
        appearance={brandClerkAppearance}
        forceRedirectUrl="/pro/onboarding"
        unsafeMetadata={{ signupSource: 'pro' }}
      />
    </AuthLayout>
  );
}
