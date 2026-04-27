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
 * On mobile (<900px) the left panel collapses to a slim banner so the form
 * stays the focus.
 */
export default function AuthLayout({ mode = 'sign-in', children }) {
  const isUp = mode === 'sign-up';
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
          <Eyebrow dark>Reserva prioritaria · con tu seguro</Eyebrow>
          <p className="brand-auth__quote-body">
            "La app me daba cita a 6 semanas. Pagué <em>9,99&nbsp;€</em> y al día siguiente estaba en consulta — con mi tarjeta y sin pagar nada por la visita."
          </p>
          <div className="brand-auth__quote-meta">
            <strong>Lucía F.</strong> · Valencia · asegurada con Adeslas
          </div>
        </div>

        <div className="brand-auth__trust">
          ★★★★★ &nbsp; 4,8 / 5 en Trustpilot · 214 reseñas verificadas
        </div>
      </aside>

      {/* ── Right: form ──────────────────────────────────────────────── */}
      <div className="brand-auth__right">
        <div className="brand-auth__right-inner">
          <Eyebrow>{isUp ? 'Crear cuenta' : 'Iniciar sesión'}</Eyebrow>
          <h1 className="brand-auth__title">
            {isUp ? (
              <>Empieza a reservar con <em>prioridad</em>.</>
            ) : (
              <>Bienvenido <em>de vuelta</em>.</>
            )}
          </h1>
          <p className="brand-auth__lede">
            {isUp
              ? 'Te llevará menos de un minuto. No te pediremos los datos de tu seguro hasta tu primera reserva.'
              : 'Accede a tu historial de reservas y gestiona tus citas.'}
          </p>
          <div className="brand-auth__widget">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
