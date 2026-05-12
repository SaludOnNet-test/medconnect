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

  // Credentials only ship to clients that present the correct URL secret.
  // Defaults are the placeholder username/password the product team picked
  // for the first soft-launch user; env vars on Vercel override when real
  // credentials are provisioned via scripts/provision/create-admin-raquel.js.
  //
  // Guard against the env var holding leftover placeholder text from earlier
  // setup (e.g. "<from step 3, script output>") by falling back to the
  // hardcoded values when the env var contains an "<…>" marker.
  const envUser = (process.env.OPS_ADMIN_USERNAME || '').trim();
  const envPass = (process.env.OPS_ADMIN_PASSWORD || '').trim();
  const looksLikePlaceholder = (s) => s === '' || s.startsWith('<');
  const credentials = {
    username: looksLikePlaceholder(envUser) ? 'mc_bfd923' : envUser,
    password: looksLikePlaceholder(envPass) ? 'WvsVB0GbBR0FBmwQ6MOt' : envPass,
  };

  return <Deck credentials={credentials} />;
}
