# Reglas de Deployment - MedConnect

**Última actualización:** 2026-04-25  
**Aprobado por:** Francisco Pizarro  
**Estado:** INAMOVIBLE - Solo cambios con aprobación escrita

---

## REGLA CENTRAL: Proyectos de Vercel Autorizados

### PERMITIDO

**Producción (PRIMARIO - Deployment automático):**
- **Proyecto Vercel:** `medconnect` (SaludOnNet Team)
- **URLs activas:**
  - https://medconnect-bay.vercel.app (Primary)
  - https://medconnect.es (Custom domain - setup pendiente)
- **Trigger:** Auto-deploy en cada push a `main`
- **Cuenta:** SaludOnNet Team (team_dbk3jS52QCB2iPSVl6Sv5VB5)
- **Responsable:** Francisco Pizarro

**Seguridad (ROLLBACK - Solo manual):**
- **Proyecto Vercel:** `prioritamed` (SaludOnNet Team)
- **Propósito:** Punto seguro de revertir si `medconnect` se rompe
- **Trigger:** Solo manual (decisión en emergencia)
- **Responsable:** Equipo de SaludOnNet

### PROHIBIDO

```
❌ NO usar cuenta francisco-4148s-projects
❌ NO usar proyecto rentguard
❌ NO usar otras cuentas Vercel sin aprobación expresa
❌ NO deployar a localhost/staging públicos
❌ NO hacer push --force a branches principales
```

---

## PROCESO DE DEPLOYMENT NORMAL

```
┌─────────────────────────────────────────┐
│ 1. Crear feature branch                  │
│    git checkout -b feature/xxx           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 2. Hacer commits                         │
│    git add . && git commit -m "..."      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 3. Push a remote                         │
│    git push -u origin feature/xxx        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 4. Crear PR en GitHub                   │
│    Descripción + testing checklist       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 5. Review obligatorio (≥1 aprobación)   │
│    Main branch está PROTEGIDA            │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 6. Merge a main (después de aprobación) │
│    GitHub → Vercel (auto-trigger)       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 7. Vercel auto-deploya a producción     │
│    URL: medconnect-bay.vercel.app       │
│    Tiempo: ~2-3 minutos                 │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 8. Verificar en producción              │
│    https://medconnect-bay.vercel.app    │
│    Smoke tests + manual verification    │
└─────────────────────────────────────────┘
```

### Comandos

```bash
# 1. Feature branch
git checkout -b feature/your-feature-name

# 2. Commits
git add .
git commit -m "feat: description of change"

# 3. Push
git push -u origin feature/your-feature-name

# 4. Crear PR en GitHub
# UI: https://github.com/SaludOnNet-test/medconnect/pull/new

# 5. Review + Merge
# (No hacer git push --force)

# 6. Vercel auto-deploya (esperado)
# Ver: https://vercel.com/dashboard/medconnect
```

---

## PROCESO DE ROLLBACK (EMERGENCIA)

**Usar SOLO si `medconnect` está quebrada en producción.**

```
┌─────────────────────────────────────────┐
│ 1. Detectar problema en medconnect      │
│    Usuario reporta | Monitoring alerta  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 2. Decidir rollback a prioritamed       │
│    Equipo decision (min 2 personas)     │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 3. Cambiar DNS (si usa custom domain)   │
│    medconnect.es → prioritamed.vercel.app
│    O cambiar proxy                      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 4. Usuarios redirigidos a prioritamed   │
│    Versión anterior pero FUNCIONAL      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 5. Equipo arregla bug en medconnect     │
│    Merge fix a main cuando ready        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 6. Vercel auto-deploya fix              │
│    Volver DNS a medconnect.vercel.app   │
│    O cambiar proxy                      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 7. Verificar que medconnect funciona    │
│    Usuarios back a medconnect           │
└─────────────────────────────────────────┘
```

---

## RAMA PROTEGIDA: main

### Protecciones activadas

```
Branch rule: main
  ✓ Require pull request reviews before merging
    Minimum required reviewers: 1
  ✓ Dismiss stale pull request approvals when new commits pushed
  ✓ Require status checks to pass before merging
    (Future: Add CI/CD checks)
  ✓ Require branches to be up to date before merging
  ✓ Restrict who can push to matching branches
    Only: SaludOnNet team members
```

### Resultado

- ❌ NO se puede hacer `git push` directamente a `main`
- ❌ NO se puede hacer `git force-push` a `main`
- ✅ REQUIERE pull request + 1 aprobación mínima
- ✅ Merge automático después de aprobación

---

## VARIABLES DE ENTORNO CRÍTICAS

**Archivo:** `.env.local` (DO NOT COMMIT)

### Vercel Token

```
VERCEL_TOKEN=<stored in .env.local — NEVER commit>
→ Debe apuntar a cuenta SaludOnNet Team
→ Válido para: SaludOnNet-test/medconnect proyecto
→ Expiración: N/A (token no tiene expiración)
```

### Base URLs

```
NEXT_PUBLIC_BASE_URL=https://medconnect.es
→ Usada en emails, redirects, etc.
→ Cambiar a medconnect.es cuando DNS esté listo

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
→ Auth redirects (Clerk)
```

---

## CHECKLIST PRE-DEPLOYMENT

Antes de hacer merge a `main` y deployar:

- [ ] Código compilable (`npm run build` success)
- [ ] No hay TypeScript errors
- [ ] Tests pasan (si existen)
- [ ] Eslint/Prettier sin warnings
- [ ] Variables de entorno están en `.env.local`
- [ ] No hay console.error() o console.log() de debug
- [ ] No hay credenciales en código
- [ ] PR tiene descripción clara
- [ ] ≥1 aprobación de review
- [ ] Smoke test en local: `npm run dev` funciona

---

## CHECKLIST POST-DEPLOYMENT

Después de que Vercel haya desplegado:

- [ ] Sitio carga en https://medconnect-bay.vercel.app
- [ ] Sin errores en browser console
- [ ] Sin 500 errors en backend
- [ ] APIs responden (ej: GET /api/clinics/search)
- [ ] Auth funciona (sign-in)
- [ ] Búsqueda de clínicas funciona
- [ ] Slots se muestran en tarjetas
- [ ] Modal de booking abre sin errores
- [ ] Performance es aceptable (<3s load)

Si alguno falla → ROLLBACK a prioritamed inmediatamente.

---

## MONITOREO

### URLs de Monitoreo

- **Vercel Dashboard:** https://vercel.com/dashboard/medconnect
  - Ver últimos deploys, build logs, errors
  
- **medconnect-bay.vercel.app:** Check availability + performance

- **GitHub Actions:** https://github.com/SaludOnNet-test/medconnect/actions
  - Ver CI/CD checks (cuando se agreguen)

### Alertas

Configurar (future):
- [ ] Slack notification on deploy failure
- [ ] Email to Francisco Pizarro on 5xx errors
- [ ] Vercel analytics monitoring

---

## DOMINIOS PERSONALIZADOS

### medconnect.es (Setup Pendiente)

**Estado:** En configuración  
**Blockers:** DNS setup + Clerk domain verification

**Pasos para activar:**

1. **DNS Setup (Registrador)**
   ```
   A record: medconnect.es → vercel.com (Vercel auto-assigns IP)
   o CNAME: medconnect.es → cname-europe.vercel.com
   
   Comando verificación:
   nslookup medconnect.es
   ```

2. **Clerk Configuration**
   - Ir a https://dashboard.clerk.com → App → Settings → Domains
   - Agregar `medconnect.es`
   - Completar DKIM/SPF verification

3. **Resend Email Setup**
   - Ir a https://resend.com → Domains
   - Agregar `noreply@medconnect.es`
   - Completar SPF/DKIM/MX records

4. **Vercel Configuration**
   - Ir a https://vercel.com → medconnect → Settings → Domains
   - Agregar dominio
   - Validar DNS

5. **Test**
   ```bash
   curl -I https://medconnect.es
   → HTTP 200 OK
   
   curl -I https://www.medconnect.es
   → Redirect a https://medconnect.es
   ```

---

## AUTORIZACIÓN DE CAMBIOS

**Esta regla es INAMOVIBLE.**

Cualquier cambio en:
- Proyectos Vercel autorizados
- Dominios
- Branch protection rules
- Deploy process

**Requiere:**
1. Pull request documentando cambio
2. Aprobación escrita de Francisco Pizarro
3. Actualización de este documento
4. Comunicación al equipo

---

## FAQ

### P: ¿Puedo deployar a `prioritamed` en desarrollo?
**R:** No. `prioritamed` es SOLO para rollback en emergencia. Usa `npm run dev` localmente.

### P: ¿Qué pasa si me equivoco y hago `git push --force`?
**R:** GitHub branch protection lo rechaza. Es imposible hacer force-push a `main`. Buen diseño.

### P: ¿Cuánto tarda Vercel en deployar después de merge?
**R:** 2-3 minutos típicamente. Ver dashboard: https://vercel.com/dashboard/medconnect

### P: ¿Quién puede hacer merge a `main`?
**R:** Cualquiera del equipo SaludOnNet-test, después de 1 aprobación.

### P: ¿Puedo deployar un fix urgente sin PR?
**R:** No. La protección de `main` lo previene. Crea un PR rápido en 2 minutos.

### P: ¿Cómo rollback si Vercel deployment falla?
**R:** Vercel revierte automáticamente al commit anterior. Check dashboard.

---

## CONTACTO

- **Deployment issues:** Francisco Pizarro (Slack/Email)
- **Vercel access:** SaludOnNet Team (team admin)
- **GitHub access:** SaludOnNet-test organization

---

**Válido desde:** 2026-04-25  
**Próxima revisión:** 2026-06-25  
**Estado:** FINAL - Listo para implementación
