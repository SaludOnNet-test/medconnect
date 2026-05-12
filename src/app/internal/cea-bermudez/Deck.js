'use client';

/**
 * /internal/cea-bermudez — Handbook for Centro Médico Cea Bermúdez.
 *
 * Two-part deck:
 *   - Part 1 (slides 2–6): manager overview for Arita — business model,
 *     commissions, reports, escalation.
 *   - Part 2 (slides 7–18): operational manual for whoever sits at the
 *     frontdesk — login, dashboard tour, each of the three flows in
 *     step-by-step form, common problems and answers, daily routine.
 *
 * Arita keeps both parts; she hands Part 2 to her receptionist.
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
} from '../_deck/components';

const PROD_BASE = 'https://www.medconnect.es';
const SUPPORT_PHONE = '+34 91 197 70 52';

function Step({ n, title, body }) {
  return (
    <li className="board-card" style={{ marginBottom: 8, listStyle: 'none' }}>
      <div className="board-card-label">Paso {n} · {title}</div>
      <div className="board-card-body" style={{ paddingTop: 4 }}>{body}</div>
    </li>
  );
}

function Problem({ symptom, solution }) {
  return (
    <div className="board-card" style={{ marginBottom: 10 }}>
      <div className="board-card-label">Problema · {symptom}</div>
      <div className="board-card-body" style={{ paddingTop: 4 }}>
        <p style={{ margin: 0 }}><strong>Solución:</strong> {solution}</p>
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
          <div className="slide-cover-eyebrow">Med Connect · Centro Médico Cea Bermúdez</div>
          <h1 className="slide-cover-title">
            Manual de uso de Medconnect para <em>Cea Bermúdez</em>.
          </h1>
          <p className="slide-cover-lede">
            Este documento tiene dos partes. La primera (5 diapositivas) es la visión de gerencia para Arita:
            qué es Medconnect, qué cobra Cea, qué ve en el dashboard, a quién contactar. La segunda (12 diapositivas)
            es el manual operativo paso a paso para quien se siente en la recepción.
          </p>
          <div className="slide-cover-meta">
            <div>
              <span className="slide-cover-meta-key">Para</span>
              <span className="slide-cover-meta-val">Arita + recepcionista</span>
            </div>
            <div>
              <span className="slide-cover-meta-key">Producto</span>
              <span className="slide-cover-meta-val">{PROD_BASE.replace('https://', '')}</span>
            </div>
            <div>
              <span className="slide-cover-meta-key">Soporte</span>
              <span className="slide-cover-meta-val">{SUPPORT_PHONE}</span>
            </div>
          </div>
        </div>
      ),
    },

    /* 2 ─────────────────────────────────────────────────────────── */
    {
      id: 'what-is',
      label: 'Qué es Medconnect',
      chapter: 'Para Arita',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 2 · Para Arita"
            title="Qué es Medconnect y por qué Cea Bermúdez está dentro"
            lede="Medconnect es un marketplace de citas prioritarias. El paciente paga una tarifa (desde 4,99 €) por conseguir cita rápida en una clínica que ya está concertada con su seguro. La consulta sigue cubierta por el seguro; lo que cobramos es la prioridad."
          />
          <div className="diagram-flow">
            <Stage
              number="1"
              actor="Paciente"
              title="Busca y paga"
              body="Entra a la web, busca por especialidad y ciudad, paga la tarifa de prioridad."
            />
            <Arrow />
            <Stage
              number="2"
              actor="Ops"
              title="Concierta"
              body="Llama a la clínica (Cea Bermúdez, por ejemplo) para confirmar el hueco."
            />
            <Arrow />
            <Stage
              number="3"
              actor="Cea Bermúdez"
              title="Atiende"
              body="Recibe al paciente bajo su póliza, factura la consulta a su seguro."
            />
          </div>
          <Note>
            Para Cea esto significa <strong>tres fuentes de ingreso adicionales</strong>: comisión por reservas
            propias hechas desde recepción, comisión por derivaciones a otras clínicas cuando Cea no puede atender,
            y los pacientes que llegan vía medconnect.es porque Cea aparece en su cuadro médico.
          </Note>
        </>
      ),
    },

    /* 3 ─────────────────────────────────────────────────────────── */
    {
      id: 'business-model',
      label: 'Modelo de negocio',
      chapter: 'Para Arita',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 3 · Modelo de negocio para Cea"
            title="Los 3 flujos que usaréis"
            lede="No son alternativos: los tres pueden estar activos a la vez en la recepción. Cada uno tiene su propia mecánica de cobro."
          />
          <div className="grid-3">
            <MiniCard title="1 · Vender huecos propios">
              La recepcionista entra al panel y crea una reserva para uno de los médicos de Cea Bermúdez.
              El paciente paga su tarifa de prioridad. Comisión a Cea por reserva confirmada.
            </MiniCard>
            <MiniCard title="2 · Derivar a otra clínica">
              Cuando Cea no puede atender (especialidad que no tiene, agenda llena, horario incompatible),
              la recepcionista deriva al paciente a una clínica partner del marketplace. Cea cobra la comisión de derivación.
            </MiniCard>
            <MiniCard title="3 · Recibir de medconnect.es">
              Un paciente reserva online con un médico de Cea Bermúdez → nuestro equipo de Ops llama a Cea
              para confirmar el hueco. La recepcionista solo necesita decir sí/no o proponer otra hora.
            </MiniCard>
          </div>
          <Note>
            Los tres flujos están explicados paso a paso en la <strong>Parte 2</strong> de este manual (slides 9–13),
            que es la que hay que dejar a la persona que se siente en la recepción.
          </Note>
        </>
      ),
    },

    /* 4 ─────────────────────────────────────────────────────────── */
    {
      id: 'commissions',
      label: 'Comisiones y cobros',
      chapter: 'Para Arita',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 4 · Comisiones y cobros"
            title="Cómo gana Cea con Medconnect"
            lede={
              `Solo hay dos tipos de comisión en el sistema (atender y derivar). ` +
              `En cada uno de los tres flujos que usa Cea aplica uno u otro. ` +
              `Toda comisión se devenga solo cuando el paciente se presenta a la cita.`
            }
          />

          <div className="grid-2">
            <Card label="Comisión por ATENDER al paciente" tone="success">
              <p style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#15803d' }}>
                50&nbsp;% del importe de la prioridad
              </p>
              <p style={{ margin: 0, fontSize: 14 }}>
                Cuando un paciente con prioridad pagada se sienta delante de un médico de Cea, Cea gana
                la mitad de lo que pagó. Da igual cómo llegó el paciente: lock-in propio, reenviado por
                otra clínica del marketplace, o reservado online en medconnect.es y enrutado por
                Operaciones / Atención al Cliente.
              </p>
            </Card>
            <Card label="Comisión por DERIVAR a otra clínica">
              <p style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#1a3c5e' }}>
                5&nbsp;€ &nbsp;·&nbsp; 3&nbsp;€
              </p>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>5&nbsp;€</strong> si la cita es en las primeras 2 semanas,
                {' '}<strong>3&nbsp;€</strong> entre 2 y 4 semanas. Pago fijo por derivación confirmada en
                otra clínica. Sin derivación externa (cuando Cea es la que atiende), no hay comisión de
                derivar — es solo la parte de aceptar.
              </p>
            </Card>
          </div>

          <Card label="Qué le toca a Cea en cada uno de los 3 flujos">
            <ul style={{ paddingLeft: 16, margin: 0 }}>
              <li>
                <strong>Reservas propias (derivación interna)</strong> — Cea deriva y atiende.
                Cobra solo <strong>ATENDER (50&nbsp;%)</strong>. Derivarse a sí misma no añade comisión extra.
              </li>
              <li style={{ marginTop: 6 }}>
                <strong>Derivación externa</strong> — Cea deriva, otra clínica atiende.
                Cobra solo <strong>DERIVAR (5&nbsp;€ / 3&nbsp;€)</strong>.
              </li>
              <li style={{ marginTop: 6 }}>
                <strong>Pacientes que llegan desde medconnect.es</strong> — paciente reserva online con un
                médico de Cea y Operaciones llama para confirmar. Cobra solo <strong>ATENDER (50&nbsp;%)</strong>.
              </li>
            </ul>
            <p style={{ margin: '10px 0 0', fontSize: 13, opacity: 0.85 }}>
              <strong>Ejemplo:</strong> si la prioridad cuesta 9,99 €, Cea gana 5,00 € por atender o 5 € por derivar
              (en la primera semana). En tarifas sin-seguro la prioridad va de 49 € a 169 €, así que el 50 % de aceptar
              escala bastante.
            </p>
          </Card>

          <Note>
            Además, en los tres flujos Cea factura la consulta al seguro del paciente como hasta ahora —
            Medconnect no toca ese cobro, solo gestiona la prioridad y la comisión. Liquidación mensual
            (primera semana del mes siguiente) al IBAN registrado en el alta. Acumulado visible en{' '}
            <code>/pro/dashboard</code> con desglose por <em>atender</em> vs <em>derivar</em>.
          </Note>
        </>
      ),
    },

    /* 5 ─────────────────────────────────────────────────────────── */
    {
      id: 'reports',
      label: 'Reportes',
      chapter: 'Para Arita',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 5 · Reportes"
            title="Lo que ves tú en el dashboard"
            lede="Con la misma cuenta con la que entra la recepcionista (slide 8) tú ves los reportes. No hay un dashboard separado para gerencia — es el mismo /pro/dashboard, pero a ti te interesan los números y a ella las pestañas operativas."
          />
          <div className="grid-2">
            <Card label="Las 4 cifras que vas a mirar">
              <ul>
                <li>
                  <strong>Comisiones acumuladas</strong> — euros totales ganados desde que arrancasteis con
                  Medconnect. Suma de las tres fuentes (reservas propias + derivación externa +
                  pacientes recibidos vía medconnect.es).
                </li>
                <li style={{ marginTop: 6 }}>
                  <strong>Comisiones últimos 30 días</strong> — lo ganado en el último mes móvil. Es el número
                  que más sirve para saber si Medconnect está aportando ingreso real o no.
                </li>
                <li style={{ marginTop: 6 }}>
                  <strong>Pacientes pendientes de confirmar</strong> — lock-ins que la recepcionista ha enviado
                  al paciente pero el paciente aún no ha pagado. El email vale 60 minutos; si no paga, el hueco
                  se libera. Aquí los ves vivos.
                </li>
                <li style={{ marginTop: 6 }}>
                  <strong>Pacientes confirmados y atendidos</strong> — listado de los que ya tienen cita pagada,
                  con fecha, médico y origen (reserva propia / derivación externa / desde medconnect.es).
                </li>
              </ul>
            </Card>
            <Card label="Lo que NO verás">
              <ul>
                <li>
                  Las tarifas que cobra Medconnect al paciente — esa parte no es vuestra.
                </li>
                <li>
                  Datos personales de pacientes que se derivaron a otras clínicas — protección de datos.
                </li>
                <li>
                  Métricas globales del marketplace.
                </li>
                <li>
                  Datos históricos detallados (más de 90 días) — para esos, escríbeme.
                </li>
              </ul>
            </Card>
          </div>
          <Note>
            Si quieres un reporte que no aparece en el dashboard (por médico concreto, por especialidad, por
            aseguradora, un mes específico), <strong>pídemelo a mí, Francisco</strong>. El dashboard tiene los
            agregados básicos; cualquier corte más fino lo saco yo a mano. Datos en el correo en 24 h.
          </Note>
        </>
      ),
    },

    /* 6 ─────────────────────────────────────────────────────────── */
    {
      id: 'contacts-arita',
      label: 'A quién contactar',
      chapter: 'Para Arita',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 6 · A quién contactar"
            title="Dos canales: pacientes vivos a Operaciones, todo lo demás a Francisco"
            lede="Solo hay dos números que recordar. La regla es sencilla: si tienes un paciente esperando ahora mismo y no es un fallo del sistema, llamas a Operaciones / Atención al Cliente. Para todo lo demás (preguntas, consultas, quejas, datos, errores de panel), me escribes a mí."
          />
          <div className="grid-2">
            <Card label="Casos vivos de pacientes → Operaciones / Atención al Cliente">
              <p style={{ margin: '0 0 8px' }}>
                <strong>Raquel</strong> — equipo de Operaciones / Atención al Cliente.
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 14 }}>
                Cuando hay un paciente concreto cuya situación necesita resolverse <em>ya</em> y no es un fallo
                del sistema: refunds, recolocación de huecos, paciente que no aparece en agenda, dudas con un
                caso abierto, escalada operativa. La recepcionista la llama directamente.
              </p>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
                Horario: L–V 10:00–18:00 Madrid. Fuera de horario, los casos esperan al día siguiente.
              </p>
            </Card>
            <Card label="Todo lo demás → Francisco" tone="success">
              <p style={{ margin: '0 0 8px' }}>
                <strong>Francisco</strong> — responsable de producto y tecnología.
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 14 }}>
                Cualquier pregunta, consulta o queja que no sea un paciente vivo: precios de prioridad,
                comisiones, reportes específicos que necesites, propuestas, el panel no carga, un botón falla,
                un email no llega, dudas sobre cómo funciona algo, formación adicional.
              </p>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>
                Tiempo de respuesta objetivo: <strong>4 h en horario laboral</strong>; urgencias por llamada.
                Para temas comerciales abiertos, yo reenruto a Carlos.
              </p>
            </Card>
          </div>
          <Note>
            <strong>En resumen:</strong> ¿hay un paciente concreto esperando? → Raquel (Operaciones / AC).
            ¿No hay paciente concreto, o es un fallo del sistema? → Francisco.
            Si dudas, llámame a mí y yo reenruto.
          </Note>
        </>
      ),
    },

    /* 7 ─────────────────────────────────────────────────────────── */
    {
      id: 'role-receptionist',
      label: 'Tu rol (recepción)',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 7 · Para la recepcionista"
            title="Tu papel en Medconnect"
            lede="A partir de aquí, este manual es para ti. Tu trabajo en Medconnect consiste en tres cosas: vender huecos a pacientes que llegan a la clínica, derivar pacientes a otras clínicas cuando aquí no podemos, y atender llamadas de Ops cuando un paciente reservó online."
          />
          <div className="grid-3">
            <MiniCard title="No tienes que aprender nada nuevo sobre tu trabajo">
              Sigues atendiendo al mismo tipo de paciente. Medconnect solo añade un panel web donde registras
              algunas reservas para que se cobre la prioridad.
            </MiniCard>
            <MiniCard title="No reemplaza tu agenda actual">
              La agenda interna de Cea Bermúdez sigue siendo la que ya usáis. Medconnect es un canal adicional
              para algunos huecos prioritarios.
            </MiniCard>
            <MiniCard title="Tienes una persona detrás de ti">
              Si algo falla en el panel o un paciente reclama, llamas a Ops (Raquel) o escribes a Arita.
              No tienes que resolver tú sola las incidencias.
            </MiniCard>
          </div>
        </>
      ),
    },

    /* 8 ─────────────────────────────────────────────────────────── */
    {
      id: 'login',
      label: 'Cómo entrar',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 8 · Cómo entrar al sistema"
            title="Tu acceso a Medconnect"
            lede="Una sola cuenta para toda la recepción de Cea Bermúdez. Es de Arita pero la usas tú durante el turno."
          />
          <div className="grid-2">
            <Card label="Tus credenciales" tone="success">
              <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                <li><strong>URL:</strong> <a href={`${PROD_BASE}/sign-in`} target="_blank" rel="noopener noreferrer">{`${PROD_BASE}/sign-in`}</a></li>
                <li style={{ marginTop: 8 }}><strong>Email:</strong> <code>{credentials.email}</code></li>
                <li><strong>Contraseña:</strong> <code>{credentials.password}</code></li>
              </ul>
            </Card>
            <Card label="Lo que tienes que hacer">
              <ol style={{ paddingLeft: 16 }}>
                <li>Abre el navegador en <code>{PROD_BASE}/sign-in</code>.</li>
                <li>Email y contraseña de arriba.</li>
                <li>Te lleva directamente a <code>/pro/dashboard</code>.</li>
                <li>Al final del día: arriba a la derecha, &laquo;Cerrar sesión&raquo;.</li>
              </ol>
            </Card>
          </div>
          <Note>
            <strong>Si olvidas la contraseña:</strong> avisa a Arita o a Francisco. No uses &laquo;recordar contraseña&raquo;
            en navegadores compartidos.
            <br />
            <strong>Si la web te pide código por email:</strong> Arita lo recibirá en su buzón — pídeselo.
          </Note>
        </>
      ),
    },

    /* 9 ─────────────────────────────────────────────────────────── */
    {
      id: 'dashboard-tour',
      label: 'Tour del dashboard',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 9 · Tour del dashboard"
            title="Qué hay en /pro/dashboard"
            lede="El dashboard tiene tres pestañas. Cada una corresponde a una situación diferente. Vamos por ellas en orden de uso."
          />
          <div className="grid-3">
            <MiniCard title="⏱️ Lock-ins pendientes">
              Reservas que has creado y están esperando que el paciente acepte el email de confirmación de 60 min.
              Si caducan, vuelves a empezar.
            </MiniCard>
            <MiniCard title="🏥 Derivación interna">
              Reservas para médicos de Cea Bermúdez. Aquí ves las que has creado, su estado y para qué médico.
            </MiniCard>
            <MiniCard title="🌐 Derivación externa">
              Reservas para otras clínicas del marketplace. Aquí ves tus comisiones acumuladas y las derivaciones
              pendientes/completadas.
            </MiniCard>
          </div>
          <Note>
            Si una pestaña aparece vacía es porque aún no has hecho ninguna reserva de ese tipo. Normal el primer día.
          </Note>
        </>
      ),
    },

    /* 10 ────────────────────────────────────────────────────────── */
    {
      id: 'flow-1-own-spots',
      label: 'Flujo 1 · Huecos propios',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 10 · Flujo 1 · Vender un hueco propio"
            title="Paciente que llega a Cea quiere cita rápida con uno de vuestros médicos"
            lede="Tú sabes que el médico tiene un hueco mañana a las 11:00. La agenda interna no se lo daría hasta el jueves. Le ofreces ese hueco bajo Medconnect: paga la prioridad, vosotros le veis mañana."
          />
          <ol>
            <Step n="1" title="Confirma con el paciente que tiene seguro y cuál es">
              Sin seguro también funciona, pero el flujo cambia (paga la consulta completa por tiers). Para huecos
              propios lo natural es paciente con seguro.
            </Step>
            <Step n="2" title="Abre /pro/dashboard, pestaña «Derivación interna»">
              Botón &laquo;Crear reserva&raquo;.
            </Step>
            <Step n="3" title="Rellena: paciente (nombre, email, teléfono), médico, día/hora, especialidad">
              El email del paciente es importante: es donde le va a llegar el enlace para pagar.
            </Step>
            <Step n="4" title="Click «Crear lock-in»">
              El paciente recibe un email con un enlace de 60 minutos para confirmar y pagar la prioridad.
            </Step>
            <Step n="5" title="ANTES de que se vaya el paciente · explícale lo que tiene que hacer y por qué urge">
              <p style={{ margin: '0 0 6px' }}>
                Este paso es el más importante de todos. Si no insistes aquí, la mitad de los lock-ins
                caducan sin convertirse. Díselo claro, con estas palabras o parecidas:
              </p>
              <ul style={{ paddingLeft: 18 }}>
                <li>
                  &laquo;Te acabo de enviar un <strong>email</strong> con un enlace para pagar la prioridad
                  y bloquear este hueco. Mira tu bandeja de entrada ahora, también el spam por si acaso.&raquo;
                </li>
                <li>
                  &laquo;El enlace vale <strong>60 minutos</strong>. Si pulsas el botón, pagas con tarjeta
                  y ya está — el hueco es tuyo y mañana te vemos.&raquo;
                </li>
                <li>
                  &laquo;Si en 60 minutos no lo pagas, el hueco vuelve a estar libre y otro paciente puede
                  cogerlo. Por eso urge.&raquo;
                </li>
                <li>
                  <strong>&laquo;Si tienes cualquier problema — el email no te llega, la tarjeta no
                  funciona, dudas con el pago — llámame o pásate por mostrador y te ayudo en el momento.&raquo;</strong>
                </li>
              </ul>
              <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.85 }}>
                Después: si acepta, pasa a estado &laquo;confirmada&raquo; en tu pestaña, hueco bloqueado,
                tú apuntas en la agenda interna. Si caduca, el hueco vuelve a estar libre.
              </p>
            </Step>
          </ol>
          <Note>
            <strong>Truco:</strong> haz todo el proceso <em>delante</em> del paciente, mientras está en mostrador
            o al teléfono. Así él recibe el email, lo abre en su móvil y paga ahí mismo. El 90% de los lock-ins
            que se confirman se confirman en los primeros 5 minutos — y se confirman porque la recepcionista
            insistió en este paso 5.
          </Note>
        </>
      ),
    },

    /* 11 ────────────────────────────────────────────────────────── */
    {
      id: 'flow-2-external',
      label: 'Flujo 2 · Derivar fuera',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 11 · Flujo 2 · Derivar a otra clínica"
            title="Paciente quiere algo que Cea no puede dar"
            lede="Especialidad que aquí no tenéis, horario que no encaja, agenda saturada. Antes lo perdíais; ahora lo derivas y Cea cobra comisión."
          />
          <ol>
            <Step n="1" title="Identifica qué necesita exactamente">
              Especialidad + ciudad + ventana de tiempo. Cuanto más concreto, mejor el buscador.
            </Step>
            <Step n="2" title="Pestaña «Derivación externa» · botón «Buscar clínica»">
              Te aparece el buscador del marketplace con las clínicas disponibles para esa especialidad+ciudad.
            </Step>
            <Step n="3" title="Eliges clínica y hueco">
              Verás clínicas concertadas con la aseguradora del paciente (si te la indicó). Si no, ve por proximidad.
            </Step>
            <Step n="4" title="Datos del paciente + click «Derivar»">
              Mismo procedimiento que el flujo 1: email/teléfono, lock-in de 60 minutos.
            </Step>
            <Step n="5" title="Avisas al paciente">
              &laquo;Le he buscado hueco en clínica X para mañana. Le ha llegado un email para confirmar y pagar la prioridad.
              Si lo acepta en 1 hora, el hueco es suyo.&raquo;
            </Step>
          </ol>
          <Note>
            <strong>Importante:</strong> esto NO es enviar al paciente a la competencia. Es <em>colaborar</em>:
            Cea cobra comisión, el paciente sale contento con cita, la clínica receptora gana un paciente nuevo.
            Si dudas si derivar o no, hazlo — el paciente prefiere ir a otra clínica con prioridad que esperar 3 semanas en la suya.
          </Note>
        </>
      ),
    },

    /* 12 ────────────────────────────────────────────────────────── */
    {
      id: 'lock-in',
      label: 'El lock-in 60 min',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 12 · El lock-in de 60 minutos"
            title="Cómo funciona el email al paciente"
            lede="Tanto en flujo 1 como en flujo 2, lo que envías al paciente es un «lock-in»: un enlace que vale por 60 minutos. Si lo pulsa y paga dentro de ese plazo, la reserva queda confirmada. Si no, el hueco se libera."
          />
          <FlowSteps
            steps={[
              { label: 'Tú creas la reserva en el panel' },
              { label: 'Sistema manda email al paciente con enlace y temporizador' },
              { label: 'Paciente abre el email, click en enlace, paga Stripe' },
              { label: 'Sistema confirma la reserva en tu panel' },
              { label: 'Hueco bloqueado, tú apuntas en agenda interna de Cea' },
            ]}
          />
          <div className="grid-2">
            <Card label="Cuando caduca y por qué">
              <ul>
                <li>Hora exacta visible en el email: &laquo;válido hasta HH:MM&raquo;.</li>
                <li>Caduca pasados 60 minutos.</li>
                <li>Puedes <strong>reenviar</strong> el email desde tu panel — el contador se reinicia.</li>
                <li>Si caduca tres veces seguidas, probablemente no era un paciente real. Cierra la reserva.</li>
              </ul>
            </Card>
            <Card label="Cancelar antes de tiempo">
              <p>
                Si el paciente se arrepiente o se equivoca, dile que <em>no</em> pulse el enlace. Tú también puedes
                cancelar manualmente desde el panel: pestaña Lock-ins pendientes → botón &laquo;Cancelar&raquo;.
                El hueco queda libre inmediatamente.
              </p>
            </Card>
          </div>
        </>
      ),
    },

    /* 13 ────────────────────────────────────────────────────────── */
    {
      id: 'flow-3-incoming',
      label: 'Flujo 3 · Llamadas de Ops',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 13 · Flujo 3 · Recibir un paciente de medconnect.es"
            title="Llama Raquel (Ops) desde Medconnect"
            lede="Un paciente reservó online con uno de vuestros médicos. Raquel necesita confirmar que el hueco está y que vais a atenderlo. Suele durar 2 minutos."
          />
          <div className="swimlane">
            <SwimlaneRow
              scenario="Llamada típica"
              steps={[
                { area: 'Ops', text: 'Llama desde Medconnect' },
                { area: 'Cea', text: 'Atiendes, anotas el caso' },
                { area: 'Ops', text: 'Te da: paciente, médico, día/hora, seguro' },
                { area: 'Cea', text: 'Confirmas el hueco · o propones otro · o rechazas' },
                { area: 'Ops', text: 'Marca el caso resuelto, manda email al paciente' },
              ]}
            />
          </div>
          <div className="grid-2">
            <Card label="Lo que Ops te va a preguntar">
              <ul>
                <li>Datos del paciente y del médico.</li>
                <li>Día y hora propuestos.</li>
                <li>¿Confirmáis el hueco tal cual?</li>
                <li>Si no, ¿podéis proponer otro día/hora?</li>
                <li>Si no podéis nada, ¿con qué especialidad/médico podríamos derivar?</li>
              </ul>
            </Card>
            <Card label="Lo que tú tienes que decir">
              <ul>
                <li>Si <strong>sí</strong>: &laquo;Confirmado, nos quedamos el hueco.&raquo; — Lo apuntas en la agenda.</li>
                <li>Si <strong>otra hora</strong>: &laquo;Esa no, pero le proponemos X.&raquo; — Ops avisa al paciente.</li>
                <li>Si <strong>no</strong>: &laquo;No podemos esta semana.&raquo; — Ops busca otra clínica.</li>
                <li>Si tienes dudas: pide a Ops que llame en 10 minutos mientras consultas con el médico.</li>
              </ul>
            </Card>
          </div>
          <Note>
            <strong>No tienes que decir sí siempre.</strong> Si la agenda no puede, di que no. Ops está preparada
            para buscar alternativa o reembolsar — no es problema tuyo.
          </Note>
        </>
      ),
    },

    /* 14 ────────────────────────────────────────────────────────── */
    {
      id: 'verification',
      label: 'Verificación clínica',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 14 · Verificación de la clínica"
            title="Si aparece un aviso de verificación pendiente"
            lede="Cuando entras al panel, en la parte superior puede aparecer un aviso amarillo del tipo «verificación pendiente». Es para que Medconnect confirme que la clínica que opera la cuenta es realmente Cea Bermúdez."
          />
          <ol>
            <Step n="1" title="Click en el aviso">
              Se abre un formulario que pide colegiación del médico responsable, CIF, dirección, y un documento PDF
              (puede ser una factura reciente, un certificado de colegiación, etc.).
            </Step>
            <Step n="2" title="Sube los documentos">
              Si los tiene Arita, pídelos. Si no, avisa a Arita y deja la tarea pendiente.
            </Step>
            <Step n="3" title="Click «Enviar»">
              Va a la cola de Ops (Raquel revisa en <code>/admin/pro-verifications</code>).
              Suele resolverse en menos de 24 h laborales.
            </Step>
            <Step n="4" title="Espera el OK">
              Cuando Ops aprueba, el aviso amarillo desaparece. Si pide más info, te llega un email a la cuenta de Arita.
            </Step>
          </ol>
          <Note>
            Mientras la verificación está pendiente puedes seguir creando reservas y derivaciones; el aviso es para
            desbloquear los cobros de comisiones, no para usar el panel.
          </Note>
        </>
      ),
    },

    /* 15 ────────────────────────────────────────────────────────── */
    {
      id: 'daily',
      label: 'Rutina diaria',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 15 · Rutina diaria"
            title="Qué revisar al inicio y al final del turno"
            lede="No tienes que vivir en el panel. Tres revisiones al día son suficientes."
          />
          <div className="grid-3">
            <MiniCard title="Al inicio del turno (5 min)">
              Abre <code>/pro/dashboard</code>. Pestaña Lock-ins: ¿hay alguno a punto de caducar? Avísale al paciente si conviene.
              Pestaña Derivación interna: ¿alguna cita propia hoy que confirmar en agenda?
            </MiniCard>
            <MiniCard title="Durante el turno">
              Sigue tu trabajo habitual. Atiendes Medconnect solo cuando un paciente te pide cita rápida (flujo 1 o 2)
              o cuando llama Raquel (flujo 3).
            </MiniCard>
            <MiniCard title="Al final del turno (3 min)">
              Vuelve al dashboard. ¿Lock-ins pendientes que mañana ya estarán caducados? Decide si reenviar o cerrar.
              Cierra sesión si compartes equipo.
            </MiniCard>
          </div>
        </>
      ),
    },

    /* 16 ────────────────────────────────────────────────────────── */
    {
      id: 'problems',
      label: 'Problemas comunes',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 16 · Problemas comunes"
            title="Lo que va a pasar y cómo resolverlo"
            lede="No memorices: vuelve aquí cuando te toque. Si te pasa algo que no está, anótalo y dínoslo."
          />
          <div className="grid-2">
            <Problem
              symptom="El paciente no responde al email del lock-in"
              solution="Llámale o escríbele tú directamente. Si pasa una hora, reenvía el email desde el panel (botón «Reenviar») — el contador se reinicia 60 min."
            />
            <Problem
              symptom="El hueco que ofreciste ya estaba ocupado"
              solution="Cancela la reserva desde el panel antes de que el paciente pague. Si ya pagó, llama a Ops (Raquel) — ella reembolsa o busca otro hueco."
            />
            <Problem
              symptom="El paciente quiere reembolso"
              solution="Si aún no aceptó el lock-in, simplemente cancelas tú. Si ya pagó, dile que vas a llamar a Ops; reenvías el caso a Raquel y ella emite el refund Stripe."
            />
            <Problem
              symptom="El email no le ha llegado al paciente"
              solution="Revisa que el email esté bien escrito (típico: gmial.com en vez de gmail.com). Si está bien, pídele que mire spam. Reenvía desde el panel — a veces el email tarda 1-2 minutos."
            />
            <Problem
              symptom="Llama un paciente diciendo que la cita no aparece"
              solution="Pídele su nombre/email, búscalo en el panel. Si está allí, dale los datos. Si no, escala a Ops — puede que la reserva esté en otro flujo del que tú no ves."
            />
            <Problem
              symptom="El panel no carga / un botón falla"
              solution="Refresca la página (Ctrl+F5). Si sigue, avisa a Francisco. Mientras tanto, anota la reserva en papel y la metes cuando el panel vuelva."
            />
          </div>
        </>
      ),
    },

    /* 17 ────────────────────────────────────────────────────────── */
    {
      id: 'test-account',
      label: 'Cuenta de prueba',
      chapter: 'Para recepción',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 17 · Cuenta de prueba de Francisco"
            title="Hay otra cuenta mapeada a Cea Bermúdez. NO la uses para reservas reales."
            lede="Francisco (el técnico) tiene una cuenta de Medconnect también asignada a Cea Bermúdez. La usa solo para hacer pruebas del panel sin tocar la operación real. Importante que sepas que existe."
          />
          <div className="grid-2">
            <Card label="Por qué existe">
              <ul>
                <li>Permite a Francisco verificar que cambios en el código no rompen la vista de Cea.</li>
                <li>Permite reproducir bugs que reporte la recepcionista sin tener que pedir su cuenta.</li>
                <li>Permite hacer demos para nuevas funcionalidades antes de activarlas.</li>
              </ul>
            </Card>
            <Card label="Qué tienes que saber" tone="warn">
              <ul>
                <li><strong>Email de la cuenta de prueba:</strong> <code>{credentials.testEmail}</code></li>
                <li>Si ves reservas raras de Francisco en tu panel, son tests — no son pacientes reales.</li>
                <li>Si Francisco te avisa &laquo;voy a hacer una prueba&raquo;, no actúes sobre lo que veas en ese rato.</li>
                <li><strong>Nunca uses esa cuenta tú</strong> para crear reservas reales: las reservas hay que hacerlas siempre desde la cuenta de Arita.</li>
              </ul>
            </Card>
          </div>
          <Note>
            Las reservas creadas desde la cuenta de prueba quedan registradas como de Francisco, no de Cea
            — por eso es importante que toda reserva real salga de la cuenta de Arita (slide 8).
          </Note>
        </>
      ),
    },

    /* 18 ────────────────────────────────────────────────────────── */
    {
      id: 'support',
      label: 'Soporte',
      chapter: 'Cierre',
      render: () => (
        <>
          <SlideHeader
            eyebrow="Slide 18 · Soporte"
            title="A quién avisar cuando algo no encaja en este manual"
            lede="Tres frentes, mismo orden de antes. Llama, no escribas, si es urgente."
          />
          <div className="grid-3">
            <MiniCard title="Para todo lo de Cea">
              <strong>Arita</strong> — directora del centro. Cualquier decisión que afecte a la clínica
              (precio, política, derivaciones a clínicas concretas) pasa por ella.
            </MiniCard>
            <MiniCard title="Para incidencias con pacientes y reservas">
              <strong>Raquel (Ops · Medconnect)</strong> — refunds, casos atascados, pacientes enfadados,
              llamadas confusas, agenda que no encaja con la web.
            </MiniCard>
            <MiniCard title="Para problemas técnicos del panel">
              <strong>Francisco (técnico)</strong> — el panel no carga, un email no llegó, no puedes hacer login,
              un botón da error, &laquo;creo que algo está raro&raquo;.
            </MiniCard>
          </div>
          <Note>
            Este manual vive en <code>/internal/cea-bermudez</code>. Si la URL deja de funcionar, pide a Arita la nueva clave.
            Si encuentras algo confuso o que falta — dilo. Mejoramos el manual, no esperamos que te lo aprendas tú sola.
          </Note>
        </>
      ),
    },
  ];
}

export default function CeaBermudezDeck({ credentials }) {
  const slides = buildSlides({ credentials });
  return (
    <DeckShell
      slides={slides}
      brand={{ mark: 'CB', title: 'Med Connect · Cea Bermúdez', subtitle: 'Manual de uso' }}
    />
  );
}
