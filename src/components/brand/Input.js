'use client';
import { useId } from 'react';
import Eyebrow from './Eyebrow';
import './Input.css';

/**
 * Brand input. Label rendered as Eyebrow above the field. The field has a
 * Bone 50 background and a thin border that highlights to brass on focus.
 *
 * Pass `as="textarea"` for multi-line. Pass `iconLeft` for a left-side
 * Lucide icon (the kit puts a stethoscope/map-pin in the search bar).
 */
export default function Input({
  label,
  id,
  iconLeft = null,
  as = 'input',
  className = '',
  ...rest
}) {
  const autoId = useId();
  const fieldId = id || `brand-input-${autoId}`;
  const Tag = as === 'textarea' ? 'textarea' : 'input';

  return (
    <div className={`brand-input${className ? ` ${className}` : ''}`}>
      {label && (
        <Eyebrow as="label" htmlFor={fieldId} className="brand-input__label">
          {label}
        </Eyebrow>
      )}
      <div className={`brand-input__field${iconLeft ? ' brand-input__field--has-icon' : ''}`}>
        {iconLeft && <span className="brand-input__icon" aria-hidden="true">{iconLeft}</span>}
        <Tag id={fieldId} className="brand-input__control" {...rest} />
      </div>
    </div>
  );
}
