// 2026-06-22 — /pro/dashboard noindex.
//
// Auth-only dashboard B2B. Google estaba rankeando esta URL para
// algún query general (5 sesiones organic 15-22 jun) y los users
// que aterrizaban veían una página vacía o el redirect a sign-in.
// Marcamos noindex para que Google deje de servirla como entrada.
//
// /pro/sign-up sigue siendo indexable (es la landing marketing B2B);
// solo esta página de dashboard se noindexa.

export const metadata = {
  robots: { index: false, follow: false },
};

export default function ProDashboardLayout({ children }) {
  return children;
}
