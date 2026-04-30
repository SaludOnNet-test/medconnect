/**
 * /internal/board — Board presentation deck (Med Connect MVP launch review)
 *
 * Audience: two company directors, 30–45 min in-person session, projected.
 *
 * Access:
 *  - Gated by `?k=<secret>` matching env `BOARD_DECK_SECRET` (or the dev
 *    fallback below). Not linked from anywhere on the public site.
 *  - robots.txt already disallows /internal/* (we'll add the rule alongside
 *    this PR if it isn't covered yet).
 *
 * Implementation:
 *  - This file is a server component that validates the secret. The actual
 *    slide deck is a client component (Deck.js) so we can wire keyboard nav,
 *    slide tracker, and print/export hooks without bloating the server bundle.
 *  - 13 slides authored inline in Deck.js. Anchor IDs + URL hash sync so the
 *    user can deep-link to a specific slide and the print view exports all of
 *    them in order.
 *
 * Launch dates currently anchored in the deck:
 *   soft launch  → 5–7 mayo 2026
 *   public launch → 12–15 mayo 2026
 * If the directors move them, edit the constants at the top of Deck.js.
 */

import Deck from './Deck';
import './deck.css';

export const metadata = {
  title: 'Med Connect — Presentación de Dirección',
  // Belt & braces: tell crawlers explicitly even though the path is also
  // disallowed in robots.txt. The directors can still share the URL freely.
  robots: { index: false, follow: false, nocache: true },
};

// Soft default for local dev so the page is still reachable without a real
// secret in the env. In production we expect BOARD_DECK_SECRET to be set on
// Vercel; if it isn't, we fall back to this string so the deck doesn't go
// dark in the middle of a meeting.
const FALLBACK_SECRET = 'medconnect-board-2026';

function getExpectedSecret() {
  return (process.env.BOARD_DECK_SECRET || FALLBACK_SECRET).trim();
}

export default async function BoardDeckPage({ searchParams }) {
  // Next.js 16: searchParams is a Promise.
  const params = await searchParams;
  const provided = typeof params?.k === 'string' ? params.k.trim() : '';
  const expected = getExpectedSecret();

  if (!provided || provided !== expected) {
    return (
      <main className="board-locked">
        <div className="board-locked-card">
          <h1>Med Connect — Presentación interna</h1>
          <p>Esta página requiere un parámetro de acceso.</p>
          <p className="board-locked-hint">
            Añade <code>?k=…</code> al final de la URL.
          </p>
        </div>
      </main>
    );
  }

  return <Deck />;
}
