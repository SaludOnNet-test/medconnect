# Cómo proteger el branch `main` en GitHub

`gh` CLI no está instalado en este entorno, así que la protección debe configurarse desde la web UI o vía API con un Personal Access Token (PAT).

## Opción A: Web UI (recomendada — 2 minutos)

1. Ir a https://github.com/SaludOnNet-test/medconnect/settings/branches
2. Click **"Add branch ruleset"** (o "Add rule" en el viejo modelo)
3. **Branch name pattern:** `main`
4. Marcar las siguientes opciones:
   - ✅ **Require a pull request before merging**
     - Required approving reviews: **1**
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ **Require conversation resolution before merging**
   - ✅ **Block force pushes** (block force pushes to matching refs)
   - ✅ **Restrict deletions** (cannot delete branch)
   - ⬜ Require status checks (skip por ahora — no tenemos CI configurado)
5. **Save changes**

## Opción B: Vía API (si tienes un PAT con scope `admin:repo`)

```bash
# Reemplazar <TOKEN> con tu Personal Access Token
curl -X PUT \
  -H "Authorization: token <TOKEN>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/SaludOnNet-test/medconnect/branches/main/protection \
  -d '{
    "required_pull_request_reviews": {
      "required_approving_review_count": 1,
      "dismiss_stale_reviews": true
    },
    "enforce_admins": false,
    "required_status_checks": null,
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "required_conversation_resolution": true
  }'
```

## Verificar que funcionó

```bash
# Intentar push directo a main desde una working copy
git checkout main
echo "" >> README.md
git commit -am "test"
git push origin main
# → Debería ser RECHAZADO con: "protected branch hook declined"
```

## Después de proteger

El nuevo flujo de trabajo es:

```bash
git checkout -b feat/mi-cambio
git commit -am "feat: ..."
git push -u origin feat/mi-cambio
# Crear PR en https://github.com/SaludOnNet-test/medconnect/pulls
# Esperar 1 review
# Merge desde la UI
```

## Excepción durante migración

Mientras se completa la protección, los push directos a `main` siguen funcionando (es lo que hicimos hoy para arreglar el deploy). Activar la protección **después** de que el deploy de Vercel quede verde.
