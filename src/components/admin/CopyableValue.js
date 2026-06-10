'use client';

import { useState } from 'react';
import './CopyableValue.css';

/**
 * CopyableValue — wraps a value in the ops UI so clicking copies it to
 * the clipboard. Eliminates the dead-click pattern Clarity recorded on
 * /admin/ops/[id] (Raquel selected the clinic name and the click had
 * no effect) and adds real utility — every value Raquel copies to
 * Zendesk tickets, emails to clinics, refund spreadsheets, etc. is
 * now a single click.
 *
 * If the user is actively selecting text (multi-character selection),
 * the click is treated as part of the selection and copy is suppressed.
 * Empty / placeholder ("—", "") values are non-interactive so we don't
 * promise "copy something" when there's nothing to copy.
 *
 * Props:
 *   children: rendered content (the visible label, may contain markup)
 *   copy:     explicit string to copy. Defaults to children when string-like.
 *   as:       wrapper element. Default 'span' so it sits inside a <dd>
 *             without breaking the grid. Use 'span' or 'div' inline.
 *   className/style: forwarded onto the wrapper.
 */
export default function CopyableValue({
  children,
  copy,
  as: Tag = 'span',
  className = '',
  style,
  title,
}) {
  const [copied, setCopied] = useState(false);

  // Best-effort text resolution. `copy` wins; otherwise stringify children
  // if it's primitive. JSX with markup (children = <span>...) requires the
  // caller to pass an explicit `copy`.
  const text = copy != null
    ? String(copy)
    : (typeof children === 'string' || typeof children === 'number')
      ? String(children)
      : '';
  const isEmpty = !text || text === '—' || text.trim() === '';

  const handleClick = async () => {
    if (isEmpty) return;
    // If user is selecting text, let them keep selecting — don't hijack.
    const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
    if (sel && sel.toString().length > 1) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback for older browsers / non-HTTPS contexts.
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      } catch {
        // Silent — no toast, but we don't break the UI either.
      }
    }
  };

  const cls = [
    'copyable',
    copied ? 'copyable--copied' : '',
    isEmpty ? 'copyable--empty' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tag
      className={cls}
      onClick={isEmpty ? undefined : handleClick}
      title={isEmpty ? undefined : (title || 'Clic para copiar')}
      style={style}
    >
      {children}
      {copied && <span className="copyable-toast" aria-hidden="true">Copiado</span>}
    </Tag>
  );
}
