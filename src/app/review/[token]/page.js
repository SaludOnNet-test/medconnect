'use client';

import { useEffect, useState, use as usePromise } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './review.css';

/**
 * /review/[token]
 *
 * Public, token-gated review form. Mirrors the architecture of
 * /booking/[token]: the token IS the auth, no login. Brand-aligned
 * (Bone bg, Brass CTA, Ink text) — palette consistent with /sin-seguro
 * and the other patient-facing pages in the 2026 redesign.
 *
 * Two ratings, decoupled by design (per the plan):
 *   1. Med Connect rating — required, 1-5 stars, "how fast did we
 *      get you the appointment?". This is the metric we track and
 *      the gate for the Trustpilot bridge.
 *   2. Clinic rating — optional, 1-5 stars, "how was the service
 *      at the clinic?". Persisted but never shown publicly.
 *
 * On submit with `ratingMedconnect=5`, render an inline Trustpilot
 * CTA in the confirmation state (no follow-up email).
 */
export default function ReviewTokenPage({ params }) {
  const { token } = usePromise(params);

  // phases: loading | loaded | already-submitted | submitting | done | error
  const [state, setState] = useState({ phase: 'loading' });

  // form state
  const [ratingMc, setRatingMc] = useState(0);
  const [hoverMc, setHoverMc] = useState(0);
  const [commentMc, setCommentMc] = useState('');
  const [showClinicSection, setShowClinicSection] = useState(false);
  const [ratingClinic, setRatingClinic] = useState(0);
  const [hoverClinic, setHoverClinic] = useState(0);
  const [commentClinic, setCommentClinic] = useState('');

  // post-submit state
  const [postSubmit, setPostSubmit] = useState({ showCta: false, trustpilotUrl: null, clicked: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reviews/by-token/${token}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ phase: 'error', message: data.error || 'No encontrado' });
          return;
        }
        if (data.alreadySubmitted) {
          setState({ phase: 'already-submitted', booking: data });
          return;
        }
        setState({ phase: 'loaded', booking: data });
      } catch {
        if (!cancelled) setState({ phase: 'error', message: 'Error de red' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (ratingMc < 1) return;
    setState((s) => ({ ...s, phase: 'submitting' }));
    try {
      const res = await fetch(`/api/reviews/by-token/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratingMedconnect: ratingMc,
          ratingClinic: ratingClinic > 0 ? ratingClinic : null,
          commentMedconnect: commentMc.trim() || null,
          commentClinic: commentClinic.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ phase: 'error', message: data.error || 'No se pudo guardar' });
        return;
      }
      setPostSubmit({
        showCta: !!data.showTrustpilotCta,
        trustpilotUrl: data.trustpilotUrl,
        clicked: false,
      });
      setState((s) => ({ ...s, phase: 'done' }));
    } catch {
      setState({ phase: 'error', message: 'Error de red' });
    }
  }

  function handleTrustpilotClick() {
    // Fire-and-forget the click counter, then let the link navigate.
    fetch(`/api/reviews/by-token/${token}/trustpilot-clicked`, { method: 'POST' }).catch(() => {});
    setPostSubmit((s) => ({ ...s, clicked: true }));
  }

  return (
    <>
      <Header />
      <main className="review-page">
        <div className="review-shell">
          {state.phase === 'loading' && <p className="review-status">Cargando…</p>}

          {state.phase === 'error' && (
            <div className="review-error">
              <h1>No encontramos esta solicitud</h1>
              <p>{state.message}. Si el enlace lo recibiste por email y crees que hay un error, escribinos a <a href="mailto:operaciones@medconnect.es">operaciones@medconnect.es</a>.</p>
            </div>
          )}

          {state.phase === 'already-submitted' && (
            <div className="review-thanks">
              <h1>Tu reseña ya está registrada</h1>
              <p>Gracias por habernos dejado tu opinión. Si querés agregar algo más, escribinos a <a href="mailto:operaciones@medconnect.es">operaciones@medconnect.es</a>.</p>
            </div>
          )}

          {(state.phase === 'loaded' || state.phase === 'submitting') && (
            <form className="review-form" onSubmit={handleSubmit}>
              <header className="review-header">
                <h1>¿Cómo te fue en tu cita?</h1>
                <p className="review-sub">
                  Hola {state.booking.patientName?.split(' ')[0] || ''}. Hace 24&nbsp;h estuviste con <strong>{state.booking.providerName}</strong>{state.booking.specialty ? ` — ${state.booking.specialty}` : ''}.
                  Te preguntamos dos cosas <em>separadas</em>: cómo fuimos nosotros consiguiéndote la cita rápido, y cómo fue la atención en la clínica.
                </p>
              </header>

              <fieldset className="review-block review-block-mc">
                <legend>1. Med Connect</legend>
                <p className="review-block-q">¿Qué tan rápido te conseguimos la cita?</p>
                <StarRating
                  value={ratingMc}
                  hover={hoverMc}
                  onChange={setRatingMc}
                  onHover={setHoverMc}
                  disabled={state.phase === 'submitting'}
                />
                <textarea
                  className="review-textarea"
                  placeholder="¿Algún comentario sobre nuestra gestión? (opcional)"
                  rows={3}
                  maxLength={2000}
                  value={commentMc}
                  onChange={(e) => setCommentMc(e.target.value)}
                  disabled={state.phase === 'submitting'}
                />
              </fieldset>

              {!showClinicSection ? (
                <button
                  type="button"
                  className="review-toggle"
                  onClick={() => setShowClinicSection(true)}
                >
                  + ¿También querés calificar la atención de la clínica? <span className="review-toggle-hint">(opcional)</span>
                </button>
              ) : (
                <fieldset className="review-block review-block-clinic">
                  <legend>2. Clínica / médico</legend>
                  <p className="review-block-q">¿Cómo fue la atención en {state.booking.providerName}?</p>
                  <StarRating
                    value={ratingClinic}
                    hover={hoverClinic}
                    onChange={setRatingClinic}
                    onHover={setHoverClinic}
                    disabled={state.phase === 'submitting'}
                  />
                  <textarea
                    className="review-textarea"
                    placeholder="¿Algo que te gustaría destacar de la atención? (opcional)"
                    rows={3}
                    maxLength={2000}
                    value={commentClinic}
                    onChange={(e) => setCommentClinic(e.target.value)}
                    disabled={state.phase === 'submitting'}
                  />
                  <p className="review-block-help">Esta calificación es interna — la usamos para mejorar la red de clínicas. No se publica.</p>
                </fieldset>
              )}

              <button
                type="submit"
                className="review-submit"
                disabled={ratingMc < 1 || state.phase === 'submitting'}
              >
                {state.phase === 'submitting' ? 'Enviando…' : 'Enviar mi opinión'}
              </button>
              <p className="review-block-help review-block-help-bottom">
                Solo el rating de Med Connect es obligatorio. El resto es opcional.
              </p>
            </form>
          )}

          {state.phase === 'done' && (
            <div className="review-thanks">
              <h1>¡Gracias por tu opinión!</h1>
              {postSubmit.showCta ? (
                <>
                  <p>
                    Diste <strong>5 estrellas</strong> a Med Connect — eso significa muchísimo para nosotros.
                    Si te tomás 1&nbsp;minuto más, ¿podrías replicar tu opinión en Trustpilot?
                  </p>
                  <p className="review-trustpilot-note">
                    Allí solo nos preguntan por <strong>Med Connect</strong> (la rapidez de conseguirte la cita) — la calificación que diste a la clínica se queda solo entre nosotros, no la mostramos públicamente.
                  </p>
                  <a
                    className="review-trustpilot-cta"
                    href={postSubmit.trustpilotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleTrustpilotClick}
                  >
                    Compartir en Trustpilot →
                  </a>
                  {postSubmit.clicked && (
                    <p className="review-trustpilot-thanks">¡Gracias! Te abrimos Trustpilot en una pestaña nueva.</p>
                  )}
                </>
              ) : (
                <p>Tu reseña queda registrada. Si tenés algo más para contarnos, escribinos a <a href="mailto:operaciones@medconnect.es">operaciones@medconnect.es</a>.</p>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

/**
 * 5-star control with hover + keyboard support. Inline component
 * because it's used in two places on the same form and isn't
 * generic enough yet to extract.
 */
function StarRating({ value, hover, onChange, onHover, disabled }) {
  const display = hover || value;
  return (
    <div
      className="review-stars"
      role="radiogroup"
      onMouseLeave={() => onHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
          className={`review-star ${display >= n ? 'is-on' : ''}`}
          onMouseEnter={() => onHover(n)}
          onClick={() => onChange(n)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(n); }
            if (e.key === 'ArrowRight' && n < 5) onChange(n + 1);
            if (e.key === 'ArrowLeft' && n > 1) onChange(n - 1);
          }}
          disabled={disabled}
        >
          ★
        </button>
      ))}
      <span className="review-stars-label">
        {value > 0 ? `${value} / 5` : 'Sin calificar'}
      </span>
    </div>
  );
}
