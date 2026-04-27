'use client';
import './PageHeader.css';

/**
 * Brand page header — eyebrow + h1 (with optional emphasized italic word) +
 * lede paragraph. Used at the top of marketing pages. The dark variant
 * inverts onto Ink for hero sections.
 */
export default function PageHeader({
  eyebrow,
  title,
  lede,
  dark = false,
  align = 'left',
  children,
  className = '',
}) {
  const cls = [
    'brand-page-header',
    dark ? 'brand-page-header--dark' : '',
    align === 'center' ? 'brand-page-header--center' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <header className={cls}>
      {eyebrow && <div className="brand-page-header__eyebrow">{eyebrow}</div>}
      {title && <h1 className="brand-page-header__title">{title}</h1>}
      {lede && <p className="brand-page-header__lede">{lede}</p>}
      {children && <div className="brand-page-header__after">{children}</div>}
    </header>
  );
}
