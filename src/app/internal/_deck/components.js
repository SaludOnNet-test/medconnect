'use client';

/**
 * Shared slide helpers for /internal/* decks (board, ops, cea-bermudez).
 *
 * Each deck is a separate route with its own SLIDES array and audience,
 * but the visual primitives (cards, headers, swimlanes, etc.) and the
 * `../board/deck.css` stylesheet are the same so all three feel like
 * the same product when shared with stakeholders.
 *
 * If you find yourself adding deck-specific markup here, push it back
 * into the deck instead — this file is for primitives that are useful
 * to ≥ 2 decks. Anything that only one deck uses should live next to
 * that deck's SLIDES.
 */

import Link from 'next/link';
import Icon from '@/components/icons/Icon';

export function SlideHeader({ eyebrow, title, lede }) {
  return (
    <header className="slide-header">
      <div className="slide-eyebrow">{eyebrow}</div>
      <h2 className="slide-title">{title}</h2>
      {lede && <p className="slide-lede">{lede}</p>}
    </header>
  );
}

export function Card({ label, tone, children }) {
  return (
    <div className={`board-card ${tone ? `board-card-${tone}` : ''}`}>
      {label && <div className="board-card-label">{label}</div>}
      <div className="board-card-body">{children}</div>
    </div>
  );
}

export function MiniCard({ title, children }) {
  return (
    <div className="mini-card">
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}

export function Note({ children }) {
  return (
    <aside className="slide-note">
      <span className="slide-note-label">Notas</span>
      <p>{children}</p>
    </aside>
  );
}

export function Stage({ number, actor, title, body, links = [] }) {
  return (
    <div className="stage">
      <div className="stage-num">{number}</div>
      <div className="stage-actor">{actor}</div>
      <div className="stage-title">{title}</div>
      <p className="stage-body">{body}</p>
      <div className="stage-links">
        {links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
            {l.label} <Icon name="arrow-up-right" size={12} />
          </a>
        ))}
      </div>
    </div>
  );
}

export function Arrow() {
  return <div className="stage-arrow" aria-hidden="true">→</div>;
}

export function FlowSteps({ steps }) {
  return (
    <ol className="flow-steps">
      {steps.map((s, i) => (
        <li key={s.label}>
          <span className="flow-step-num">{i + 1}</span>
          <span className="flow-step-label">
            {s.href ? (
              <a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
            ) : (
              s.label
            )}
            {s.hint && <span className="flow-step-hint"> · {s.hint}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function SwimlaneRow({ scenario, steps }) {
  return (
    <div className="swimlane-row">
      <div className="swimlane-scenario">{scenario}</div>
      <div className="swimlane-steps">
        {steps.map((s, i) => (
          <div key={i} className={`swimlane-cell area-${s.area.toLowerCase()}`}>
            <span className="swimlane-area">{s.area}</span>
            <span className="swimlane-text">{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToolCard({ role, url, purpose }) {
  return (
    <a className="tool-card" href={url} target="_blank" rel="noopener noreferrer">
      <span className="tool-role">{role}</span>
      <span className="tool-url">{url.replace(/^https?:\/\//, '')}</span>
      <span className="tool-purpose">{purpose}</span>
    </a>
  );
}

export { Link };
