'use client';

/**
 * /internal/ops — Operations / Customer Service handbook deck.
 *
 * Audience: Raquel (first operator) and future team members of
 * "Operaciones / Atención al Cliente". Self-service: she opens the URL,
 * reads it cold, and after slide 5 can log into the panel.
 *
 * MVP-specific behaviour reflected throughout: when a clinic rejects a
 * case, we DON'T jump straight to the marketplace search. We first try
 * to re-slot at Centro Médico Cea Bermúdez (with their available
 * specialties). Only if Cea can't take it do we search for alternatives
 * or refund. See slides 7, 8, 9 and the annex at slide 14.
 */

import DeckShell from '../_deck/DeckShell';
import {
  SlideHeader,
  Card,
  MiniCard,
  Note,
  Stage,
  Arrow,
  FlowSteps,
  SwimlaneRow,
  ToolCard,
} from '../_deck/components';

const PROD_BASE = 'https://www.medconnect.es';
const SLA = '< 6 h en horario (L–V 10:00–18:00 Madrid)';
const SUPPORT_PHONE = '+34 91 197 70 52';
const TEAM = 'Operaciones / Atención al Cliente';
const CEA_NAME = 'Centro Médico Cea Bermúdez';

function CaseStateDiagram() {
  // Reflects the MVP rule: clinic-rejected → first try Cea fallback,
  // then external search. The actual DB states haven't been renamed; this
  // is just operator-facing language so Raquel knows which path to follow.
  const STATES = [
    { from: 'pending_call', to: 'contacting_clinic', note: 'llamas a la clínica' },
    { from: 'contacting_clinic', to: 'confirmed', note: 'la clínica acepta el hueco' },
    { from: 'contacting_clinic', to: 'clinic_proposed_alternative', note: 'propone otro hueco' },
    { from: 'contacting_clinic', to: 'clinic_rejected_searching', note: 'no puede · pasamos a Cea Bermúdez' },
    { from: 'clinic_rejected_searching', to: 'alternative_clinic_proposed', note: 'Cea propone hueco · si no, alternativa' },
    { from: '*', to: 'refunded', note: 'reembolso Stripe si no hay alternativa' },
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

function ActionButton({ icon, name, when, effect }) {
  return (
    <div className="board-card" style={{ marginBottom: 8 }}>
      <div className="board-card-label">{icon} {name}</div>
      <div className="board-card-body" style={{ paddingTop: 4 }}>
        <p style={{ margin: 0 }}><strong>Cuándo:</strong> {when}</p>
        <p style={{ margin: '4px 0 0' }}><strong>Qué dispara:</strong> {effect}</p>
      </div>
    </div>
  );
}

function Runbook({ scenario, signal, action, emailHint }) {
  return (
    <div className="board-card" style={{ marginBottom: 10 }}>
      <div className="board-card-label">{scenario}</div>
      <div className="board-card-body" style={{ paddingTop: 4 }}>
        <p style={{ margin: 0 }}><strong>Señal:</strong> {signal}</p>
        <p style={{ margin: '4px 0' }}><strong>Acción:</strong> {action}</p>
        {emailHint && <p style={{ margin: 0, opacity: 0.85 }}><strong>Email:</strong> {emailHint}</p>}
      </div>
    </div>
  );
}

function FlowRow({ num, name, who, summary, href, anchor }) {
  return (
    <div className="board-card" style={{ marginBottom: 10 }}>
      <div className="board-card-label">
        {num} · {name}
        {anchor && (
          <span style={{ float: 'right', fontWeight: 'normal', opacity: 0.8 }}>
            <a href={anchor}>Ver detalle ↓</a>
          </span>
        )}
      </div>
      <div className="board-card-body" style={{ paddingTop: 4 }}>
        <p style={{ margin: 0 }}><strong>Quién interviene:</strong> {who}</p>
        <p style={{ margin: '4px 0 0' }}>{summary}</p>
        {href && (
          <p style={{ margin: '6px 0 0' }}>
            <a href={href} target="_blank" rel="noopener noreferrer">{href.replace('https://', '')}</a>
          </p>
        )}
      </div>
    </div>
  );
}

function buildSlides({ credentials }) {
  return [
    /* 1 ─────────────────────────────────────────────────────────── */
    {
      id: 'cover',
      label: 'Bienvenida',
      chapter: 'Apertura',
      render: () => (
        <div className="slide-cover">
          <div className="slide-cover-eyebrow">Med Connect · Manual de {TEAM}</div>
          <h1 className="slide-cover-title">
            Todo lo que necesitas para <em>operar el panel de {TEAM}</em>.
          </h1>
          <p className="slide-cover-lede">
            Descripción del producto, los cuatro flujos de Medconnect, tu rol como operadora,
            cómo entrar al panel, los escenarios típicos con su solución, áreas secundarias del admin,
            a quién escalar cuando algo no encaja, y un anexo con el detalle de los flujos de derivación.
          </p>
          <div className="slide-cover-meta">
            <div>
              <span className="slide-cover-meta-key">Audiencia</span>
              <span className="slide-cover-meta-val">{TEAM} · Raquel</span>
            </div>
            <div>
              <span className="slide-cover-meta-key">Producto</span>
              <span className="slide-cover-meta-val">{PROD_BASE.replace('https://', '')}</span>
            </div>
            <div>
              <span className="slide-cover-meta-key">SLA</span>
              <span className="slide-cover-meta-val">{SLA}</span>
            </div>
          </div>
        </div>
      ),
    },

    /* 2 ─────────────────────────────────────────────────────────── */
    {
      id: 'what-is',
      label: 'Qué es Medconnect',
      chapter: 'Producto',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 2 · Producto"
            title="Qué es Medconnect"
            lede="Medconnect cobra una tarifa de prioridad para conseguir citas rápidas en clínicas concertadas con el seguro del paciente. La consulta médica sigue cubierta por el seguro; lo que cobramos es la prioridad."
          />
          <div className="diagram-flow">
            <Stage
              number="1"
              actor="Paciente"
              title="Busca y reserva"
              links={[
                { href: `${PROD_BASE}/search-v2`, label: 'Buscador' },
              ]}
              body="Elige especialidad + ciudad, ve clínicas concertadas con su seguro, paga la tarifa de prioridad."
            />
            <Arrow />
            <Stage
              number="2"
              actor={`${TEAM} · TÚ`}
              title="Concierta la cita"
              links={[
                { href: `${PROD_BASE}/admin/ops`, label: 'Panel' },
              ]}
              body="Recibes el caso, llamas a la clínica, confirmas el hueco o propones alternativa."
            />
            <Arrow />
            <Stage
              number="3"
              actor="Clínica"
              title="Atiende al paciente"
              links={[
                { href: `${PROD_BASE}/pro/dashboard`, label: 'Panel pro' },
              ]}
              body="Acepta el caso, ve al paciente con su póliza, cobra su comisión a Medconnect."
            />
          </div>
          <Note>
            La parte que paga el paciente a Medconnect es <strong>solo la tarifa de prioridad</strong> (desde 4,99 €).
            La consulta sigue cubierta por su seguro. En pacientes <em>sin seguro</em> se paga la cita completa por tiers
            (49 € / 79 € / 119 € / 169 €) y reciben un voucher.
          </Note>
        </>
      ),
    },

    /* 3 ─────────────────────────────────────────────────────────── */
    {
      id: 'four-flows',
      label: 'Los 4 flujos',
      chapter: 'Producto',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 3 · Los 4 flujos del producto"
            title="Qué pasa antes y después de tu panel"
            lede={`Tú vives en /admin/ops, pero conviene saber de dónde vienen los casos y a dónde van después. Hay cuatro flujos paralelos en el producto. El detalle paso a paso de los flujos de derivación está en el anexo (slide 14).`}
          />
          <FlowRow
            num="1"
            name="Reserva directa — paciente paga online"
            who="Paciente → Medconnect → TÚ → Clínica"
            summary="El paciente entra a la web, busca por especialidad y ciudad, paga en Stripe. Se crea un caso con estado pending_call en tu lista. Este es el flujo que verás casi siempre."
            href={`${PROD_BASE}/search-v2`}
            anchor="#anexo-flujos"
          />
          <FlowRow
            num="2"
            name="Derivación interna (lock-in) — médico a colega"
            who="Médico A · misma clínica · Paciente"
            summary="Un médico/clínica deriva al paciente a un colega de la misma clínica. Genera un email lock-in de 60 min al paciente. No pasa por ti — la misma clínica deriva y atiende, así que ellos gestionan el hueco internamente. Solo entras si surge incidencia."
            href={`${PROD_BASE}/pro/dashboard`}
            anchor="#anexo-flujos"
          />
          <FlowRow
            num="3"
            name="Derivación externa — clínica a otra clínica"
            who="Clínica A → Marketplace → Clínica B · TÚ · Paciente"
            summary="Una clínica deriva al paciente a OTRA clínica del marketplace. Cuando el paciente paga, se crea un caso en tu lista con la chip «derivación externa». Tu trabajo es exactamente el de un caso directo: llamas a la clínica receptora para confirmar el hueco, proponer alternativa, buscar otra clínica o reembolsar. Si la receptora no está dada de alta en Medconnect, al pulsar ✓ Aceptar le llega un email con datos del paciente + enlace de onboarding."
            href={`${PROD_BASE}/pro/dashboard`}
            anchor="#anexo-flujos"
          />
          <FlowRow
            num="4"
            name="Alta de clínica — onboarding"
            who="Clínica nueva → TÚ revisas"
            summary="Una clínica nueva pide darse de alta vía /pro/onboarding. Tú la revisas en /admin/clinic-alta (detalle en slide 10)."
            href={`${PROD_BASE}/pro/onboarding`}
            anchor="#anexo-flujos"
          />
          <Note>
            En analytics el evento <code>book_started</code> ya viene separado por <code>source: direct</code>{' '}
            vs <code>lock_in</code> — útil si Carlos o Francisco te preguntan de dónde viene un caso.
            Para el desglose paso a paso de cada flujo, salta al{' '}
            <a href="#anexo-flujos"><strong>Anexo · Flujos de derivación</strong></a>{' '}(slide 14).
          </Note>
        </>
      ),
    },

    /* 4 ─────────────────────────────────────────────────────────── */
    {
      id: 'role',
      label: 'Tu rol y SLA',
      chapter: 'Tu rol',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 4 · Tu rol"
            title="Concertar la cita en menos de 6 horas"
            lede="Tu trabajo es el puente entre el paciente que ya pagó y la clínica que tiene que abrir el hueco."
          />
          <div className="grid-2">
            <Card label="Lo que sí haces">
              <ul>
                <li>Revisar la lista de casos en <code>/admin/ops</code> al inicio del turno.</li>
                <li>Llamar a la clínica con el script del caso.</li>
                <li>Resolver cada caso con uno de los 5 botones (slide 7).</li>
                <li>Subir el voucher PDF cuando el paciente es sin-seguro.</li>
                <li>Emitir reembolsos Stripe cuando no haya alternativa.</li>
                <li>Revisar altas de clínica en <code>/admin/clinic-alta</code>.</li>
                <li>Verificar profesionales en <code>/admin/pro-verifications</code>.</li>
                <li>
                  <strong>Llamadas masivas a clínicas para fichar nuevas</strong>{' '}
                  (con aprobación previa de Carlos).
                </li>
                <li><strong>Decisiones de plantilla / horarios del equipo</strong> de {TEAM}.</li>
              </ul>
            </Card>
            <Card label="Lo que NO haces (y a quién va)" tone="warn">
              <ul>
                <li>Cambiar precios de la prioridad → <strong>Francisco</strong>.</li>
                <li>Decidir qué aseguradoras admitimos → <strong>Francisco</strong>.</li>
                <li>Aprobar campañas de Google Ads → <strong>Francisco</strong>.</li>
                <li>Tocar el código del panel → <strong>Francisco</strong>.</li>
                <li>
                  Iniciar campañas comerciales nuevas sin aprobación → <strong>Carlos</strong> da el OK,
                  luego ejecutáis vosotras desde {TEAM}.
                </li>
              </ul>
            </Card>
          </div>
          <Note>
            <strong>SLA:</strong> {SLA}. Si un caso lleva más de 4 h sin resolver, Sentry y/o el equipo te avisan.
            Si no puedes con un caso en el plazo, escala antes de que venza (slide 12).
          </Note>
        </>
      ),
    },

    /* 5 ─────────────────────────────────────────────────────────── */
    {
      id: 'login',
      label: 'Cómo entrar',
      chapter: 'Tu rol',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 5 · Cómo entrar al panel"
            title="Tu acceso a /admin/ops"
            lede="Tu cuenta tiene rol admin. La sesión dura 12 h; pasado ese tiempo te pedirá login otra vez."
          />
          <div className="grid-2">
            <Card label="Tus credenciales" tone="success">
              <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                <li><strong>URL:</strong> <a href={`${PROD_BASE}/admin/login`} target="_blank" rel="noopener noreferrer">{`${PROD_BASE}/admin/login`}</a></li>
                <li style={{ marginTop: 8 }}><strong>Usuario:</strong> <code>{credentials.username}</code></li>
                <li><strong>Contraseña:</strong> <code>{credentials.password}</code></li>
                <li style={{ marginTop: 8, opacity: 0.8 }}><strong>Rol:</strong> admin</li>
              </ul>
            </Card>
            <Card label="Buenas prácticas">
              <ul>
                <li>Guarda la contraseña en tu gestor (1Password, Bitwarden…). No la dejes en post-its.</li>
                <li>Si te olvidas: avisa a Francisco. Hay un endpoint puntual de recuperación.</li>
                <li>Cierra sesión al final del día (botón arriba a la derecha) si compartes equipo.</li>
                <li>No compartas tu cuenta. Para dar acceso a alguien nuevo, créale un usuario desde <code>/admin/users</code>.</li>
              </ul>
            </Card>
          </div>
          <FlowSteps
            steps={[
              { label: 'Abrir /admin/login', href: `${PROD_BASE}/admin/login` },
              { label: 'Introducir usuario + contraseña' },
              { label: 'Aceptar — entras directo a /admin/ops' },
              { label: 'Trabajar 12 h, después relogin' },
            ]}
          />
        </>
      ),
    },

    /* 6 ─────────────────────────────────────────────────────────── */
    {
      id: 'cases-list',
      label: 'Lista de casos',
      chapter: 'Panel',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 6 · /admin/ops · Lista de casos"
            title="La pantalla donde vives el 80% del día"
            lede="Cada fila es un caso. Filtros por estado en la parte superior. Click en un caso → /admin/ops/[id] con el detalle."
          />
          <CaseStateDiagram />
          <Note>
            <strong>Glosario rápido:</strong>{' '}
            <code>pending_call</code> = caso recién creado, te toca llamar.{' '}
            <code>contacting_clinic</code> = estás en mitad de la llamada.{' '}
            <code>confirmed</code> = caso resuelto, hueco confirmado.{' '}
            <code>clinic_proposed_alternative</code> = la clínica ofreció otro hueco, paciente debe aceptarlo por email.{' '}
            <code>clinic_rejected_searching</code> = la clínica original dijo no — pasas al fallback en <strong>{CEA_NAME}</strong>.{' '}
            <code>refunded</code> = se devolvió el dinero al paciente.
          </Note>
        </>
      ),
    },

    /* 7 ─────────────────────────────────────────────────────────── */
    {
      id: 'case-detail',
      label: 'Detalle de caso',
      chapter: 'Panel',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 7 · /admin/ops/[id] · Detalle"
            title="Los 5 botones que cierran un caso"
            lede="Cada caso se resuelve con uno de estos cinco botones. La página te muestra los datos del paciente, los datos de la clínica, el teléfono y un script sugerido para la llamada."
          />
          <ActionButton
            icon="✓"
            name="Aceptar — la clínica confirmó el hueco original"
            when="La clínica dice OK al hueco que el paciente había elegido."
            effect={
              `Estado → confirmed. Dos emails automáticos: (1) confirmación al paciente con datos de la cita, ` +
              `(2) confirmación a la clínica con datos del paciente + instrucciones y enlace para darse de alta ` +
              `en el portal y cobrar la comisión si aún no está dada de alta.`
            }
          />
          <ActionButton
            icon="🕐"
            name="Proponer alternativa — la clínica ofrece otro hueco"
            when="La clínica no puede el hueco original pero te ofrece otro día/hora."
            effect="Estado → clinic_proposed_alternative. Email al paciente con dos botones: Aceptar / Reembolsar."
          />
          <ActionButton
            icon="✕"
            name="Rechazar — la clínica original no puede atender"
            when="La clínica dice no, sin alternativa que ofrecer."
            effect={
              `Estado → clinic_rejected_searching. En este MVP el fallback es ${CEA_NAME}: ` +
              `propones día y hora allí si tienen la especialidad. Solo si Cea tampoco puede, ` +
              `buscas otra clínica del marketplace o reembolsas.`
            }
          />
          <ActionButton
            icon="🔁"
            name="Proponer hueco alternativo (Cea Bermúdez o marketplace)"
            when="Tras un rechazo, has confirmado un hueco en Cea Bermúdez o (si Cea no tiene la especialidad) en otra clínica."
            effect="Estado → alternative_clinic_proposed. Email al paciente con dos botones: Aceptar / Reembolsar."
          />
          <ActionButton
            icon="💸"
            name="Reembolsar — sin alternativa razonable"
            when="Ni la clínica original ni Cea Bermúdez ni el marketplace tienen la especialidad/horario solicitado."
            effect="Estado → refunded. Stripe refund automático, email al paciente, hueco liberado."
          />
          <Note>
            <strong>Detalle del email a la clínica</strong> (botón ✓ Aceptar): incluye nombre del paciente,
            día/hora, especialidad y un enlace personal de onboarding <code>/pro/onboarding?from=case</code>{' '}
            para que la clínica pueda darse de alta y registrar su IBAN para cobrar la comisión.
            Es la vía principal para fichar clínicas nuevas: las captamos cuando ya tienen un paciente
            esperando, así la conversión a alta es alta.
          </Note>
        </>
      ),
    },

    /* 8 ─────────────────────────────────────────────────────────── */
    {
      id: 'runbooks',
      label: 'Escenarios típicos',
      chapter: 'Panel',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 8 · Escenarios típicos"
            title="Qué hacer en los 8 casos que verás más"
            lede={`No necesitas memorizar: vuelve aquí cuando un caso no encaje. ` +
              `Regla principal del MVP: si la clínica original no puede, primero intentamos ` +
              `${CEA_NAME} y solo si tampoco puede vamos al marketplace. ` +
              `Los casos con chip "derivación externa" se tratan igual que los directos — la única diferencia es que llamas a una clínica que puede no estar dada de alta en Medconnect todavía.`}
          />
          <div className="grid-2">
            <Runbook
              scenario="A · Clínica acepta tal cual"
              signal="Estás llamando, la clínica te dice «sí, ese hueco está libre, lo apunto»."
              action="Botón ✓ Aceptar. Estado → confirmed."
              emailHint="Dos emails: (1) confirmación al paciente, (2) confirmación a la clínica con enlace para darse de alta y cobrar."
            />
            <Runbook
              scenario="B · Clínica propone otro hueco"
              signal="«El martes a las 11 no, pero le ofrezco miércoles 09:30»."
              action="Botón 🕐 Proponer alternativa. Anotas el nuevo día/hora en el formulario."
              emailHint="El paciente recibe email con botones Aceptar / Reembolsar. No tienes que llamarle, lo decide él."
            />
            <Runbook
              scenario={`C · Clínica original no puede · ${CEA_NAME} sí tiene la especialidad`}
              signal="«No tenemos huecos» — y miras la lista de especialidades de Cea Bermúdez, sí está."
              action={`Botón ✕ Rechazar (cierra la clínica original). Llamas a ${CEA_NAME}, confirmas día/hora. Botón 🔁 Proponer hueco alternativo con los datos de Cea.`}
              emailHint="Email al paciente con Aceptar / Reembolsar para el nuevo hueco en Cea."
            />
            <Runbook
              scenario={`D · Clínica original no puede · ${CEA_NAME} NO tiene la especialidad`}
              signal="Rechazo de la clínica original y Cea tampoco cubre esa especialidad."
              action="Botón ✕ Rechazar. Buscas en el marketplace una clínica alternativa. Botón 🔁 si encuentras hueco, 💸 si no."
              emailHint="Si encuentras alternativa: email Aceptar/Reembolsar al paciente. Si no: refund + email explicativo."
            />
            <Runbook
              scenario="E · Clínica original no contesta"
              signal="Tres intentos en 2 horas sin respuesta."
              action={`Anotas en el log del caso. A las 24 h pasas al fallback de ${CEA_NAME}. Si pasan 48 h sin desbloquear, escalas a Carlos.`}
              emailHint="Solo enviar email al paciente cuando hay propuesta concreta (Cea o marketplace) o cuando vas a reembolsar."
            />
            <Runbook
              scenario="F · Paciente pide reembolso directo"
              signal="El paciente llama o escribe pidiendo cancelar antes de que confirmes."
              action="Botón 💸 Reembolsar. Anota el motivo en el formulario."
              emailHint="Stripe refund automático + email de confirmación al paciente."
            />
            <Runbook
              scenario="G · No hay alternativa razonable"
              signal={`Ni clínica original, ni ${CEA_NAME}, ni marketplace tienen hueco viable.`}
              action="Botón 💸 Reembolsar. Anota motivo: «sin disponibilidad»."
              emailHint="Stripe refund + email al paciente explicando que reembolsamos por falta de disponibilidad."
            />
            <Runbook
              scenario="H · Caso por derivación externa"
              signal="El caso lleva la chip 🌐 «derivación externa» en la lista. El paciente ya pagó la prioridad. La clínica receptora puede no estar dada de alta en Medconnect todavía."
              action="Mismo flujo que un caso directo: llamas a la clínica receptora con el script normal del caso. Si confirman → ✓ Aceptar. Si proponen otra hora → 🕐. Si dicen que no → fallback Cea → 🔁 o 💸."
              emailHint="Mismo email al paciente que en la vía directa. AL pulsar ✓ Aceptar, la clínica receptora recibe email con datos del paciente + enlace para darse de alta en Medconnect y cobrar la comisión — si ya estaba dada de alta, el email se lo recuerda; si no, es su captura."
            />
          </div>
        </>
      ),
    },

    /* 9 ─────────────────────────────────────────────────────────── */
    {
      id: 'refunds',
      label: 'Reembolsos Stripe',
      chapter: 'Panel',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 9 · Reembolsos Stripe"
            title="Cómo funcionan los reembolsos"
            lede={`El reembolso es automático: el botón Reembolsar llama a Stripe en vivo, no es una promesa de futuro. ` +
              `El dinero vuelve al paciente en su método de pago original (típicamente 3-5 días hábiles). ` +
              `Importante en este MVP: antes de reembolsar, agota el fallback de ${CEA_NAME}.`}
          />
          <div className="grid-2">
            <Card label="Cuándo SÍ reembolsar">
              <ul>
                <li>El paciente lo pide explícitamente.</li>
                <li>Ni la clínica original, ni {CEA_NAME}, ni el marketplace tienen alternativa razonable.</li>
                <li>La clínica cancela y no podemos recolocar (en Cea ni fuera).</li>
                <li>Error nuestro (caso duplicado, datos mal).</li>
              </ul>
            </Card>
            <Card label="Cuándo NO reembolsar" tone="warn">
              <ul>
                <li>Antes de hablar con la clínica — siempre intenta concertar primero.</li>
                <li>
                  <strong>Antes de probar {CEA_NAME}</strong> como fallback (si la especialidad existe allí).
                </li>
                <li>El paciente pide cambiar fecha sin querer cancelar — usa Proponer alternativa.</li>
                <li>Caso fuera del SLA pero ya confirmado — escala a Carlos, no reembolses por defecto.</li>
              </ul>
            </Card>
          </div>
          <Note>
            <strong>Idempotencia:</strong> aunque hagas click dos veces sin querer, Stripe solo emite un refund.
            El caso se marca <code>refunded</code> y el token del paciente queda invalidado.
            Verás el refund también en{' '}
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">dashboard.stripe.com</a>.
          </Note>
        </>
      ),
    },

    /* 10 ────────────────────────────────────────────────────────── */
    {
      id: 'admin-other',
      label: 'Otras áreas del admin',
      chapter: 'Panel',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 10 · Otras áreas del admin"
            title="Lo que vas a tocar menos pero te toca"
            lede="No todo es /admin/ops. Hay cuatro pantallas más que también caen sobre vuestro equipo."
          />
          <div className="grid-2">
            <Card label="/admin/clinic-alta · revisar altas de clínicas">
              <p>
                Cuando una clínica nueva pide darse de alta en <code>/pro/onboarding</code>
                (incluyendo las que entraron por el email de aceptación), su solicitud
                llega aquí. Revisas datos, llamas si hace falta, apruebas o rechazas.
              </p>
              <p>
                <a href={`${PROD_BASE}/admin/clinic-alta`} target="_blank" rel="noopener noreferrer">{`${PROD_BASE}/admin/clinic-alta`}</a>
              </p>
            </Card>
            <Card label="/admin/pro-verifications · verificar profesionales">
              <p>
                Profesionales suben su documentación (colegiación, CIF). Tú revisas el PDF, apruebas,
                rechazas o pides más info. Aprobar desbloquea su panel pro.
              </p>
              <p>
                <a href={`${PROD_BASE}/admin/pro-verifications`} target="_blank" rel="noopener noreferrer">{`${PROD_BASE}/admin/pro-verifications`}</a>
              </p>
            </Card>
            <Card label="/admin/users · gestionar usuarios">
              <p>
                Crear nuevos operadores (rol <code>ops</code>) o admins, desactivar cuentas, ver quién
                tiene qué rol. Solo accesible si tu rol es <code>admin</code>.
              </p>
              <p>
                <a href={`${PROD_BASE}/admin/users`} target="_blank" rel="noopener noreferrer">{`${PROD_BASE}/admin/users`}</a>
              </p>
            </Card>
            <Card label="/admin/reviews · curar reseñas">
              <p>
                Las reseñas de pacientes pasan por moderación. Aquí decides cuáles publicar.
                Bajo prioridad — semanal.
              </p>
              <p>
                <a href={`${PROD_BASE}/admin/reviews`} target="_blank" rel="noopener noreferrer">{`${PROD_BASE}/admin/reviews`}</a>
              </p>
            </Card>
          </div>
        </>
      ),
    },

    /* 11 ────────────────────────────────────────────────────────── */
    {
      id: 'recurring',
      label: 'Tareas recurrentes',
      chapter: 'Operación',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 11 · Tareas recurrentes"
            title="Qué hacer al inicio, durante y al final del turno"
            lede="Horario de operación: L–V 10:00–18:00 Madrid. Fuera de horario los casos esperan al día siguiente (los emails al paciente avisan)."
          />
          <div className="grid-3">
            <MiniCard title="Al inicio del turno">
              Abrir <code>/admin/ops</code>. Revisar casos abiertos del día anterior.
              Revisar <code>/admin/clinic-alta</code> por solicitudes pendientes — especialmente
              las que vienen del email de aceptación a clínicas (alta conversión).
            </MiniCard>
            <MiniCard title="Durante el turno">
              Resolver cada caso entrante en menos de 6 h. Subir vouchers de los sin-seguro.
              Atender llamadas entrantes al {SUPPORT_PHONE}.
            </MiniCard>
            <MiniCard title="Al final del turno">
              Verificar que ningún caso queda en <code>pending_call</code> sin nota.
              Cerrar sesión.
            </MiniCard>
          </div>
          <div className="swimlane" style={{ marginTop: 12 }}>
            <SwimlaneRow
              scenario="Semanal · lunes 10:00"
              steps={[
                { area: 'OPS', text: 'Revisar /admin/pro-verifications' },
                { area: 'OPS', text: 'Revisar /admin/clinic-alta' },
                { area: 'OPS', text: 'Curar reseñas en /admin/reviews' },
                { area: 'OPS', text: 'Reporte rápido a Carlos: casos, refunds, alertas' },
              ]}
            />
          </div>
        </>
      ),
    },

    /* 12 ────────────────────────────────────────────────────────── */
    {
      id: 'escalation',
      label: 'Cuando algo va mal',
      chapter: 'Operación',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 12 · Cuando algo va mal"
            title="A quién avisas, dónde mira el técnico"
            lede="Dos vías de escalación: producto/operativa (Carlos) y técnico (Francisco). Lo que decide cada uno está en slide 4."
          />
          <div className="grid-2">
            <Card label="Escalar a una persona">
              <ul>
                <li>
                  <strong>Carlos (Comercial):</strong> aprobación previa para campañas comerciales,
                  fichaje masivo de clínicas, plantilla del equipo de {TEAM},
                  decisiones que afectan a contratos con clínicas.
                </li>
                <li>
                  <strong>Francisco (Producto + Técnico):</strong>{' '}
                  precios de prioridad, qué aseguradoras admitimos, campañas Google Ads,
                  panel que no carga, botón que falla, email que no llega, refund atascado, cualquier duda técnica.
                </li>
              </ul>
            </Card>
            <Card label="Dónde mira el técnico">
              <ul>
                <li><a href="https://sentry.io" target="_blank" rel="noopener noreferrer">Sentry</a> — errores en vivo.</li>
                <li><a href="https://vercel.com" target="_blank" rel="noopener noreferrer">Vercel</a> — logs del servidor.</li>
                <li><a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">Stripe</a> — pagos y refunds.</li>
                <li><a href="https://resend.com" target="_blank" rel="noopener noreferrer">Resend</a> — entrega de emails.</li>
                <li><a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer">Clerk</a> — usuarios y sesiones.</li>
              </ul>
            </Card>
          </div>
          <Note>
            Si no estás segura de a quién escalar, escala a Francisco primero — él reenruta. Mejor sobre-comunicar que dejar un caso roto.
          </Note>
        </>
      ),
    },

    /* 13 ────────────────────────────────────────────────────────── */
    {
      id: 'tools',
      label: 'Recursos',
      chapter: 'Cierre',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 13 · Recursos"
            title="Atajos a las herramientas que usas"
            lede="Todo en el navegador. Si algo no está en esta lista y lo necesitas a menudo, pídelo y lo añadimos."
          />
          <div className="tools-grid">
            <ToolCard role={TEAM} url={`${PROD_BASE}/admin/ops`} purpose="Casos del día a día" />
            <ToolCard role={TEAM} url={`${PROD_BASE}/admin/clinic-alta`} purpose="Aprobar altas de clínicas" />
            <ToolCard role={TEAM} url={`${PROD_BASE}/admin/pro-verifications`} purpose="Verificar profesionales" />
            <ToolCard role="Admin" url={`${PROD_BASE}/admin/users`} purpose="Gestionar operadores" />
            <ToolCard role="Producto" url={PROD_BASE} purpose="Ver el sitio como un paciente" />
            <ToolCard role="Finanzas" url="https://dashboard.stripe.com" purpose="Stripe · pagos y refunds" />
            <ToolCard role="Email" url="https://resend.com" purpose="Resend · entregas de email" />
            <ToolCard role="Soporte" url="https://dashboard.clerk.com" purpose="Clerk · usuarios" />
            <ToolCard role="Eng" url="https://sentry.io" purpose="Sentry · errores en vivo" />
            <ToolCard role="Eng" url="https://vercel.com" purpose="Vercel · deploys + logs" />
          </div>
          <Note>
            Este manual vive en <code>/internal/ops</code>. Si la URL deja de funcionar, pide a Francisco la nueva clave.
            Si encuentras algo que falta o está mal, escríbelo — actualizamos el manual, no la memoria.
          </Note>
        </>
      ),
    },

    /* 14 ────────────────────────────────────────────────────────── */
    {
      id: 'anexo-flujos',
      label: 'Anexo · Flujos de derivación',
      chapter: 'Anexo',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 14 · Anexo"
            title="Flujos de derivación · paso a paso"
            lede="Esto es el desglose detallado de los 3 flujos donde hay derivación (1 · reserva directa, 2 · interna, 3 · externa). El flujo 4 (alta de clínica) está en slide 10."
          />

          <h3 style={{ marginTop: 8, marginBottom: 6 }}>Flujo 1 · Reserva directa con derivación interna por parte de Ops</h3>
          <div className="swimlane" style={{ marginBottom: 14 }}>
            <SwimlaneRow
              scenario="Camino feliz"
              steps={[
                { area: 'Paciente', text: 'Paga prioridad en /book' },
                { area: 'Sistema', text: 'Crea caso · estado pending_call' },
                { area: 'OPS', text: 'Llama a la clínica original' },
                { area: 'Clínica', text: 'Acepta el hueco' },
                { area: 'Sistema', text: 'Email a paciente + email a clínica con onboarding' },
              ]}
            />
            <SwimlaneRow
              scenario={`Clínica original no puede · fallback a ${CEA_NAME}`}
              steps={[
                { area: 'OPS', text: 'Rechaza la original' },
                { area: 'OPS', text: 'Llama a Cea Bermúdez' },
                { area: 'Cea', text: 'Confirma día/hora si tiene la especialidad' },
                { area: 'OPS', text: 'Botón 🔁 con los datos de Cea' },
                { area: 'Paciente', text: 'Email Aceptar / Reembolsar' },
              ]}
            />
            <SwimlaneRow
              scenario={`Cea tampoco puede · marketplace o reembolso`}
              steps={[
                { area: 'OPS', text: 'Busca en marketplace' },
                { area: 'OPS', text: 'Si hay hueco → botón 🔁' },
                { area: 'OPS', text: 'Si no hay → botón 💸 reembolso' },
                { area: 'Paciente', text: 'Email correspondiente' },
              ]}
            />
          </div>

          <h3 style={{ marginTop: 8, marginBottom: 6 }}>Flujo 2 · Derivación interna (lock-in 60 min)</h3>
          <div className="swimlane" style={{ marginBottom: 14 }}>
            <SwimlaneRow
              scenario="Camino feliz"
              steps={[
                { area: 'Clínica', text: 'Crea derivación interna desde /pro/dashboard' },
                { area: 'Sistema', text: 'Email lock-in 60 min al paciente' },
                { area: 'Paciente', text: 'Acepta y paga prioridad' },
                { area: 'Sistema', text: 'Cita confirmada en /pro/dashboard' },
              ]}
            />
            <SwimlaneRow
              scenario="Lock-in caduca"
              steps={[
                { area: 'Sistema', text: 'Pasan 60 min sin pago' },
                { area: 'Sistema', text: 'Hueco liberado, derivación cancelada' },
                { area: 'Clínica', text: 'Puede reenviar el email · contador resetea' },
              ]}
            />
            <SwimlaneRow
              scenario="Incidencia → entra OPS"
              steps={[
                { area: 'Paciente', text: 'Reclama / paga pero no llega' },
                { area: 'OPS', text: 'Investiga en panel · cierra el caso' },
                { area: 'OPS', text: 'Reembolso si procede' },
              ]}
            />
          </div>

          <h3 style={{ marginTop: 8, marginBottom: 6 }}>Flujo 3 · Derivación externa (clínica a clínica)</h3>
          <div className="swimlane">
            <SwimlaneRow
              scenario="Camino feliz"
              steps={[
                { area: 'Clínica A', text: 'Busca clínica B y crea derivación · lock-in 60 min al paciente' },
                { area: 'Paciente', text: 'Acepta el email y paga la prioridad' },
                { area: 'Sistema', text: 'Crea caso con chip «derivación externa» en /admin/ops' },
                { area: 'OPS', text: 'Llama a Clínica B · confirma hueco · ✓ Aceptar' },
                { area: 'Sistema', text: 'Email al paciente + email a Clínica B con onboarding' },
              ]}
            />
            <SwimlaneRow
              scenario="Clínica B rechaza al teléfono"
              steps={[
                { area: 'Clínica B', text: 'Te dice por teléfono que no puede atender' },
                { area: 'OPS', text: `Botón ✕ Rechazar · fallback a ${CEA_NAME}` },
                { area: 'OPS', text: 'Misma cascada que el flujo 1' },
              ]}
            />
            <SwimlaneRow
              scenario="Clínica B no está dada de alta en Medconnect"
              steps={[
                { area: 'OPS', text: 'Llama igualmente, explica que tiene un paciente pagado' },
                { area: 'OPS', text: '✓ Aceptar si confirma · el email lleva el onboarding' },
                { area: 'Clínica B', text: '3 minutos: alta + IBAN · ya cobra la comisión' },
              ]}
            />
          </div>

          <Note>
            Si una clínica recurrente entra en el fallback de Cea, anótalo. Después de 3 fallos, se conversa
            con Carlos para revisar la concertación.
          </Note>
        </>
      ),
    },
  ];
}

export default function OpsDeck({ credentials }) {
  const slides = buildSlides({ credentials });
  return (
    <DeckShell
      slides={slides}
      brand={{
        mark: 'OAC',
        title: 'Med Connect · Operaciones / AC',
        subtitle: 'Manual de Operaciones / Atención al Cliente',
      }}
    />
  );
}
