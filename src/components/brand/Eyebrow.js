'use client';
import './Eyebrow.css';

/**
 * Tiny tracked-out caps. The only place we use uppercase in the new brand
 * system. `dark` flips colour for use over Ink surfaces.
 */
export default function Eyebrow({ children, dark = false, as: Tag = 'span', className = '', ...rest }) {
  const cls = `brand-eyebrow${dark ? ' brand-eyebrow--dark' : ''}${className ? ` ${className}` : ''}`;
  return <Tag className={cls} {...rest}>{children}</Tag>;
}
