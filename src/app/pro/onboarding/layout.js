// 2026-06-22 — /pro/onboarding noindex.
//
// Auth-only onboarding flow (multi-step form profesional). Sin
// contexto de session no tiene sentido como entry page.

export const metadata = {
  robots: { index: false, follow: false },
};

export default function ProOnboardingLayout({ children }) {
  return children;
}
