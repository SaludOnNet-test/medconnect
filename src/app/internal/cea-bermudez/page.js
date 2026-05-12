/**
 * /internal/cea-bermudez — Handbook for Centro Médico Cea Bermúdez.
 *
 * Dual audience: Arita (general manager) reads the manager overview
 * section; her receptionist reads the operational section. Same access
 * model as /internal/board.
 *
 * Login credentials are env-injected after the URL secret has been
 * validated, so they never ship to a client that hasn't presented the key.
 */

import Deck from './Deck';
import '../board/deck.css';

export const metadata = {
  title: 'Med Connect — Manual Cea Bermúdez',
  robots: { index: false, follow: false, nocache: true },
};

const FALLBACK_SECRET = 'medconnect-cea-2026';

function getExpectedSecret() {
  return (process.env.CEA_BERMUDEZ_HANDBOOK_SECRET || FALLBACK_SECRET).trim();
}

export default async function CeaBermudezHandbookPage({ searchParams }) {
  const params = await searchParams;
  const provided = typeof params?.k === 'string' ? params.k.trim() : '';
  const expected = getExpectedSecret();

  if (!provided || provided !== expected) {
    return (
      <main className="board-locked">
        <div className="board-locked-card">
          <h1>Med Connect — Manual Cea Bermúdez</h1>
          <p>Esta página requiere un parámetro de acceso.</p>
          <p className="board-locked-hint">
            Añade <code>?k=…</code> al final de la URL.
          </p>
        </div>
      </main>
    );
  }

  // Set these env vars in Vercel after running scripts/provision/create-clerk-arita.js
  // and scripts/provision/attach-to-cea-bermudez.js.
  const credentials = {
    email: (process.env.CEA_PROF_EMAIL || '<pendiente · email de Arita>').trim(),
    password: (process.env.CEA_PROF_PASSWORD || '<pendiente · ver scripts/provision/create-clerk-arita.js>').trim(),
    testEmail: (process.env.CEA_TEST_EMAIL || '<pendiente · email de Francisco>').trim(),
  };

  return <Deck credentials={credentials} />;
}
