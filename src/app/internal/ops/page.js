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
  title: 'Med Connect — Manual de Ops',
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
          <h1>Med Connect — Manual de Ops</h1>
          <p>Esta página requiere un parámetro de acceso.</p>
          <p className="board-locked-hint">
            Añade <code>?k=…</code> al final de la URL.
          </p>
        </div>
      </main>
    );
  }

  // Credentials only ship to clients that present the correct URL secret.
  // Set these env vars in Vercel after running scripts/provision/create-admin-raquel.js.
  const credentials = {
    username: (process.env.OPS_ADMIN_USERNAME || 'raquel').trim(),
    password: (process.env.OPS_ADMIN_PASSWORD || '<pendiente · ver scripts/provision/create-admin-raquel.js>').trim(),
  };

  return <Deck credentials={credentials} />;
}
