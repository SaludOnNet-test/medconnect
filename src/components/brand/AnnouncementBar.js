'use client';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import './AnnouncementBar.css';

/**
 * Slim sticky bar above the Nav. Two slots: a left link (e.g. "Derivar un
 * paciente →") and a right link (e.g. tap-to-call number). Backed by Ink
 * 900 with Bone text, single Brass icon accent.
 */
export default function AnnouncementBar({
  leftHref = '/derivadores',
  leftLabel = 'Derivar un paciente',
  phoneHref = 'tel:+34912172193',
  phoneNumber = '91 217 21 93',
  phonePrefix = '¿Tu seguro no te da cita?',
  phoneCta = 'Llámanos',
}) {
  return (
    <div className="brand-announce">
      <div className="brand-announce__inner">
        <Link href={leftHref} className="brand-announce__link">
          {leftLabel}
          <Icon name="arrow-right" size={14} />
        </Link>
        <a href={phoneHref} className="brand-announce__phone">
          <Icon name="phone" size={14} className="brand-announce__phone-icon" />
          <span className="brand-announce__phone-text">
            {phonePrefix} <strong>{phoneCta} {phoneNumber}</strong>
          </span>
        </a>
      </div>
    </div>
  );
}
