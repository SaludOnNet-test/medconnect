'use client';

/**
 * DeckShell — keyboard nav, hash sync, TOC, print mode for any /internal/*
 * deck. The board deck doesn't use this yet (it predates the shared shell);
 * the ops and cea-bermudez decks do.
 *
 * Pass a SLIDES array and (optionally) brand text. Each slide is
 * `{ id, label, chapter, render() }`. Render returns the inner JSX of the
 * slide; the shell wraps it in `<section className="slide">` and handles
 * everything else (arrow keys, P-toggle for print, deep-link hash, etc).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

function getInitialPrintMode() {
  if (typeof window === 'undefined') return false;
  const sp = new URLSearchParams(window.location.search);
  return sp.get('print') === '1';
}

export default function DeckShell({ slides, brand }) {
  const total = slides.length;
  const [index, setIndex] = useState(0);
  const [printMode, setPrintMode] = useState(getInitialPrintMode);

  const goTo = useCallback((i) => {
    const next = Math.max(0, Math.min(total - 1, i));
    setIndex(next);
    if (typeof window !== 'undefined') {
      const slide = slides[next];
      if (slide?.id) window.history.replaceState(null, '', `#${slide.id}`);
    }
  }, [total, slides]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) return;
      const found = slides.findIndex((s) => s.id === hash);
      if (found >= 0) setIndex(found);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [slides]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(total - 1);
      } else if (e.key === 'p' || e.key === 'P') {
        setPrintMode((m) => !m);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, total, goTo]);

  const current = slides[index];
  const chapters = useMemo(() => {
    const out = [];
    slides.forEach((s, i) => {
      const last = out[out.length - 1];
      if (!last || last.chapter !== s.chapter) {
        out.push({ chapter: s.chapter, slides: [{ ...s, idx: i }] });
      } else {
        last.slides.push({ ...s, idx: i });
      }
    });
    return out;
  }, [slides]);

  return (
    <div className={`deck ${printMode ? 'deck-print' : ''}`}>
      <aside className="deck-toc" aria-label="Índice">
        <div className="deck-brand">
          <span className="deck-brand-mark">{brand?.mark || 'MC'}</span>
          <span className="deck-brand-text">
            <strong>{brand?.title || 'Med Connect'}</strong>
            <em>{brand?.subtitle || ''}</em>
          </span>
        </div>
        <nav>
          {chapters.map((c) => (
            <div key={c.chapter} className="deck-toc-chapter">
              <div className="deck-toc-chapter-label">{c.chapter}</div>
              <ul>
                {c.slides.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goTo(s.idx)}
                      className={`deck-toc-link ${s.idx === index ? 'is-current' : ''}`}
                    >
                      <span className="deck-toc-num">{s.idx + 1}</span>
                      <span className="deck-toc-label">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="deck-toc-tip">
          <strong>Atajos:</strong> ← → cambiar · <kbd>P</kbd> ver todas (imprimir / exportar PDF) · <kbd>Home</kbd>/<kbd>End</kbd> ir al inicio/final.
        </div>
      </aside>

      <main className="deck-main">
        {printMode ? (
          <div className="deck-all">
            {slides.map((s) => (
              <section key={s.id} id={s.id} className="slide" data-chapter={s.chapter}>
                {s.render()}
              </section>
            ))}
          </div>
        ) : (
          <>
            <section
              key={current.id}
              id={current.id}
              className="slide"
              data-chapter={current.chapter}
            >
              {current.render()}
            </section>
            <nav className="deck-controls" aria-label="Navegación">
              <button
                type="button"
                className="deck-btn"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
              >
                ← Anterior
              </button>
              <span className="deck-progress">
                <span className="deck-progress-current">{String(index + 1).padStart(2, '0')}</span>
                <span className="deck-progress-sep">/</span>
                <span className="deck-progress-total">{String(total).padStart(2, '0')}</span>
                <span className="deck-progress-label">{current.label}</span>
              </span>
              <button
                type="button"
                className="deck-btn"
                onClick={() => goTo(index + 1)}
                disabled={index === total - 1}
              >
                Siguiente →
              </button>
            </nav>
          </>
        )}
      </main>
    </div>
  );
}
