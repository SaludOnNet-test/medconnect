'use client';
import './Card.css';

/**
 * Brand surface card. The `surface` prop maps to the bone/ink layer scale:
 *   - "200" — page surface (rare for cards; mostly the background)
 *   - "100" — default card on a 200 page (most common)
 *   - "50"  — elevated/nested card (card-on-card)
 *   - "ink" — dark surface
 *   - "ink-900" — elevated dark surface
 */
export default function Card({
  surface = '100',
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}) {
  const cls = `brand-card brand-card--${surface}${className ? ` ${className}` : ''}`;
  return <Tag className={cls} {...rest}>{children}</Tag>;
}
