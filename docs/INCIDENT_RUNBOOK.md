# Runbook de incidentes — MedConnect

**Audiencia:** Francisco Pizarro (responsable) + ops on-call. **Última revisión:** 2026-05-26.

Lo que este doc pretende: cuando algo se rompa a las 22:30 de un sábado, abrir este doc y saber **qué mirar**, **qué hacer ya** y **qué decir a quién** sin pensar. Cada sección sigue el mismo esquema:

> **Síntoma** observable · **Verificación rápida** (curl/dashboard) · **Acción inmediata** (degradar/banner/fallback) · **Comunicación** (a clínicas, a pacientes) · **Recuperación** · **Contacto soporte**.

Si el proveedor afectado no está aquí, añade una sección. Si la verificación rápida tardó más de 2 minutos, escríbela en su entrada — la próxima vez te ahorras esos minutos.

Inventario de planes y umbrales: `docs/PROVIDERS_INVENTORY.md`.

---

## 🆘 Antes de empezar — comandos universales

```bash
# Estado de la app en Vercel
curl -fsS https://www.medconnect.es/api/health || echo "API DOWN"

# Estado de la DB (si /api/health existe)
curl -fsS https://www.medconnect.es/api/exec/quotas?secret=$EXEC_REPORT_SECRET | jq

# Logs recientes Vercel
vercel logs --follow medconnect

# Último deploy
gh run list -L 5
```

Banner de incidencia (cambiar `INCIDENT_BANNER` en Vercel env vars y redeploy ≤2 min):
- `INCIDENT_BANNER=on` → muestra aviso encima del header en todo el sitio.
- Editar texto en `src/components/IncidentBanner.js` (crear si no existe; ver tarea pendiente).

---

## 1. Azure SQL Database — caído o saturado

**Síntoma:** `/api/admin/bookings`, `/admin/ops`, búsquedas de clínica devuelven 500 o tardan >10 s. Sentry recibe `ConnectionError` / `ETIMEOUT` / `Failed to connect`.

**Verificación rápida:**
- [Azure Portal → saludonai → Overview](https://portal.azure.com) — ¿estado "Online"? ¿DTU% al 100%?
- Query desde Azure Data Studio: `SELECT TOP 1 1 FROM sys.tables`.
- `curl https://www.medconnect.es/api/exec/quotas` — busca `azureSql.status`.

**Acción inmediata:**
1. Si **estado != Online** o serverless en pausa: en Azure Portal forzar "Resume". Auto-pausa puede tardar 30s en despertar — `src/lib/db.js:66-74` ya reintenta una vez.
2. Si **DTU 100% sostenido**: escalar tier en caliente (S0 → S2, ~3 min de switch sin downtime). Coste: ~50€/mes adicional.
3. Si **conexiones max alcanzadas**: matar conexiones idle desde `SELECT session_id FROM sys.dm_exec_sessions WHERE is_user_process = 1 AND last_request_end_time < DATEADD(minute,-10,SYSDATETIMEOFFSET())` → `KILL <session_id>`.

**Comunicación:**
- **Pacientes:** activar banner "Estamos teniendo problemas técnicos, vuelve en 10 minutos". Sin contacto proactivo.
- **Clínicas con bookings pendientes hoy:** email manual desde Resend si la incidencia supera 1h.
- **No tocar** redes sociales hasta resolución (no genera ruido externo).

**Recuperación:**
- Verificar `/api/admin/bookings` carga.
- Mirar Sentry: la curva de errores debe caer en <5 min tras la acción.
- Anotar root cause en `docs/INCIDENT_LOG.md` (crear si no existe — un post-mortem por línea).

**Soporte:** Azure Support desde portal (plan SON corporativo da SLA 8h business).

---

## 2. Stripe — webhook caído o pagos fallando

**Síntoma:** pacientes pagan y no reciben confirmación. Bookings quedan en estado `pending_payment`. Sentry: `Stripe signature verification failed` o `Stripe API error`.

**Verificación rápida:**
- [dashboard.stripe.com → Developers → Webhooks](https://dashboard.stripe.com/webhooks) — ¿endpoint healthy? ¿últimos 50 entregas con 2xx?
- [Stripe Status](https://status.stripe.com).
- `curl https://www.medconnect.es/api/stripe/webhook` (debe devolver 405, no 500).

**Acción inmediata:**
1. Si **signature failed**: confirmar `STRIPE_WEBHOOK_SECRET` en Vercel env vars coincide con el secret del endpoint en Stripe dashboard. Si está vacío → bloqueador F10 abierto, cerrar antes del lanzamiento.
2. Si **Stripe down (status page roja)**: desactivar checkout temporalmente via flag `CHECKOUT_DISABLED=1` en Vercel + redeploy. Banner: "Pagos temporalmente no disponibles, vuelve en 30 min".
3. Si **webhooks atrasados**: Stripe los reintenta automáticamente hasta 3 días. Forzar reentrega manual desde dashboard → botón "Resend" en cada evento.

**Comunicación:**
- **Pacientes con pago fallido:** Stripe ya les envía email automático. No duplicar.
- **Pacientes con booking pending:** una vez recuperado, el cron de reconciliación (a implementar — ver TODO) los emparejará automáticamente.

**Recuperación:**
- Verificar `SELECT COUNT(*) FROM bookings WHERE status='pending_payment' AND created_at > DATEADD(hour,-1,SYSDATETIMEOFFSET())` baja a 0.

**Soporte:** Stripe email support (24h business).

---

## 3. Clerk — login caído

**Síntoma:** pros y admins no pueden hacer sign-in. Página /sign-in muestra spinner infinito o error. Sentry: `Clerk session error`.

**Verificación rápida:**
- [dashboard.clerk.com → API logs](https://dashboard.clerk.com).
- [Clerk Status](https://status.clerk.com).

**Acción inmediata:**
1. Si **Clerk down**: el sitio sigue accesible para pacientes (sin sign-in requerido para flujo principal). Mostrar banner "Acceso de profesionales temporalmente no disponible".
2. Si **rate limit Clerk** (poco probable en free): contactar soporte para subir caps.
3. Si **dominio personalizado caído** (`clerk.medconnect.es`): verificar DNS CNAME en panel del registrador.

**Comunicación:**
- **Pros**: si la incidencia >2h, email vía Resend a los pros activos avisando.
- **Pacientes**: cero comunicación (no les afecta).

**Recuperación:**
- Sign-in funcional en `/admin/login` y `/pro/sign-in`.

**Soporte:** Clerk Discord + soporte por email (lento en Free; razón adicional para upgrade a Pro).

---

## 4. Resend — emails no llegan

**Síntoma:** confirmaciones de booking, magic links, alertas operativas no se entregan. Sentry: `Resend error 429` (rate limit) o `Resend error 403` (domain unverified).

**Verificación rápida:**
- [resend.com/emails](https://resend.com/emails) — ¿últimos envíos en "delivered"?
- [Resend Status](https://status.resend.com).
- Test: `curl -X POST /api/admin/test-email?to=...&secret=...` (crear si no existe).

**Acción inmediata:**
1. Si **429 rate limit**: estamos cerca del cap de 100/día. Verificar en dashboard, considerar upgrade Pro inmediato (auto-billing, activa al instante).
2. Si **403 domain unverified**: B2 abierto. Mientras: el sistema cae a mock mode (`src/lib/email.js:26-35`), los emails NO se envían pero sí se loguean en consola. **Riesgo:** confirmaciones perdidas.
3. Si **Resend down**: encolar emails en DB (`email_outbox` table) y reintentar cuando vuelva. Pendiente implementar; hoy se pierden silenciosamente.

**Comunicación:**
- **Pacientes con booking sin email:** revisar log de bookings + enviar manualmente desde Gmail si hace falta (no escalable >10 casos).

**Recuperación:**
- Verificar primer envío real tras la incidencia llega al buzón propio.

**Soporte:** Resend support por email (rápido, < 4h).

---

## 5. Vercel — site caído o deploy roto

**Síntoma:** `medconnect.es` devuelve 500/502 universalmente, o último deploy falló en GitHub Actions.

**Verificación rápida:**
- [Vercel Status](https://www.vercel-status.com).
- [vercel.com/.../medconnect/deployments](https://vercel.com) — último deploy en "Ready"?
- `vercel logs medconnect`.

**Acción inmediata:**
1. Si **deploy roto**: rollback inmediato — `vercel rollback <previous-deployment-url>` o desde dashboard "Promote to Production".
2. Si **Vercel infrastructure down**: no hay acción, esperar. Status page actualiza.
3. Si **bandwidth/invocations saturado (Hobby plan)**: upgrade Pro al instante desde dashboard. Hobby corta hard, sin gracia.

**Comunicación:**
- **Banner status page propio** (a futuro: status.medconnect.es).
- Si **>30 min**: nota breve en redes sociales propias.

**Recuperación:**
- Verificar home + `/search-v2` + `/book` cargan.
- Mirar Sentry: tasa de errores debe caer.

**Soporte:** Vercel chat (lento en Hobby, instantáneo en Pro).

---

## 6. Sentry — sin captura de errores

**Síntoma:** Sentry deja de recibir issues. Probable cap de 5k/mes alcanzado a mediados de mes.

**Verificación rápida:**
- [sentry.io/organizations/.../stats](https://sentry.io) — barra de uso vs cuota.

**Acción inmediata:**
1. **Identificar issue ruidosa** (una sola issue puede consumir 60% del cap). Resolverla o silenciarla con `Sentry.ignoreError(...)`.
2. **Upgrade a Team** ($26/mes) si la app es genuinamente activa. Mejor pagarlo que volar ciego.

**Comunicación:** ninguna externa. Riesgo es interno (ceguera ante bugs).

**Recuperación:** verificar nuevo error de prueba llega a Sentry.

---

## 7. Upstash Redis — rate-limit degradado

**Síntoma:** rate-limit cae a memoria por Lambda (no distribuida). Visible en logs como `[rateLimit] falling back to in-memory`.

**Impacto:** ataques distribuidos podrían pasar el rate-limit (cada Lambda cuenta por separado).

**Acción inmediata:**
1. Verificar [console.upstash.com](https://console.upstash.com) — ¿status del DB?
2. Si **cuota agotada** (10k cmds/día): pagar pay-as-you-go ($0,2/100k cmds) o esperar reset diario.
3. Mientras: app sigue funcionando. Solo el rate-limit es menos efectivo.

**Comunicación:** ninguna externa.

---

## 8. Vercel Blob — uploads fallando

**Síntoma:** subidas de docs de verificación pro o PDFs ejecutivos fallan. Sentry: `Blob upload error`.

**Verificación rápida:**
- `BLOB_READ_WRITE_TOKEN` presente en Vercel env vars (bloqueador H12).
- [Vercel Blob → storage](https://vercel.com) — uso <1GB.

**Acción inmediata:**
1. Si **token faltante**: copiar desde Vercel Storage → Blob → `medconnect-pro-verification`.
2. Si **storage lleno**: cleanup de docs antiguos o pagar overage ($0,15/GB, muy barato).

---

## 9. Anthropic — reportes IA sin generar

**Síntoma:** sección "resumen ejecutivo" del weekly llega vacía o con error.

**Verificación rápida:**
- `ANTHROPIC_API_KEY` presente y no caducado.
- [console.anthropic.com → usage](https://console.anthropic.com) — ¿budget agotado?

**Acción inmediata:**
1. El weekly debe **degradar grácilmente**: si Anthropic falla, enviar el reporte sin el resumen (con un placeholder "resumen IA no disponible esta semana"). No bloquear el envío del resto del email.
2. Si **budget agotado**: subir budget desde dashboard o esperar al siguiente ciclo.

**Comunicación:** ninguna externa.

---

## 10. Google Ads — campañas pausadas o spend descontrolado

**Síntoma:** sin tráfico SEM (campañas pausadas por billing) o spend dispara CPA por encima de target.

**Verificación rápida:**
- [ads.google.com → Campaigns](https://ads.google.com).
- Sección SEM del weekly muestra alertas calculadas (CTR<2%, CPC>5€, 0 conv >50 clicks).

**Acción inmediata:**
1. Si **billing failed**: actualizar tarjeta en Google Ads → reactivar campañas.
2. Si **CPA descontrolado**: pausar campaña afectada inmediatamente, revisar keywords (probable match type "Broad" trayendo basura).

---

## 11. Fuga de credenciales (secret leak)

**Síntoma:** credencial publicada (commit, log, screenshot, dashboard compartido).

**Acción inmediata (en este orden, sin pausa):**
1. **Rotar el secret afectado** en la consola del proveedor.
2. **Actualizar `.env.local` localmente y env vars en Vercel**.
3. **Redeploy producción** para que tome el nuevo secret.
4. **Si fue commiteado a git**: `git rev-list --all | xargs git grep <secret>` para confirmar, luego `BFG Repo-Cleaner` o `git filter-repo` para reescribir historia. Force-push (requiere confirmación explícita, ver `.claude/rules/`).
5. Revisar audit logs del proveedor por uso sospechoso entre la fecha de la fuga y la rotación.

**Comunicación:**
- Si **datos de paciente accesibles** vía la fuga → AEPD notification (RGPD art. 33) en 72h.
- Si **solo internas** (claves API): comunicación interna a SON IT.

---

## Plantilla para añadir un proveedor nuevo

Copia esta plantilla cuando integres un nuevo servicio:

```markdown
## N. <Proveedor> — <síntoma corto>

**Síntoma:** ...

**Verificación rápida:**
- ...

**Acción inmediata:**
1. ...

**Comunicación:**
- ...

**Recuperación:** ...

**Soporte:** ...
```

---

## Lo que ESTE doc NO cubre

- **Bugs específicos de producto** (un flujo concreto roto) — esos van a Sentry + issue tracker, no aquí.
- **Roturas de tests CI** — runbook de CI debe vivir junto al pipeline.
- **Incidencias regulatorias** (AEPD, requerimientos legales) — escalado a SON Legal.
- **Disputas de pago** (Stripe disputes/chargebacks) — proceso comercial, no técnico.
