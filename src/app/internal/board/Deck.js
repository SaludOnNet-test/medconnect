'use client';

/**
 * Deck — 13-slide board presentation deck for Med Connect.
 *
 * Why client-side: keyboard nav (← → Home End), slide indicator, hash sync,
 * fullscreen toggle, and the print-friendly "show all slides" mode all need
 * client APIs. The slides themselves are static markup so the bundle stays
 * small.
 *
 * Slide architecture: each slide is a `<section className="slide">`. The
 * deck CSS handles sizing (16:9, fits the projector), brand chrome, and a
 * print-mode override that flattens all slides onto separate pages.
 *
 * Author this top-down: cover → context → flows → status → asks → tools →
 * roadmap. Every slide aims for ≤ 3 bullets, 1 visual, 1 link, with deeper
 * notes available via the "Notas" disclosure (off by default).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';

// ── Anchors at the top so launch dates / director names move in one place ──
const LAUNCH = {
  soft: '5–7 mayo 2026',
  public: '12–15 mayo 2026',
};
const DIRECTORS = {
  // Replace these placeholders with real names + roles before the meeting.
  comercial: { name: '[Director Comercial]', role: 'Dirección Comercial' },
  operaciones: { name: '[Director Operaciones]', role: 'Dirección de Operaciones' },
};

const PROD_BASE = 'https://www.medconnect.es';

// ── Slide registry: one entry per slide. The render function returns the
// inner JSX (the wrapper `<section>` is added by the deck shell). ──
const SLIDES = [
  /* 1 ─────────────────────────────────────────────────────────────── */
  {
    id: 'cover',
    label: 'Portada',
    chapter: 'Apertura',
    render: () => (
      <div className="slide-cover">
        <div className="slide-cover-eyebrow">Med Connect · Reunión de Dirección</div>
        <h1 className="slide-cover-title">
          Estado del MVP y propuesta de <em>fecha de lanzamiento</em>.
        </h1>
        <p className="slide-cover-lede">
          Producto, flujos por área, lo que está vivo, lo que falta y qué necesitamos de cada dirección para salir a producción.
        </p>
        <div className="slide-cover-meta">
          <div>
            <span className="slide-cover-meta-key">Fecha</span>
            <span className="slide-cover-meta-val">30 abril 2026</span>
          </div>
          <div>
            <span className="slide-cover-meta-key">Propuesta</span>
            <span className="slide-cover-meta-val">Soft launch {LAUNCH.soft} · Público {LAUNCH.public}</span>
          </div>
          <div>
            <span className="slide-cover-meta-key">Producto</span>
            <span className="slide-cover-meta-val">{PROD_BASE.replace('https://', '')}</span>
          </div>
        </div>
      </div>
    ),
  },

  /* 2 ─────────────────────────────────────────────────────────────── */
  {
    id: 'why',
    label: 'Por qué este MVP',
    chapter: 'Contexto',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 2 · Contexto"
          title="Por qué construimos este MVP"
          lede="Validamos dos hipótesis con dinero real y conversaciones reales con clínicas. El MVP existe para responder estas dos preguntas, no para escalar todavía."
        />
        <div className="grid-2">
          <Card label="Hipótesis 1 · Demanda">
            <h3>El paciente paga por <em>prioridad</em> cuando su seguro le da fecha tarde.</h3>
            <p>
              Test: tarifa de prioridad desde <strong>4,99 €</strong> sobre clínicas concertadas con su aseguradora. Cuadros médicos saturados → conversion en checkout.
            </p>
            <ul>
              <li>Métrica clave: <strong>bookings/semana</strong> y <strong>conv. search → book</strong>.</li>
              <li>NPS post-cita ≥ 40 = señal de pago repetido.</li>
            </ul>
          </Card>
          <Card label="Hipótesis 2 · Oferta">
            <h3>Las clínicas <em>abren huecos prioritarios</em> a cambio de comisión.</h3>
            <p>
              Test: ops llama a la clínica con paciente identificado y comisión transparente. La clínica acepta o propone alternativa.
            </p>
            <ul>
              <li>Métrica clave: <strong>% aceptación clínica</strong> al ser llamada por ops.</li>
              <li>Tiempo medio paciente → cita confirmada &lt; 4 h en horario.</li>
            </ul>
          </Card>
        </div>
        <Note>
          La decisión post-MVP (escalar, pivotar, frenar) depende de estos cuatro números. Si los dos llegan al umbral, abrimos integraciones de seguros (F5) y +ciudades (F6). Si solo llega el de demanda, el cuello es la concertación.
        </Note>
      </>
    ),
  },

  /* 3 ─────────────────────────────────────────────────────────────── */
  {
    id: 'diagram',
    label: 'Producto en un diagrama',
    chapter: 'Producto',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 3 · Producto en un diagrama"
          title="Cómo se conectan paciente, ops y clínica"
          lede="Una sola pasarela: el paciente paga la prioridad, ops gestiona la concertación, la clínica recibe al paciente bajo su póliza."
        />
        <div className="diagram-flow">
          <Stage
            number="1"
            actor="Paciente"
            title="Busca y reserva"
            links={[
              { href: `${PROD_BASE}/search-v2`, label: 'Buscador en vivo' },
              { href: `${PROD_BASE}/especialistas/cardiologia/madrid`, label: 'Landing especialidad+ciudad' },
            ]}
            body="Elige especialidad + ciudad, ve clínicas concertadas con su seguro, paga la tarifa de prioridad."
          />
          <Arrow />
          <Stage
            number="2"
            actor="Ops"
            title="Concierta la cita"
            links={[
              { href: `${PROD_BASE}/admin/ops`, label: 'Panel de ops' },
            ]}
            body="Recibe el caso, llama a la clínica, confirma huecos prioritarios o propone alternativa."
          />
          <Arrow />
          <Stage
            number="3"
            actor="Clínica"
            title="Atiende al paciente"
            links={[
              { href: `${PROD_BASE}/pro/dashboard`, label: 'Panel profesional' },
            ]}
            body="Acepta el caso bajo concierto, ve al paciente con su póliza, factura su comisión a Med Connect."
          />
        </div>
        <Note>
          La parte que paga el paciente es <strong>solo la tarifa de prioridad</strong> (4,99 € → 24,99 € según tier). La consulta sigue cubierta por su seguro. En sin-seguro el paciente paga la cita completa y recibe un voucher.
        </Note>
      </>
    ),
  },

  /* 4 ─────────────────────────────────────────────────────────────── */
  {
    id: 'patient-insured',
    label: 'Paciente · Asegurado',
    chapter: 'Flujos',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 4 · Flujo paciente con seguro"
          title="Llega con cuadro médico saturado, sale con cita prioritaria"
          lede="Cinco pantallas, cinco minutos. El seguro paga la consulta; pagan a Med Connect la prioridad."
        />
        <FlowSteps
          steps={[
            { label: 'Home', href: `${PROD_BASE}/` },
            { label: 'Buscador', href: `${PROD_BASE}/search-v2` },
            { label: 'Landing SEO', href: `${PROD_BASE}/especialistas/dermatologia/barcelona`, hint: '88 páginas' },
            { label: 'Reserva', href: `${PROD_BASE}/book` },
            { label: 'Email + autoservicio', href: null, hint: '/booking/[token]' },
          ]}
        />
        <div className="grid-3 grid-3-tight">
          <MiniCard title="Buscador real">
            Especialidad × ciudad + filtros por aseguradora. Lee de la base real (no mock).
          </MiniCard>
          <MiniCard title="88 landings SEO">
            8 especialidades × 11 ciudades, prerendered, con clínicas reales y mapa Leaflet.
          </MiniCard>
          <MiniCard title="Autoservicio post-cita">
            <strong>/booking/[token]</strong>: cancelar (refund Stripe automático) o pedir cambio.
          </MiniCard>
        </div>
        <Note>
          Bug crítico cerrado en abril: Stripe rechazaba todos los checkouts por un campo email mal mapeado. PR #7. End-to-end smoke verificado en producción.
        </Note>
      </>
    ),
  },

  /* 5 ─────────────────────────────────────────────────────────────── */
  {
    id: 'patient-uninsured',
    label: 'Paciente · Sin seguro',
    chapter: 'Flujos',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 5 · Flujo paciente sin seguro"
          title="Sin póliza: voucher con todo incluido"
          lede="El paciente paga la cita completa. Ops sube la confirmación de la clínica como PDF; el voucher llega al email."
        />
        <FlowSteps
          steps={[
            { label: 'Landing', href: `${PROD_BASE}/sin-seguro` },
            { label: 'Reserva tier', href: `${PROD_BASE}/book` },
            { label: 'Pago Stripe', href: null, hint: 'tier 1–4' },
            { label: 'Ops sube voucher', href: `${PROD_BASE}/admin/ops`, hint: 'PDF' },
            { label: 'Email al paciente', href: null, hint: 'Resend' },
          ]}
        />
        <div className="grid-2">
          <Card label="Tarifas">
            <ul className="tier-list">
              <li><span className="tier-name">Tier 1</span><span className="tier-price">desde 49 €</span></li>
              <li><span className="tier-name">Tier 2</span><span className="tier-price">desde 79 €</span></li>
              <li><span className="tier-name">Tier 3</span><span className="tier-price">desde 119 €</span></li>
              <li><span className="tier-name">Tier 4</span><span className="tier-price">desde 169 €</span></li>
            </ul>
          </Card>
          <Card label="Bug graveyard">
            <p>
              Antes el voucher se marcaba como enviado aunque Resend devolviera 403 (sandbox). Idempotencia arreglada en PR #1: <code>sent_to_patient_at</code> solo se sella cuando el email confirma OK.
            </p>
          </Card>
        </div>
      </>
    ),
  },

  /* 6 ─────────────────────────────────────────────────────────────── */
  {
    id: 'clinic',
    label: 'Clínica',
    chapter: 'Flujos',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 6 · Flujo clínica / profesional"
          title="Onboarding controlado, comisiones visibles, sin sign-up libre al panel"
          lede="Verificación humana antes de dar acceso al panel pro. Cada clínica ve sus referrals y su comisión."
        />
        <FlowSteps
          steps={[
            { label: 'Sign-up Clerk', href: `${PROD_BASE}/pro/sign-up` },
            { label: 'Onboarding', href: `${PROD_BASE}/pro/onboarding` },
            { label: 'Verificación admin', href: `${PROD_BASE}/admin/pro-verifications`, hint: 'humano' },
            { label: 'Pendiente', href: `${PROD_BASE}/pro/pending-approval` },
            { label: 'Panel pro', href: `${PROD_BASE}/pro/dashboard` },
          ]}
        />
        <div className="grid-2">
          <Card label="Verificación humana">
            <ul>
              <li>Modal con datos de colegiación, CIF y especialidades.</li>
              <li>Admin aprueba, rechaza o pide más info.</li>
              <li>Clerk <code>publicMetadata.role</code> activa el acceso.</li>
            </ul>
          </Card>
          <Card label="Panel pro · /pro/dashboard">
            <ul>
              <li>Referrals recibidos · estado.</li>
              <li>Comisiones últimos 30 días — <code>/api/pro/commissions</code>.</li>
              <li>Tarifa por referral configurable (env <code>PRO_COMMISSION_PER_REFERRAL</code>).</li>
            </ul>
          </Card>
        </div>
      </>
    ),
  },

  /* 7 ─────────────────────────────────────────────────────────────── */
  {
    id: 'ops',
    label: 'Equipo de Ops',
    chapter: 'Flujos',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 7 · Flujo del equipo de Ops"
          title="Una pantalla, todos los casos, integración real con Stripe"
          lede="Ops vive en /admin/ops. Cada caso es una fila con estado, paciente, clínica propuesta y acciones."
        />
        <CaseStateDiagram />
        <div className="grid-3 grid-3-tight">
          <MiniCard title="Casos abiertos">
            Lista priorizada por SLA. Acción &laquo;Llamar a clínica&raquo; abre teléfono + log.
          </MiniCard>
          <MiniCard title="Voucher upload">
            Para sin-seguro: PDF firmado por la clínica + email al paciente. Idempotente.
          </MiniCard>
          <MiniCard title="Refunds Stripe">
            Botón &laquo;Devolver&raquo; emite <code>refund</code> real, marca el booking, invalida el token.
          </MiniCard>
        </div>
        <Note>
          Acciones críticas (refund, voucher, aprobación de clínica) están detrás del role guard <code>{`['admin','ops']`}</code> con tokens HMAC de 12 h y endpoint de refresh.
        </Note>
      </>
    ),
  },

  /* 8 ─────────────────────────────────────────────────────────────── */
  {
    id: 'admin',
    label: 'Admin',
    chapter: 'Flujos',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 8 · Flujo admin"
          title="Quién entra al sistema y con qué rol"
          lede="Admin promueve a profesionales, aprueba clínicas y gestiona usuarios. No hay self-service de roles."
        />
        <div className="grid-2">
          <Card label="Gestión de usuarios">
            <p><Link href={`${PROD_BASE}/admin/users`}>{`${PROD_BASE}/admin/users`}</Link></p>
            <ul>
              <li>Ver todos los usuarios Clerk.</li>
              <li>Promover a <strong>professional</strong> con un click → <code>POST /api/admin/professionals/grant</code>.</li>
              <li>Cambiar rol a <strong>admin</strong> u <strong>ops</strong>.</li>
            </ul>
          </Card>
          <Card label="Verificación de clínicas">
            <p><Link href={`${PROD_BASE}/admin/pro-verifications`}>{`${PROD_BASE}/admin/pro-verifications`}</Link></p>
            <ul>
              <li>Cola de profesionales esperando verificación.</li>
              <li>Aprobar / rechazar / &laquo;pedir más info&raquo; — el último envía email automático.</li>
              <li>Alta directa de clínica desde <Link href={`${PROD_BASE}/admin/clinic-alta`}>/admin/clinic-alta</Link>.</li>
            </ul>
          </Card>
        </div>
        <Note>
          El primer profesional real entra a producción con un POST manual. Pendiente <strong>P4</strong>: hacerlo cuando se registre el primero por Clerk.
        </Note>
      </>
    ),
  },

  /* 9 ─────────────────────────────────────────────────────────────── */
  {
    id: 'status',
    label: 'Estado actual',
    chapter: 'Estado',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 9 · Lo que está vivo"
          title="Lo que el MVP ya hace en producción"
          lede="Smoke end-to-end pasado contra www.medconnect.es. Los puntos en rojo son los que bloquean el lanzamiento público."
        />
        <div className="grid-2">
          <Card label="Vivo y verificado" tone="success">
            <ul className="check-list">
              <li>Auth Clerk producción · <span className="muted">B1</span></li>
              <li>Resend medconnect.es verificado · <span className="muted">B2</span></li>
              <li>Aviso legal con CIF · <span className="muted">B4</span></li>
              <li>Dominio en Vercel · <span className="muted">B5</span></li>
              <li>GA4 + funnel instrumentado · <span className="muted">H1</span></li>
              <li>Teléfono +34 91 197 70 52 · <span className="muted">H4</span></li>
              <li>Favicon + OG image + 404 · <span className="muted">H5/H6</span></li>
              <li>Rate limit + Sentry + role guards · <span className="muted">M1/M2/M4</span></li>
              <li>Autoservicio paciente · <span className="muted">F2</span></li>
              <li>Panel pro + comisiones · <span className="muted">F3</span></li>
              <li>88 landings SEO con datos reales · <span className="muted">F6</span></li>
            </ul>
          </Card>
          <Card label="Pendiente para lanzar" tone="warn">
            <ul className="block-list">
              <li><strong>B3 · Stripe live keys</strong> · pendiente de SaludOnNet</li>
              <li><strong>P5 · Carrier del teléfono</strong> · IVR, agentes, horarios</li>
              <li><strong>P4 · Primer profesional real</strong> · al registrarse por Clerk</li>
              <li><strong>H2 · GA4 ↔ Google Ads</strong> · para SEM</li>
              <li><strong>H3 · Trustpilot</strong> · review pública</li>
            </ul>
          </Card>
        </div>
        <Note>
          <strong>Bug graveyard reciente:</strong> Stripe email_invalid (PR #7), 88 SEO pages dark por params async en Next.js 16 (PR #10), voucher idempotency (PR #1), Clerk env hygiene. Cuatro regresiones silenciosas detectadas + cerradas antes del público.
        </Note>
      </>
    ),
  },

  /* 10 ────────────────────────────────────────────────────────────── */
  {
    id: 'team-interaction',
    label: 'Operación post-launch',
    chapter: 'Operación',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 10 · Operación post-launch"
          title="Cómo trabajan los equipos cuando entra un caso"
          lede="Tres escenarios, cada uno con un swimlane: caso normal asegurado, caso sin-seguro con voucher, refund por incidencia."
        />
        <div className="swimlane">
          <SwimlaneRow
            scenario="Asegurado · cita conseguida"
            steps={[
              { area: 'Paciente', text: 'Reserva + paga prioridad' },
              { area: 'Sistema', text: 'Crea booking + email confirmación' },
              { area: 'Ops', text: 'Llama a clínica, confirma hueco' },
              { area: 'Clínica', text: 'Acepta · ve al paciente' },
              { area: 'Sistema', text: 'Email de recordatorio' },
            ]}
          />
          <SwimlaneRow
            scenario="Sin seguro · voucher"
            steps={[
              { area: 'Paciente', text: 'Paga tier 1–4' },
              { area: 'Ops', text: 'Concierta + recibe PDF clínica' },
              { area: 'Ops', text: 'Sube voucher al panel' },
              { area: 'Sistema', text: 'Email con voucher al paciente' },
              { area: 'Clínica', text: 'Atiende presentando voucher' },
            ]}
          />
          <SwimlaneRow
            scenario="Refund · incidencia"
            steps={[
              { area: 'Paciente', text: 'Cancela vía /booking/[token]' },
              { area: 'Sistema', text: 'Refund Stripe automático' },
              { area: 'Ops', text: 'Verifica + cierra caso' },
              { area: 'Sistema', text: 'Email confirmación' },
              { area: 'Clínica', text: 'Recibe aviso, libera hueco' },
            ]}
          />
        </div>
      </>
    ),
  },

  /* 11 ────────────────────────────────────────────────────────────── */
  {
    id: 'asks',
    label: 'Asks por dirección',
    chapter: 'Decisiones',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 11 · Decisiones · Asks por dirección"
          title="Lo que necesitamos cerrar para fijar fecha"
          lede={`Propuesta: soft launch ${LAUNCH.soft} · público ${LAUNCH.public}. Cada ask de abajo bloquea o desbloquea esas fechas.`}
        />
        <div className="grid-2">
          <Card label={`${DIRECTORS.comercial.name} · ${DIRECTORS.comercial.role}`} tone="ask">
            <ul className="ask-list">
              <li>
                <span className="ask-tag">Bloqueante</span>
                <strong>Stripe live keys</strong> — pedir a finanzas SaludOnNet <code>pk_live_/sk_live_</code> + webhook secret. Sin esto no cobramos.
              </li>
              <li>
                <span className="ask-tag">Lanzamiento</span>
                <strong>Presupuesto SEM</strong> mes 1 — para amortizar las 88 landings y validar la hipótesis 1.
              </li>
              <li>
                <span className="ask-tag">Trustpilot</span>
                <strong>Cuenta corporativa</strong> + plan de pedido de reviews tras la primera cita.
              </li>
              <li>
                <span className="ask-tag">Concertación</span>
                <strong>Política F9</strong>: qué aseguradoras atendemos en qué clínicas (deferida 29-abr).
              </li>
            </ul>
          </Card>
          <Card label={`${DIRECTORS.operaciones.name} · ${DIRECTORS.operaciones.role}`} tone="ask">
            <ul className="ask-list">
              <li>
                <span className="ask-tag">Bloqueante</span>
                <strong>Carrier del teléfono</strong> — IVR, agentes, bloqueo fuera de horario para +34 91 197 70 52.
              </li>
              <li>
                <span className="ask-tag">Headcount</span>
                <strong>Equipo ops</strong> mes 1 — turno L-V 10-18, dimensionado para X bookings/día.
              </li>
              <li>
                <span className="ask-tag">SLA</span>
                <strong>Tiempo respuesta</strong> caso → cita confirmada (propuesta &lt; 4 h en horario).
              </li>
              <li>
                <span className="ask-tag">Concertación</span>
                <strong>Pipeline clínicas</strong> — primer profesional real en producción (P4).
              </li>
            </ul>
          </Card>
        </div>
        <Note>
          Si Stripe live keys + carrier de teléfono llegan esta semana, soft launch {LAUNCH.soft} es viable. Cada día de retraso en uno de los dos mueve el público {LAUNCH.public} en bloque.
        </Note>
      </>
    ),
  },

  /* 12 ────────────────────────────────────────────────────────────── */
  {
    id: 'tools',
    label: 'Herramientas',
    chapter: 'Operación',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 12 · Herramientas"
          title="Qué dashboard usa cada rol post-launch"
          lede="Todo accesible desde el navegador. Sin instalaciones por equipo."
        />
        <div className="tools-grid">
          <ToolCard role="Ops" url={`${PROD_BASE}/admin/ops`} purpose="Gestión de casos día a día" />
          <ToolCard role="Ops" url={`${PROD_BASE}/admin/pro-verifications`} purpose="Aprobar nuevas clínicas" />
          <ToolCard role="Admin" url={`${PROD_BASE}/admin/users`} purpose="Roles + permisos" />
          <ToolCard role="Pro" url={`${PROD_BASE}/pro/dashboard`} purpose="Su clínica + comisiones" />
          <ToolCard role="Marketing" url="https://analytics.google.com" purpose="GA4 · funnel + conversiones" />
          <ToolCard role="Marketing" url="https://clarity.microsoft.com" purpose="Clarity · session replays" />
          <ToolCard role="Finanzas" url="https://dashboard.stripe.com" purpose="Stripe · cobros + refunds" />
          <ToolCard role="Eng" url="https://sentry.io" purpose="Sentry · errores en vivo" />
          <ToolCard role="Eng" url="https://resend.com" purpose="Resend · entregas de email" />
          <ToolCard role="Eng" url="https://dashboard.clerk.com" purpose="Clerk · auth + roles" />
          <ToolCard role="Eng" url="https://vercel.com" purpose="Vercel · deploys + envs" />
          <ToolCard role="Eng" url="https://search.google.com/search-console" purpose="Search Console · SEO" />
        </div>
      </>
    ),
  },

  /* 13 ────────────────────────────────────────────────────────────── */
  {
    id: 'roadmap',
    label: 'Roadmap',
    chapter: 'Cierre',
    render: () => (
      <>
        <SlideHeader
          eyebrow="Slide 13 · Roadmap post-launch"
          title="Qué entra después de validar las dos hipótesis"
          lede="Priorizado por evidencia que aporta y esfuerzo. F4 + F5 cambian el modelo de costes; F1 abre suscripción recurrente."
        />
        <div className="roadmap">
          <RoadmapItem code="F1" title="Med Connect Plus (suscripción)" timing="6–8 semanas post-launch" status="preserved en branch" />
          <RoadmapItem code="F4" title="Recordatorios SMS Twilio (24h / 2h)" timing="2–3 semanas" status="reduce no-shows" />
          <RoadmapItem code="F5" title="Integración API aseguradoras" timing="3–6 meses" status="lead time largo · Sanitas/Adeslas/DKV" />
          <RoadmapItem code="F6" title="+SEO landing pages para SEM" timing="iterativo" status="88 vivos · objetivo 200" />
          <RoadmapItem code="F9" title="Política aseguradora ↔ clínica" timing="decisión producto" status="opciones a/b/c en mesa" />
          <RoadmapItem code="M3" title="Insight email semanal con Claude" timing="1 semana" status="pendiente API key" />
          <RoadmapItem code="M5" title="Slot sync con SaludOnNet" timing="3–4 semanas" status="hoy es determinístico" />
          <RoadmapItem code="M6" title="Cron de recordatorios server-side" timing="1 semana" status="requiere Vercel Pro" />
        </div>
        <Note>
          Próximo board: presentamos los cuatro números de las dos hipótesis (bookings/sem, conv search→book, % aceptación clínica, NPS) y decidimos pivote o escala.
        </Note>
      </>
    ),
  },
];

// ── Slide-shell helpers ──────────────────────────────────────────────────

function SlideHeader({ eyebrow, title, lede }) {
  return (
    <header className="slide-header">
      <div className="slide-eyebrow">{eyebrow}</div>
      <h2 className="slide-title">{title}</h2>
      {lede && <p className="slide-lede">{lede}</p>}
    </header>
  );
}

function Card({ label, tone, children }) {
  return (
    <div className={`board-card ${tone ? `board-card-${tone}` : ''}`}>
      {label && <div className="board-card-label">{label}</div>}
      <div className="board-card-body">{children}</div>
    </div>
  );
}

function MiniCard({ title, children }) {
  return (
    <div className="mini-card">
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}

function Note({ children }) {
  return (
    <aside className="slide-note">
      <span className="slide-note-label">Notas</span>
      <p>{children}</p>
    </aside>
  );
}

function Stage({ number, actor, title, body, links = [] }) {
  return (
    <div className="stage">
      <div className="stage-num">{number}</div>
      <div className="stage-actor">{actor}</div>
      <div className="stage-title">{title}</div>
      <p className="stage-body">{body}</p>
      <div className="stage-links">
        {links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
            {l.label} <Icon name="arrow-up-right" size={12} />
          </a>
        ))}
      </div>
    </div>
  );
}

function Arrow() {
  return <div className="stage-arrow" aria-hidden="true">→</div>;
}

function FlowSteps({ steps }) {
  return (
    <ol className="flow-steps">
      {steps.map((s, i) => (
        <li key={s.label}>
          <span className="flow-step-num">{i + 1}</span>
          <span className="flow-step-label">
            {s.href ? (
              <a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
            ) : (
              s.label
            )}
            {s.hint && <span className="flow-step-hint"> · {s.hint}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CaseStateDiagram() {
  const STATES = [
    { from: 'open', to: 'contacting_clinic' },
    { from: 'contacting_clinic', to: 'slot_proposed' },
    { from: 'slot_proposed', to: 'confirmed' },
    { from: 'confirmed', to: 'completed' },
    { from: '*', to: 'refunded', note: 'cualquier estado' },
  ];
  return (
    <div className="state-diagram">
      {STATES.map((s, i) => (
        <div key={i} className="state-row">
          <code className="state-from">{s.from}</code>
          <span className="state-arrow">→</span>
          <code className="state-to">{s.to}</code>
          {s.note && <span className="state-note">{s.note}</span>}
        </div>
      ))}
    </div>
  );
}

function SwimlaneRow({ scenario, steps }) {
  return (
    <div className="swimlane-row">
      <div className="swimlane-scenario">{scenario}</div>
      <div className="swimlane-steps">
        {steps.map((s, i) => (
          <div key={i} className={`swimlane-cell area-${s.area.toLowerCase()}`}>
            <span className="swimlane-area">{s.area}</span>
            <span className="swimlane-text">{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolCard({ role, url, purpose }) {
  return (
    <a className="tool-card" href={url} target="_blank" rel="noopener noreferrer">
      <span className="tool-role">{role}</span>
      <span className="tool-url">{url.replace(/^https?:\/\//, '')}</span>
      <span className="tool-purpose">{purpose}</span>
    </a>
  );
}

function RoadmapItem({ code, title, timing, status }) {
  return (
    <div className="roadmap-item">
      <div className="roadmap-code">{code}</div>
      <div className="roadmap-content">
        <div className="roadmap-title">{title}</div>
        <div className="roadmap-meta">
          <span className="roadmap-timing">{timing}</span>
          <span className="roadmap-status">{status}</span>
        </div>
      </div>
    </div>
  );
}

// ── Deck shell ───────────────────────────────────────────────────────────

export default function Deck() {
  const total = SLIDES.length;
  const [index, setIndex] = useState(0);
  const [printMode, setPrintMode] = useState(false);

  const goTo = useCallback((i) => {
    const next = Math.max(0, Math.min(total - 1, i));
    setIndex(next);
    if (typeof window !== 'undefined') {
      const slide = SLIDES[next];
      if (slide?.id) window.history.replaceState(null, '', `#${slide.id}`);
    }
  }, [total]);

  // Hash-on-mount + hashchange listener: deep links like `#patient-insured`
  // land you on the right slide, and back/forward in the browser also work.
  // Modeled as an external-system subscription (window.location.hash is the
  // external state, the hashchange event is the subscription), which is the
  // correct shape for `setState` inside an effect.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) return;
      const found = SLIDES.findIndex((s) => s.id === hash);
      if (found >= 0) setIndex(found);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // Keyboard nav.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e) => {
      // Don't intercept while typing into the URL bar / inputs.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(total - 1);
      } else if (e.key === 'p' || e.key === 'P') {
        // Toggle "show all slides" mode for screenshots / PDF print.
        setPrintMode((m) => !m);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, total, goTo]);

  const current = SLIDES[index];
  const chapters = useMemo(() => {
    // Group slides by chapter for the sidebar TOC.
    const out = [];
    SLIDES.forEach((s, i) => {
      const last = out[out.length - 1];
      if (!last || last.chapter !== s.chapter) {
        out.push({ chapter: s.chapter, slides: [{ ...s, idx: i }] });
      } else {
        last.slides.push({ ...s, idx: i });
      }
    });
    return out;
  }, []);

  return (
    <div className={`deck ${printMode ? 'deck-print' : ''}`}>
      <aside className="deck-toc" aria-label="Índice">
        <div className="deck-brand">
          <span className="deck-brand-mark">MC</span>
          <span className="deck-brand-text">
            <strong>Med Connect</strong>
            <em>Dirección · 30 abr 2026</em>
          </span>
        </div>
        <nav>
          {chapters.map((c) => (
            <div key={c.chapter} className="deck-toc-chapter">
              <div className="deck-toc-chapter-label">{c.chapter}</div>
              <ul>
                {c.slides.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goTo(s.idx)}
                      className={`deck-toc-link ${s.idx === index ? 'is-current' : ''}`}
                    >
                      <span className="deck-toc-num">{s.idx + 1}</span>
                      <span className="deck-toc-label">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="deck-toc-tip">
          <strong>Atajos:</strong> ← → cambiar · <kbd>P</kbd> ver todas (imprimir / exportar PDF) · <kbd>Home</kbd>/<kbd>End</kbd> ir al inicio/final.
        </div>
      </aside>

      <main className="deck-main">
        {printMode ? (
          // Print mode: render every slide stacked. Browser print → PDF
          // produces one slide per page thanks to the .deck-print CSS.
          <div className="deck-all">
            {SLIDES.map((s) => (
              <section key={s.id} id={s.id} className="slide" data-chapter={s.chapter}>
                {s.render()}
              </section>
            ))}
          </div>
        ) : (
          <>
            <section
              key={current.id}
              id={current.id}
              className="slide"
              data-chapter={current.chapter}
            >
              {current.render()}
            </section>
            <nav className="deck-controls" aria-label="Navegación">
              <button
                type="button"
                className="deck-btn"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
              >
                ← Anterior
              </button>
              <span className="deck-progress">
                <span className="deck-progress-current">{String(index + 1).padStart(2, '0')}</span>
                <span className="deck-progress-sep">/</span>
                <span className="deck-progress-total">{String(total).padStart(2, '0')}</span>
                <span className="deck-progress-label">{current.label}</span>
              </span>
              <button
                type="button"
                className="deck-btn"
                onClick={() => goTo(index + 1)}
                disabled={index === total - 1}
              >
                Siguiente →
              </button>
            </nav>
          </>
        )}
      </main>
    </div>
  );
}
