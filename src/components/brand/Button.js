'use client';
import Link from 'next/link';
import './Button.css';

/**
 * Brand button — the only Brass-coloured element on most viewports.
 *
 * variants:
 *   primary    — Brass background, Ink text. The single accent CTA.
 *   secondary  — Ink background, Bone text. Use as the dark counterpart.
 *   ghost      — transparent + border. For low-emphasis actions on Bone.
 *   ghostInv   — transparent + border, on Ink. For dark sections.
 *
 * sizes: sm | md | lg
 *
 * Pass `href` to render as a <Link>; otherwise renders <button>.
 *
 * The `data-brass-element` attribute on `variant="primary"` is read by the
 * brand-lint test that asserts at most one Brass element per viewport.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  icon = null,
  iconRight = null,
  href = null,
  full = false,
  children,
  className = '',
  type,
  ...rest
}) {
  const cls = [
    'brand-btn',
    `brand-btn--${variant}`,
    `brand-btn--${size}`,
    full ? 'brand-btn--full' : '',
    className,
  ].filter(Boolean).join(' ');

  const dataBrass = variant === 'primary' ? { 'data-brass-element': '' } : {};

  const inner = (
    <>
      {icon && <span className="brand-btn__icon brand-btn__icon--left" aria-hidden="true">{icon}</span>}
      <span className="brand-btn__label">{children}</span>
      {iconRight && <span className="brand-btn__icon brand-btn__icon--right" aria-hidden="true">{iconRight}</span>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls} {...dataBrass} {...rest}>
        {inner}
      </Link>
    );
  }

  return (
    <button type={type || 'button'} className={cls} {...dataBrass} {...rest}>
      {inner}
    </button>
  );
}
