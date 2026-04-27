'use client';
import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import './Accordion.css';

/**
 * Brand accordion. Items shape: [{ q: string, a: ReactNode }, ...]
 * Single-open behavior; pass `defaultOpen={i}` to start with one expanded.
 */
export default function Accordion({ items = [], defaultOpen = -1 }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="brand-accordion">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`brand-accordion__item${isOpen ? ' brand-accordion__item--open' : ''}`}>
            <button
              type="button"
              className="brand-accordion__trigger"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              <span>{it.q}</span>
              <Icon name={isOpen ? 'minus' : 'plus'} size={22} />
            </button>
            {isOpen && (
              <div className="brand-accordion__panel">{it.a}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
