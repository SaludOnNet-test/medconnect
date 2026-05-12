'use client';

/**
 * /internal/ops — Operations handbook deck.
 *
 * Audience: Raquel (first operator) and future ops team members. Self-service:
 * she opens the URL, reads it cold, and after slide 5 can log into the panel.
 *
 * Structure: welcome → product overview → her role → panel deep-dive → runbooks
 * → secondary admin areas → recurring tasks → escalation → resources.
 *
 * If launch dates, SLA, or commissions move, edit the constants at the top.
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

function CaseStateDiagram() {
  const STATES = [
    { from: 'pending_call', to: 'contacting_clinic', note: 'Ops llama a la clínica' },
    { from: 'contacting_clinic', to: 'confirmed', note: 'la clínica acepta el hueco' },
    { from: 'contacting_clinic', to: 'clinic_proposed_alternative', note: 'propone otro hueco' },
    { from: 'contacting_clinic', to: 'clinic_rejected_searching', note: 'no puede, buscamos otra clínica' },
    { from: 'clinic_rejected_searching', to: 'alternative_clinic_proposed', note: 'encontramos otra clínica' },
    { from: '*', to: 'refunded', note: 'reembolso Stripe desde cualquier estado' },
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

function buildSlides({ credentials }) {
  return [
    /* 1 ─────────────────────────────────────────────────────────── */
    {
      id: 'cover',
      label: 'Bienvenida',
      chapter: 'Apertura',
      render: () => (
        <div className="slide-cover">
          <div className="slide-cover-eyebrow">Med Connect · Manual de Operaciones</div>
          <h1 className="slide-cover-title">
            Todo lo que necesitas para <em>operar el panel de Ops</em>.
          </h1>
          <p className="slide-cover-lede">
            Descripción del producto, los cuatro flujos de Medconnect, tu rol como operadora,
            cómo entrar al panel, los escenarios típicos con su solución, áreas secundarias del admin
            y a quién escalar cuando algo no encaja en este manual.
          </p>
          <div className="slide-cover-meta">
            <div>
              <span className="slide-cover-meta-key">Audiencia</span>
              <span className="slide-cover-meta-val">Equipo de Ops · Raquel</span>
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
              actor="Ops · TÚ"
              title="Concierta la cita"
              links={[
                { href: `${PROD_BASE}/admin/ops`, label: 'Panel de Ops' },
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
            lede="Tú vives en /admin/ops, pero conviene saber de dónde vienen los casos y a dónde van después. Hay cuatro flujos paralelos en el producto:"
          />
          <div className="grid-2">
            <Card label="1 · Reserva directa (paciente paga online)">
              <p>
                El paciente entra a {PROD_BASE.replace('https://', '')}, busca por especialidad+ciudad, paga
                en Stripe → se crea un <strong>caso de Ops</strong> con estado <code>pending_call</code> y
                aparece en tu lista. <strong>Este es el flujo principal que verás tú.</strong>
              </p>
            </Card>
            <Card label="2 · Derivación interna (lock-in)">
              <p>
                Un médico/clínica deriva al paciente a un colega de la misma clínica. Genera un email
                lock-in de 60 min al paciente para aceptar. No pasa por Ops salvo incidencia.
              </p>
            </Card>
            <Card label="3 · Derivación externa">
              <p>
                Una clínica deriva al paciente a otra clínica del marketplace y cobra comisión.
                Tampoco pasa por Ops salvo incidencia o disputa.
              </p>
            </Card>
            <Card label="4 · Alta de clínica">
              <p>
                Una clínica nueva pide darse de alta vía <code>/pro/onboarding</code>. Tú la revisas
                en <code>/admin/clinic-alta</code> (más detalle en slide 10).
              </p>
            </Card>
          </div>
          <Note>
            En analytics el evento <code>book_started</code> ya viene separado por <code>source: direct</code>{' '}
            vs <code>lock_in</code> — útil si Carlos o Guillermo te preguntan de dónde viene un caso.
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
              </ul>
            </Card>
            <Card label="Lo que NO haces (y a quién va)" tone="warn">
              <ul>
                <li>Cambiar precios de la prioridad → Carlos.</li>
                <li>Decidir qué aseguradoras admitimos → Carlos.</li>
                <li>Aprobar campañas de Google Ads → Carlos.</li>
                <li>Tocar el código del panel → Francisco.</li>
                <li>Llamadas masivas a clínicas para fichar nuevas → Guillermo.</li>
                <li>Decisiones de plantilla / horarios del equipo → Guillermo.</li>
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
            <code>clinic_rejected_searching</code> = la clínica dijo no, hay que buscar otra.{' '}
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
            effect="Estado → confirmed. Email de confirmación al paciente con datos de la cita."
          />
          <ActionButton
            icon="🕐"
            name="Proponer alternativa — la clínica ofrece otro hueco"
            when="La clínica no puede el hueco original pero te ofrece otro día/hora."
            effect="Estado → clinic_proposed_alternative. Email al paciente con dos botones: Aceptar / Reembolsar."
          />
          <ActionButton
            icon="✕"
            name="Rechazar — la clínica no puede atender"
            when="La clínica dice no, sin alternativa que ofrecer."
            effect="Estado → clinic_rejected_searching. Te toca buscar otra clínica del marketplace."
          />
          <ActionButton
            icon="🔁"
            name="Buscar otra clínica — encontraste alternativa fuera"
            when="Tras un rechazo, has encontrado otra clínica que sí puede."
            effect="Estado → alternative_clinic_proposed. Email al paciente con dos botones: Aceptar / Reembolsar."
          />
          <ActionButton
            icon="💸"
            name="Reembolsar — no hay alternativa razonable"
            when="No encuentras ninguna clínica disponible o el paciente lo pide."
            effect="Estado → refunded. Stripe refund automático, email al paciente, hueco liberado."
          />
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
            title="Qué hacer en los 6 casos que verás más"
            lede="No necesitas memorizar: vuelve aquí cuando un caso no encaje. Si aparece uno nuevo que no está, anótalo y avísanos para añadirlo."
          />
          <div className="grid-2">
            <Runbook
              scenario="A · Clínica acepta tal cual"
              signal="Estás llamando, la clínica te dice «sí, ese hueco está libre, lo apunto»."
              action="Botón ✓ Aceptar. Estado → confirmed."
              emailHint="Email automático de confirmación al paciente."
            />
            <Runbook
              scenario="B · Clínica propone otro hueco"
              signal="«El martes a las 11 no, pero le ofrezco miércoles 09:30»."
              action="Botón 🕐 Proponer alternativa. Anotas el nuevo día/hora en el formulario."
              emailHint="El paciente recibe email con botones Aceptar / Reembolsar. No tienes que llamarle, lo decide él."
            />
            <Runbook
              scenario="C · Clínica dice no sin alternativa"
              signal="«No tenemos huecos esta semana ni la próxima»."
              action="Botón ✕ Rechazar. La pantalla te lleva al buscador para encontrar otra clínica."
              emailHint="Aún no se envía email — esperas a tener alternativa."
            />
            <Runbook
              scenario="D · Alternativa encontrada fuera"
              signal="Has confirmado un hueco en otra clínica del marketplace."
              action="Botón 🔁 Buscar otra clínica. Eliges la nueva clínica y el hueco."
              emailHint="Email al paciente con Aceptar / Reembolsar."
            />
            <Runbook
              scenario="E · Clínica no contesta"
              signal="Tres intentos en 2 horas sin respuesta."
              action="Anota en el log del caso, vuelve a llamar al día siguiente. Si pasan 24 h, escalar a Guillermo."
              emailHint="Si no aparece la clínica al final del SLA, reembolsar y avisar al paciente con explicación."
            />
            <Runbook
              scenario="F · Paciente pide reembolso directo"
              signal="El paciente llama o escribe pidiendo cancelar antes de que confirmes."
              action="Botón 💸 Reembolsar. Anota el motivo en el formulario."
              emailHint="Stripe refund automático + email de confirmación al paciente."
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
            lede="El reembolso es automático: el botón Reembolsar llama a Stripe en vivo, no es una promesa de futuro. El dinero vuelve al paciente en su método de pago original (típicamente 3-5 días hábiles)."
          />
          <div className="grid-2">
            <Card label="Cuándo SÍ reembolsar">
              <ul>
                <li>El paciente lo pide explícitamente.</li>
                <li>No hay alternativa razonable de fecha/hora.</li>
                <li>La clínica cancela y no podemos recolocar.</li>
                <li>Error nuestro (caso duplicado, datos mal).</li>
              </ul>
            </Card>
            <Card label="Cuándo NO reembolsar" tone="warn">
              <ul>
                <li>Antes de hablar con la clínica — siempre intenta concertar primero.</li>
                <li>El paciente pide cambiar fecha sin querer cancelar — usa Proponer alternativa.</li>
                <li>Caso fuera del SLA pero ya confirmado — escala a Guillermo, no reembolses por defecto.</li>
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
            lede="No todo es /admin/ops. Hay tres pantallas más que también caen sobre Ops."
          />
          <div className="grid-2">
            <Card label="/admin/clinic-alta · revisar altas de clínicas">
              <p>
                Cuando una clínica nueva pide darse de alta en <code>/pro/onboarding</code>, su solicitud
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
              Revisar <code>/admin/clinic-alta</code> por solicitudes pendientes.
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
                { area: 'Ops', text: 'Revisar /admin/pro-verifications' },
                { area: 'Ops', text: 'Revisar /admin/clinic-alta' },
                { area: 'Ops', text: 'Curar reseñas en /admin/reviews' },
                { area: 'Ops', text: 'Reporte rápido a Guillermo: casos, refunds, alertas' },
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
            lede="Tres tipos de escalación: producto/negocio, ops/clínicas, técnico. Cada uno tiene un dueño claro."
          />
          <div className="grid-2">
            <Card label="Escalar a una persona">
              <ul>
                <li><strong>Carlos (Comercial):</strong> precio de prioridad, aseguradoras, campañas, Trustpilot.</li>
                <li><strong>Guillermo (Operaciones):</strong> incidencia con clínica recurrente, plantilla, horarios, contratos.</li>
                <li><strong>Francisco (Técnico):</strong> el panel no carga, un botón falla, un email no llega, un refund se atascó.</li>
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
            <ToolCard role="Ops" url={`${PROD_BASE}/admin/ops`} purpose="Casos del día a día" />
            <ToolCard role="Ops" url={`${PROD_BASE}/admin/clinic-alta`} purpose="Aprobar altas de clínicas" />
            <ToolCard role="Ops" url={`${PROD_BASE}/admin/pro-verifications`} purpose="Verificar profesionales" />
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
  ];
}

export default function OpsDeck({ credentials }) {
  const slides = buildSlides({ credentials });
  return (
    <DeckShell
      slides={slides}
      brand={{ mark: 'OP', title: 'Med Connect · Ops', subtitle: 'Manual de Operaciones' }}
    />
  );
}
