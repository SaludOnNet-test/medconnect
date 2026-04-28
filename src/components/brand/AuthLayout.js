'use client';
import Link from 'next/link';
import Image from 'next/image';
import Eyebrow from './Eyebrow';
import './AuthLayout.css';

/**
 * Split-screen auth shell. Ink panel on the left with the brand quote +
 * Trustpilot signal. Right panel is the slot where the Clerk <SignIn /> /
 * <SignUp /> widget mounts, wrapped by an Eyebrow + h1 + lede.
 *
 * Audience-aware as of 2026-04-28: the patient auth pages keep the
 * Lucía testimonial + "tu seguro cubre la consulta" copy, while the new
 * /pro/sign-in and /pro/sign-up pages pass `audience='pro'` to swap to
 * a Dr. Javier M. testimonial + clinic/derivador-centric copy. A small
 * crossover link below the widget points patients to /pro/sign-up and
 * pros to /sign-up so a wrong-URL landing has a one-click correction.
 *
 * On mobile (<900px) the left panel collapses to a slim banner so the
 * form stays the focus.
 */
export default function AuthLayout({ mode = 'sign-in', audience = 'patient', children }) {
  const isUp = mode === 'sign-up';
  const isPro = audience === 'pro';

  const leftEyebrow = isPro
    ? 'Para clínicas y profesionales'
    : 'Reserva prioritaria · con tu seguro';

  const leftQuote = isPro
    ? '"Uso Med Connect para derivar pacientes que no consiguen cita prioritaria con sus aseguradoras. La cita queda gestionada con la clínica concertada en minutos."'
    : '"La app me daba cita a 6 semanas. Pagué 9,99 € y entré en consulta tres semanas después — con mi tarjeta y sin pagar nada por la visita."';

  const leftMeta = isPro
    ? <><strong>Dr. Javier M.</strong> · Cardiólogo · Barcelona</>
    : <><strong>Lucía F.</strong> · Valencia · asegurada con Adeslas</>;

  const leftTrust = isPro
    ? 'Liquidación mensual · Comisión por cada derivación confirmada'
    : '★★★★★  4,8 / 5 en Trustpilot · 214 reseñas verificadas';

  const rightEyebrow = isUp ? 'Crear cuenta' : 'Iniciar sesión';

  const rightTitle = isPro
    ? (isUp
        ? <>Empieza a derivar y a <em>vender huecos</em>.</>
        : <>Bienvenido <em>de vuelta, doctor</em>.</>)
    : (isUp
        ? <>Empieza a reservar con <em>prioridad</em>.</>
        : <>Bienvenido <em>de vuelta</em>.</>);

  const rightLede = isPro
    ? (isUp
        ? 'Crea tu cuenta de profesional. Vinculas tu clínica luego, en menos de dos minutos.'
        : 'Accede a tu panel para gestionar derivaciones, lock-ins y comisiones.')
    : (isUp
        ? 'Te llevará menos de un minuto. No te pediremos los datos de tu seguro hasta tu primera reserva.'
        : 'Accede a tu historial de reservas y gestiona tus citas.');

  const crossoverHref = isPro ? '/sign-up' : '/pro/sign-up';
  const crossoverCopy = isPro
    ? '¿Eres un paciente? Crea tu cuenta personal'
    : '¿Eres una clínica o profesional? Crear cuenta de pro';

  return (
    <section className="brand-auth">
      {/* ── Left: Ink panel ──────────────────────────────────────────── */}
      <aside className="brand-auth__left">
        <div className="brand-auth__noise" aria-hidden="true" />

        <Link href="/" className="brand-auth__logo" aria-label="Med Connect — Inicio">
          <Image
            src="/brand/logo-medconnect-light.svg"
            alt="Med Connect"
            width={170}
            height={26}
          />
        </Link>

        <div className="brand-auth__quote">
          <Eyebrow dark>{leftEyebrow}</Eyebrow>
          <p className="brand-auth__quote-body">{leftQuote}</p>
          <div className="brand-auth__quote-meta">{leftMeta}</div>
        </div>

        <div className="brand-auth__trust">{leftTrust}</div>
      </aside>

      {/* ── Right: form ──────────────────────────────────────────────── */}
      <div className="brand-auth__right">
        <div className="brand-auth__right-inner">
          {/* Audience toggle — surfaced as a tab pair at the very top so a
              user who landed on the wrong flow can switch in one click
              without having to scroll past the Clerk widget. The selected
              tab matches the current page's audience prop; the other tab
              navigates to the counterpart flow. */}
          <div className="brand-auth__audience" role="tablist" aria-label="¿Eres paciente o profesional?">
            <Link
              href={isUp ? '/sign-up' : '/sign-in'}
              role="tab"
              aria-selected={!isPro}
              className={`brand-auth__audience-tab${!isPro ? ' brand-auth__audience-tab--active' : ''}`}
            >
              Soy paciente
            </Link>
            <Link
              href={isUp ? '/pro/sign-up' : '/pro/sign-in'}
              role="tab"
              aria-selected={isPro}
              className={`brand-auth__audience-tab${isPro ? ' brand-auth__audience-tab--active' : ''}`}
            >
              Soy clínica / profesional
            </Link>
          </div>
          <Eyebrow>{rightEyebrow}</Eyebrow>
          <h1 className="brand-auth__title">{rightTitle}</h1>
          <p className="brand-auth__lede">{rightLede}</p>
          <div className="brand-auth__widget">
            {children}
          </div>
          <p className="brand-auth__crossover">
            <Link href={crossoverHref}>{crossoverCopy}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
