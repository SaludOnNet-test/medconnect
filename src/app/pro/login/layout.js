// 2026-06-22 — /pro/login noindex.
//
// Auth gateway profesional. Indexarlo no tiene utilidad SEO — la
// landing marketing B2B vive en /pro/sign-up.

export const metadata = {
  robots: { index: false, follow: false },
};

export default function ProLoginLayout({ children }) {
  return children;
}
