# Inventario de proveedores tecnológicos — MedConnect

**Mantenedor:** Francisco Pizarro · **Última revisión manual:** 2026-05-26 · **Próxima revisión:** 2026-06-09 (cada dos lunes).

Este documento es la **fuente única** de qué planes están contratados, qué límites tienen y a partir de qué umbral hay que escalar. Sirve dos cosas:

1. **Referencia humana** — cuando algo se rompa, abre este doc antes de la consola del proveedor.
2. **Input automatizable** — `/api/exec/quotas` lee estos umbrales para colorear el semáforo en el reporte semanal y disparar alertas a >80%.

Convenciones:
- `umbral_alerta = 80% del límite` salvo que se indique otro umbral.
- "Cuenta titular" = quién paga la factura (si aplica) y quién tiene acceso de admin.
- Una fila por servicio. Si cambias plan, **actualiza este doc en el mismo PR** o el endpoint de cuotas mentirá.

---

## 🚦 Semáforo rápido (estado deseado el 28-may-2026)

| Servicio                | Plan                   | Coste/mes | Cuota relevante               | Umbral alerta | Acción a >80%                              |
|-------------------------|------------------------|-----------|-------------------------------|---------------|---------------------------------------------|
| **Azure SQL**           | S0 (10 DTU, 250GB)     | ~13€      | DTU 80% medio, 60 conexiones  | 80% DTU       | Upgrade a S2 (50 DTU, ~62€) — bloqueador F11|
| **Clerk**               | Free                   | 0€        | 10.000 MAU                    | 8.000 MAU     | Pro ($25/mes) — incluye webhooks ilimitados |
| **Stripe**              | Pay-as-you-go          | —         | 1,4% + 0,25€ por tarjeta UE   | spend volumen | Negociar pricing custom > 80k€/mes          |
| **Resend**              | Free                   | 0€        | 3.000 emails/mes, 100/día     | 2.400/mes     | Pro ($20/mes) — 50.000 emails/mes           |
| **Vercel (hosting)**    | Hobby                  | 0€        | 100GB BW, 100k invocations    | 80GB / 80k    | Pro ($20/mes/seat) — 1TB BW, 1M invocations |
| **Vercel Blob**         | Pro (con plan)         | incluido  | 1GB storage incluido          | 800MB         | $0,15/GB extra — escala muy barato          |
| **Sentry**              | Developer              | 0€        | 5.000 errors/mes, 30d retain  | 4.000/mes     | Team ($26/mes) — 50.000 errors, 90d         |
| **Upstash Redis**       | Free                   | 0€        | 10.000 cmds/día, 256MB        | 8.000/día     | Pay-as-you-go ($0,2/100k cmds)              |
| **Anthropic**           | Pay-as-you-go          | variable  | budget interno ~50€/mes       | 40€/mes       | Subir budget, optimizar prompts             |
| **Google Ads**          | Pay-as-you-go          | budget    | 39€/día (4 camps activas)     | 31€/día x 7   | Pausar campañas con CPA > target            |
| **GA4**                 | Free                   | 0€        | 10M events/mes (holgado)      | 8M/mes        | Migrar a GA4 360 (~150k$/año, no aplica)    |
| **Microsoft Clarity**   | Free                   | 0€        | ilimitado, no cap docu        | n/a           | n/a                                         |
| **Cloudflare Turnstile**| Free                   | 0€        | 1M challenges/mes             | 800k/mes      | Sigue siendo free a más volumen             |
| **Telegram Bot**        | Free                   | 0€        | 30 msg/s a un chat            | n/a           | n/a                                         |
| **Svix** (vía Clerk)    | incluido Clerk         | 0€        | webhooks de Clerk             | n/a           | upgrade Clerk lo cubre                      |
| **Dominio medconnect.es**| Vercel / SON DNS      | ~12€/año  | renovación anual              | T-30 días     | Renovar auto desde panel registrador        |
| **GitHub Actions**      | Free (repo privado)    | 0€        | 2.000 min/mes                 | 1.600/mes     | Pago $0,008/min Linux, $0,08/min Windows    |

---

## Detalle por servicio

### Azure SQL Database

- **Tier actual:** S0 (10 DTU, 250GB storage incluido).
- **Coste:** ~13€/mes (zona West Europe).
- **Límites:** 10 DTU sostenidos (saturación visible en queries lentas), 60 conexiones concurrentes (pool de cada Lambda usa hasta 25 — riesgo con >2 Lambdas simultáneas).
- **Consola:** [Azure Portal — saludonai DB](https://portal.azure.com).
- **Cuenta titular:** francisco.pizarro@saludonnet.com (suscripción SON).
- **API métricas:** `SELECT * FROM sys.dm_db_resource_stats` da DTU% últimos 15 min, ventana de 1h.
- **Bloqueador F11 abierto:** subir a S2 (50 DTU, ~62€/mes) antes del 28-may para soportar tráfico de lanzamiento.
- **Plan B (degradación):** si DTU >95% sostenido, considerar Read Scale-Out (S3+).
- **Connection string:** `saludonai.database.windows.net` (`.env.local:AZURE_SQL_*`).

### Clerk

- **Plan actual:** Free Production.
- **Coste:** 0€/mes.
- **Límites:** 10.000 MAU (Monthly Active Users), webhooks: 1 endpoint, sin org features.
- **Consola:** [dashboard.clerk.com](https://dashboard.clerk.com).
- **Cuenta titular:** francisco.pizarro (Google account corporativo).
- **API métricas:** `GET /v1/users?limit=1` devuelve header `X-Total-Count`.
- **Upgrade siguiente:** Pro $25/mes — 10k MAU + $0,02/MAU adicional, webhooks ilimitados, multi-org.
- **Riesgo identificado:** test/live keys gestionadas; live keys ya configuradas (ver memoria `project_clerk_pre_launch`).

### Stripe

- **Plan:** pay-as-you-go (1,4% + 0,25€ por tarjeta EU/EEA; 2,9% + 0,25€ international).
- **Cuotas:** sin cap, modelo transaccional.
- **Consola:** [dashboard.stripe.com](https://dashboard.stripe.com).
- **Cuenta titular:** Saludonnet Spain SL (verificada por CIF).
- **Webhook:** `https://www.medconnect.es/api/stripe/webhook` — secret en `STRIPE_WEBHOOK_SECRET`. Sin secret, los flows de 3-D Secure desincronizan bookings.
- **Riesgo:** mantener TLS válido (Vercel lo gestiona); Stripe avisa por email si el webhook devuelve >5xx.

### Resend

- **Plan actual:** Free.
- **Coste:** 0€/mes.
- **Límites:** 3.000 emails/mes, 100 emails/día por endpoint, 1 dominio verificado.
- **Consola:** [resend.com/emails](https://resend.com/emails).
- **Cuenta titular:** francisco.pizarro@saludonnet.com.
- **Dominio:** **pendiente verificar `medconnect.es`** (bloqueador B2). Hasta entonces se envía desde `onboarding@resend.dev` — deliverability subóptima.
- **Tracking de uso real:** Resend free no expone uso agregado vía API; mantenemos ledger propio (`email_sends` en Azure SQL, una fila por envío). Endpoint `/api/exec/quotas` agrega.
- **Upgrade siguiente:** Pro $20/mes — 50.000 emails/mes, dedicated IPs, custom branded webhooks.

### Vercel (hosting)

- **Plan actual:** Hobby (gratis) sobre proyecto `medconnect` (team `saludonnet-tests-projects`).
- **Coste:** 0€/mes.
- **Límites Hobby:** 100GB bandwidth/mes, 100k function invocations/mes, 10s timeout funciones, 1 build concurrente.
- **Consola:** [vercel.com/saludonnet-tests-projects/medconnect](https://vercel.com).
- **Cuenta titular:** francisco.pizarro@saludonnet.com.
- **Token de deploy:** `VERCEL_TOKEN` (alias "Claude Token 24/4") en `.env.local`.
- **API métricas:** `GET https://vercel.com/api/v6/usage?teamId=...`.
- **Riesgo crítico:** 100GB BW + 100k invocations es muy ajustado para lanzamiento con SEM activo. **Recomendación: upgrade a Pro $20/mes/seat antes del jueves 28** — Hobby es para hobbies, no para producción comercial.
- **Plan B:** si saturas, los siguientes despliegues fallan (no degradación, corte).

### Vercel Blob

- **Plan:** incluido en Hobby (1GB) o Pro (1GB + $0,15/GB).
- **Store actual:** `medconnect-pro-verification` (id `store_0RVx01PEz4jlRjCx`, región fra1).
- **Uso:** documentos de verificación pro + reportes ejecutivos semanales en `/exec-reports/`.
- **Token:** `BLOB_READ_WRITE_TOKEN` (auto-inyectado por Vercel).
- **Métricas:** suma de `list` por carpeta.

### Sentry

- **Plan actual:** Developer (free).
- **Coste:** 0€/mes.
- **Límites:** 5.000 errors/mes, 10k performance units, 30d retention, 1 user.
- **Consola:** [sentry.io](https://sentry.io) — org `o4511302159499265`.
- **DSN:** `https://32a9fd0c02537b46f35ea42460fa64a5@o4511302159499265.ingest.de.sentry.io/4511302161858640`.
- **API métricas:** `GET /api/0/organizations/{org}/stats_v2/?field=sum(quantity)&category=error` mes corriente.
- **Upgrade siguiente:** Team $26/mes — 50.000 errors, 90d retention, alertas avanzadas, Slack integration.
- **Riesgo:** una issue ruidosa (un loop de errors) puede agotar 5k en horas. Configurar alerts a 4k.

### Upstash Redis

- **Plan actual:** Free.
- **Instancia:** `comic-lizard-84136` (región Europa).
- **Límites:** 10.000 cmds/día, 256MB storage, 1.000 cmds/seg.
- **Uso actual:** rate-limit distribuido + dedupe de alertas. Fallback automático a memoria por Lambda si Upstash falla.
- **REST URL:** `https://comic-lizard-84136.upstash.io`.
- **API métricas:** `GET /info` devuelve `total_commands_processed`.
- **Upgrade:** pay-as-you-go ($0,2/100k cmds, $0,25/GB/mes).

### Anthropic

- **Plan:** pay-as-you-go.
- **Modelo en uso:** `claude-opus-4-5` (en `/api/analytics/report` y `/api/exec/weekly-email`).
- **Budget interno:** ~50€/mes (revisar cada lunes en weekly).
- **Riesgo:** un prompt mal cacheado en un loop puede gastar 10€ en minutos. Implementar prompt caching donde sea posible (ver `claude-api` skill).
- **Consola:** [console.anthropic.com](https://console.anthropic.com).

### Google Ads

- **Plan:** pay-as-you-go (4 campañas, 39€/día budget combinado).
- **Account ID:** `AW-18138897481`.
- **Cuenta titular:** francisco.pizarro (Google Ads).
- **Conversion label:** `AQ0GCKHf-6gcEMm4pslD` (booking).
- **Cuotas:** sin cuota técnica; el límite es presupuestario. Alerta si spend semanal > budget x 7 x 1,2 (20% over).
- **API métricas:** Google Ads API (requiere OAuth refresh token + developer token).

### GA4 / Microsoft Clarity / Turnstile / Telegram / Svix

Cuotas muy holgadas, sin riesgo de saturación con tráfico inicial. Check ligero (alive ping) en `/api/exec/quotas`. Si alguno cae, el impacto es:

- **GA4 down** → pérdida de datos analytics 1d (Google los recupera vía buffering).
- **Clarity down** → no session replay (no bloquea UX).
- **Turnstile down** → captchas fallan → forms anti-spam quedan abiertos. Mitigar con server-side rate limit.
- **Telegram down** → notificaciones operativas internas no llegan. Cero impacto user-facing.
- **Svix down** → webhooks Clerk con retraso (Clerk los reintenta).

### Dominio medconnect.es

- **Registrador:** *(verificar — SON DNS / Vercel / OVH?)*. Anotar contacto técnico cuando se confirme.
- **Renovación anual:** alerta T-30 días. Sin renovación = sitio offline.
- **DNS records críticos:** A/CNAME a Vercel, MX a Resend (cuando se verifique), SPF/DKIM/DMARC para deliverability.

### GitHub Actions

- **Plan:** Free (repo privado: 2.000 min/mes Linux, 500MB storage artifacts).
- **Uso esperado:** Lighthouse CI semanal (4 URLs × 2 form factors × ~3 min ≈ 24 min/semana).
- **Margen:** holgado. Solo riesgo si añadimos suites pesadas (Playwright cross-browser).

---

## Cómo se actualiza este doc

1. **Cambias de plan en algún proveedor** → abrir PR que toque este doc en el mismo cambio.
2. **Cada dos lunes** (cadencia revisión manual) — revisar la consola de cada proveedor y actualizar la columna "Uso actual" mentalmente (el endpoint `/api/exec/quotas` automatiza la mayoría, pero conviene verificar manualmente Stripe, Google Ads y Anthropic, donde el coste es lo crítico, no la cuota).
3. **Cuando saltes a un nuevo proveedor** (ej.: Sendgrid en vez de Resend) — añadir fila + crear checker en `src/lib/exec/quotaCheckers/`.

---

## Lo que NO está en este inventario (a propósito)

- **Suscripciones SaaS de uso interno** (Notion, Slack, Linear) — no afectan a producción.
- **OneDrive / SharePoint** (donde vive este repo localmente) — gestionado por SON IT.
- **Office 365 / cuentas de email corporativas** — gestionado por SON IT.
- **DNS upstream del dominio** — depende de cómo SON lo gestione; verificar y documentar separadamente.

---

## Referencias cruzadas

- Runbook si algo se cae: `docs/INCIDENT_RUNBOOK.md`.
- Bloqueadores pre-launch: `MVP_PENDING.md` (B6 rotación secretos, F10 Turnstile widget, F11 Azure SQL tier).
- Métricas vivas: dashboard `/admin/exec` y email diario.
