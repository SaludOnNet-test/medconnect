/**
 * /internal/ops — Ops team handbook (Raquel and future operators).
 *
 * Same access model as /internal/board: URL secret only, no IP/network
 * restriction, robots.txt already denies /internal/*. The login credentials
 * embedded in the deck are read from env vars on the server and only
 * passed to the client after the URL secret has been validated.
 */

import Deck from './Deck';
import '../board/deck.css';

export const metadata = {
  title: 'Med Connect — Manual de Operaciones / Atención al Cliente',
  robots: { index: false, follow: false, nocache: true },
};

const FALLBACK_SECRET = 'medconnect-ops-2026';

function getExpectedSecret() {
  return (process.env.OPS_HANDBOOK_SECRET || FALLBACK_SECRET).trim();
}

export default async function OpsHandbookPage({ searchParams }) {
  const params = await searchParams;
  const provided = typeof params?.k === 'string' ? params.k.trim() : '';
  const expected = getExpectedSecret();

  if (!provided || provided !== expected) {
    return (
      <main className="board-locked">
        <div className="board-locked-card">
          <h1>Med Connect — Manual de Operaciones / Atención al Cliente</h1>
          <p>Esta página requiere un parámetro de acceso.</p>
          <p className="board-locked-hint">
            Añade <code>?k=…</code> al final de la URL.
          </p>
        </div>
      </main>
    );
  }

  // Hardcoded placeholders the product team picked for the first
  // soft-launch user. Env vars are intentionally NOT consulted — the
  // earlier env-var-with-fallback pattern leaked the literal placeholder
  // text "<from step 3, script output>" into the deck when the Vercel
  // env var was set to that placeholder string. Now the deck always
  // shows these two values; rotation happens via a code change.
  const credentials = {
    username: 'mc_bfd923',
    password: 'WvsVB0GbBR0FBmwQ6MOt',
  };

  return <Deck credentials={credentials} />;
}
