# Setup del sistema de reporting ejecutivo

Este documento describe lo necesario para activar el daily email + dashboard `/admin/exec` + checker de cuotas. Si todo está bien, los lunes a las 08:00 de Madrid recibes el primer correo y el dashboard `https://www.medconnect.es/admin/exec` muestra KPIs en vivo.

## Variables de entorno (Vercel project `medconnect`)

Añadir desde [vercel.com → medconnect → Settings → Environment Variables](https://vercel.com), entorno **Production**:

| Variable | Valor sugerido | Obligatorio | Notas |
|---|---|---|---|
| `EXEC_REPORT_TO_EMAIL` | `francisco.pizarro@saludonnet.com` | Sí | Destinatario del daily + weekly. Si no se configura, el daily devuelve 503. |
| `EXEC_REPORT_SECRET` | `openssl rand -hex 32` | Sí | Permite disparos manuales por `?secret=...`. Vercel Cron usa `CRON_SECRET` aparte. |
| `CRON_SECRET` | `openssl rand -hex 32` | Sí | Lo lee Vercel automáticamente y lo inyecta en `Authorization: Bearer ...` de los crons. **Si no está, los crons fallan en 401.** |
| `RESEND_MONTHLY_CAP` | `3000` (free) o `50000` (Pro) | Opcional | Para el checker de cuotas. Default `3000`. |
| `UPSTASH_DAILY_CAP` | `10000` (free) | Opcional | Default `10000`. |
| `SENTRY_API_TOKEN` | personal token con scope `project:read` | Opcional | Sin él, el checker de Sentry queda en estado "error" pero no rompe el resto. Generar en [sentry.io/settings/account/api/auth-tokens/](https://sentry.io/settings/account/api/auth-tokens/). |
| `SENTRY_ORG_SLUG` | tu slug Sentry, p.ej. `saludonnet` | Opcional | Mira la URL del panel Sentry. |
| `SENTRY_MONTHLY_CAP` | `5000` (Developer free) | Opcional | Default `5000`. |
| `CLERK_MAU_CAP` | `10000` (free) | Opcional | Default `10000`. |
| `ANTHROPIC_MODEL` | `claude-opus-4-7` o `claude-sonnet-4-6` | Opcional | Para el resumen IA del weekly (Fase 2). |

Tras añadir las variables: **redeploy producción** para que tomen efecto.

## Migraciones de base de datos

Las tablas nuevas (`clinic_outreach`, `email_sends`) se crean idempotentemente en `/api/db/setup`. Tras el primer despliegue con este código:

```bash
curl -H "x-setup-secret: $DB_SETUP_SECRET" https://www.medconnect.es/api/db/setup
```

Respuesta esperada:
```json
{"success": true, "message": "Schema ready (tables + migrations applied)"}
```

Verifica desde Azure Data Studio:
```sql
SELECT name FROM sys.tables WHERE name IN ('clinic_outreach', 'email_sends');
SELECT COUNT(*) FROM clinic_outreach; -- 0 esperado al inicio
```

## Carga inicial de outreach (1.840 clínicas pendientes)

`docs/CLINICS_AUDIT_REPORT.md` confirma 1.840 clínicas marcadas `PublicadoMarketplace=SI` en el Excel SON que aún no están en BD. El pipeline de outreach debe arrancar con esas filas.

Opciones:

1. **Manual** (recomendado para arrancar pequeño): añadir 10–20 prioritarias desde `/admin/outreach` botón "+ Añadir clínica" durante la primera semana, mientras se valida el flujo.

2. **Script bulk** (cuando esté listo el flujo): crear `scripts/import_clinic_outreach_from_excel.py` que lea `Cuadro Medico SON - 170426.xlsx`, filtre `PublicadoMarketplace=SI`, descarte clínicas ya presentes en `clinics` y haga `INSERT` en `clinic_outreach` con `status='not_contacted'`, `source='excel_son_170426'`, `priority='medium'`. Excluir explícitamente "Cea Bermúdez" (insertar manualmente con `status='accepted'`).

## Pruebas post-deploy

### Daily email — dry run (HTML preview en navegador)
```
https://www.medconnect.es/api/exec/daily-email?secret=<EXEC_REPORT_SECRET>&dryRun=true
```
Debería devolver el HTML del email tal cual se enviará. Si ves todos los KPIs en 0, es porque aún no hay actividad — normal el día del lanzamiento.

### Daily email — envío real
Desde `/admin/exec` haz click en **"✉ Enviar daily ahora"**. Verifica:
- Llega a `EXEC_REPORT_TO_EMAIL`.
- Si `RESEND_FROM_EMAIL` no está verificado, llega desde `onboarding@resend.dev` (modo dev).
- Cuando `medconnect.es` esté verificado en Resend, configurar `RESEND_FROM_EMAIL=MedConnect <noreply@medconnect.es>`.

### Cuotas
```
https://www.medconnect.es/api/exec/quotas?secret=<EXEC_REPORT_SECRET>
```
Espera ver un array de proveedores. Los que aún no tengas credenciales devuelven `ok: false, error: "...not configured"` — eso no rompe nada, solo desaparecen del semáforo.

### Cron Vercel
Tras el deploy, ve a [vercel.com → medconnect → Settings → Cron Jobs](https://vercel.com). Deberías ver listado `/api/exec/daily-email` con schedule `0 6 * * *` (06:00 UTC = 08:00 Madrid en CEST).

Puedes forzar la primera ejecución con el botón "Run" en esa misma página, sin esperar al día siguiente.

### Outreach
1. Navega a `/admin/outreach`.
2. Crea una clínica de prueba (botón **+ Añadir clínica**).
3. Marca como "contactada" desde el row expand. Verifica que los KPIs del header se actualizan.
4. Marca como "aceptada" y confirma que se mueve al filtro correspondiente.

## Cosas que NO se cubren todavía (Fase 2+)

- **Weekly email + PDF en Blob** — pendiente Fase 2.
- **Sección SEM/SEO** — pendiente integración Google Ads API + Search Console API.
- **Alertas en tiempo real** (Sentry webhook → email) — pendiente Fase 2.
- **Resumen IA con Anthropic** — pendiente Fase 2.
- **Lighthouse CI semanal** — pendiente Fase 3.
- **Import bulk de las 1.840 clínicas** — pendiente script Python.

## Troubleshooting

**"401 Unauthorized" al llamar `/api/exec/*`**
- ¿`EXEC_REPORT_SECRET` o `CRON_SECRET` configurado en Vercel?
- ¿Estás logueado en `/admin/login` antes de abrir `/admin/exec`?
- ¿El secret en la URL coincide exactamente con el de Vercel (no espacios, no comillas)?

**Daily email no llega**
- Mirar logs de Vercel: `vercel logs --follow medconnect | grep daily-email`.
- ¿`RESEND_API_KEY` configurado? Sin él, el email se loguea en consola pero no se envía (modo mock).
- ¿`EXEC_REPORT_TO_EMAIL` configurado?
- Ver tabla `email_sends`: `SELECT TOP 5 * FROM email_sends WHERE category='daily_exec' ORDER BY sent_at DESC`.

**Checker de Resend dice "ledger missing"**
- Ejecutar `/api/db/setup` con el header correcto. La tabla `email_sends` se crea allí.

**Dashboard `/admin/exec` muestra "Cargando…" infinito**
- Abrir DevTools → Network. Las llamadas a `/api/exec/business-kpis` y `/api/exec/quotas` deben devolver 200. Si dan 401, ver punto 1.
- Si devuelven 500, mirar logs Vercel — probable error de query SQL en una tabla que aún no migrada.

**"Migration pending — tabla clinic_outreach no existe"**
- `curl -H "x-setup-secret: $DB_SETUP_SECRET" https://www.medconnect.es/api/db/setup` y volver a cargar.
