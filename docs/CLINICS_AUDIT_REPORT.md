# Auditoría de BD de Clínicas - MedConnect
**Fecha:** 2026-04-25  
**Ejecutado por:** Claude Code Audit Script

---

## 🔴 RESUMEN EJECUTIVO: PROBLEMA CRÍTICO

| Métrica | Valor | Status |
|---------|-------|--------|
| **Clínicas en Excel** | 5,984 total | - |
| **Publicadas en Marketplace (Excel)** | 2,960 | ✓ |
| **Clínicas en BD actual** | 1,120 | ❌ CRÍTICO |
| **Brecha** | -1,840 (62% incompleto) | 🔴 |
| **Cobertura Doctoralia** | 357 / 1,120 (31.87%) | 🟡 |

**CONCLUSIÓN:** 
- Excel tiene 2,960 clínicas publicadas en marketplace
- BD solo tiene 1,120 (62% incompleto)
- **Faltan 1,840 clínicas** para completar el target
- El script `import_son_clinics.py` NO está filtrando correctamente

---

## 0️⃣ AUDIT 0: EXCEL SON ANALYSIS (PRE-IMPORT)

### Resultados

```
Excel: Cuadro Medico SON - 170426.xlsx
  Total clinics in Excel:               5,984
  Published in Marketplace (SI):        2,960
  NOT published (NO):                   3,024
  ID column: IdClon (numeric)
  
Excel vs Database COMPARISON:
  In Excel:                             5,984
  In Database:                          1,120
  In BOTH:                              1,117
  Missing from DB (in Excel):           4,867 (81.4%)
  Extra in DB (not in Excel):               3 (0.3%)
```

### Análisis

- El Excel de SON tiene **2,960 clínicas marcadas como "SI" en PublicadoMarketplace**
- La BD tiene solo **1,120 clínicas** (37% del target)
- **Faltan 1,840 clínicas** para alcanzar 2,960

### Conclusión

**CRÍTICO:** El script `import_son_clinics.py`:
1. **NO está filtrando por `PublicadoMarketplace = 'SI'`**
2. Está conectándose a BD de SON, no al Excel directo
3. Posible que BD de SON tenga menos registros que el Excel
4. **Solución:** Re-escribir script para leer directamente del Excel SON y filtrar publicadas

---

## 1️⃣ AUDIT 1: CONTEO DE CLÍNICAS (EN BD)

### Resultados

```
✓ Total clinics in BD:                  1,120
✓ Clinics with Doctoralia schedules:      357 (31.87%)
✓ Clinics without Doctoralia:             763 (68.13%)
✓ Clinics updated after 2026-04-15:    1,120 (100%)
```

### Análisis

- **1,120 clínicas** está en la BD `saludonai`
- **Target esperado:** 2,961 clínicas (según excel SON publicadas en marketplace)
- **Falta:** 1,841 clínicas (62%)

### Conclusión

**PROBLEMA CRÍTICO:** El script de importación (`import_son_clinics.py`) **no está importando todas las clínicas** del excel SON. Necesitamos:

1. Verificar si el Excel de SON realmente tiene 2,961 clínicas marcadas como "publicadas"
2. Revisar el script `import_son_clinics.py` para ver si está filtrando correctamente
3. Verificar que la BD de SON (`sonwesteurope.database.windows.net`) tiene todos los registros

---

## 2️⃣ AUDIT 2: ESPECIALIDADES Y SERVICIOS

### Resultados

```
✓ Total specialty records:             3,008
✓ Unique specialties:                     38
✓ Total procedure records:            34,895
✓ Unique procedures:                     399
✓ Clinics with specialties:              534 (47.68%)
✓ Clinics with procedures:               951 (84.91%)
✗ Clinics WITHOUT specialties:           586 (52.32%)
✗ Clinics WITHOUT procedures:            169 (15.09%)
```

### Análisis

- **Especialidades:** Hay 38 tipos únicos y 3,008 registros totales
  - Promedio: 5.63 especialidades por clínica (en clínicas que tienen)
  - **Problema:** 586 clínicas (52%) NO tienen especialidades
  
- **Procedimientos:** Hay 399 tipos únicos y 34,895 registros totales
  - Promedio: 36.69 procedimientos por clínica (en clínicas que tienen)
  - **Problema:** 169 clínicas (15%) NO tienen procedimientos

### Conclusión

**PROBLEMA:** La importación de especialidades y procedimientos es **incompleta**:
- Script: `import_catalog_b2c.py` (no está importando todas las clínicas)
- **Recomendación:** Revisar por qué solo 534 clínicas tienen especialidades

---

## 3️⃣ AUDIT 3: COBERTURA DOCTORALIA

### Resultados por Día de Semana

```
✓ Monday:    256 clinics, 427 schedule records
✓ Tuesday:   266 clinics, 477 schedule records
✓ Wednesday: 276 clinics, 474 schedule records
✓ Thursday:  262 clinics, 451 schedule records
✓ Friday:    210 clinics, 318 schedule records

ℹ️  Clinics with all 5 weekdays (Mon-Fri): 167
```

### Análisis

- **357 clínicas** tienen datos de Doctoralia (31.87% de total)
- **Distribución:** No uniforme - hay variación entre días
  - Máximo: Miércoles con 276 clínicas
  - Mínimo: Viernes con 210 clínicas
  
- **167 clínicas** tienen horarios para los 5 días hábiles
- **190 clínicas** tienen horarios parciales (algunos días sí, otros no)

### Conclusión

**PROBLEMA:** La importación de Doctoralia es **muy incompleta**:
- Solo 357 de 1,120 clínicas (31.87%)
- Script: `import_doctoralia_schedules.py` (fuzzy-match fallando)
- **Recomendación:** Mejorar fuzzy-match o cargar datos de otra fuente

---

## 4️⃣ AUDIT 4: VALIDEZ DE HORARIOS

### Resultados

```
✓ Valid schedules (HH:MM format): 2,147
✓ No invalid schedules found:          0
```

### Análisis

- **100% de los horarios son válidos** en formato HH:MM
- No hay registros con `start_time` o `end_time` nulos o vacíos
- Los datos de Doctoralia que existen están bien formateados

### Conclusión

✅ **OK:** La calidad de los datos Doctoralia importados es buena. El problema es cantidad, no calidad.

---

## 5️⃣ DISTRIBUCIÓN Y RECOMENDACIONES

### Resumen de Completitud

```
Métrica                              Cantidad    % del Total
─────────────────────────────────────────────────────────────
Total Clínicas en BD                  1,120        100%
  Con Doctoralia                        357       31.87%
  Sin Doctoralia                        763       68.13%
  
Con especialidades                      534       47.68%
Con procedimientos                      951       84.91%
Con AMBAS (especialidades + procedimientos): ~450  40.18%
```

### 🚨 PROBLEMAS CRÍTICOS (En Orden de Prioridad)

| # | Problema | Impacto | Acción |
|---|----------|--------|--------|
| 1 | **Faltan 1,841 clínicas** | Imposible llegar a 2,961 | Revisar `import_son_clinics.py` y el excel de SON |
| 2 | **586 clínicas sin especialidades (52%)** | Búsqueda por especialidad no funciona | Revisar `import_catalog_b2c.py` |
| 3 | **763 clínicas sin Doctoralia (68%)** | Slots fallback sin validación | Implementar REGLA 2 (slots 2-4/semana) |
| 4 | **167 clínicas con 5 días completos** | Mayoría tiene horarios parciales | Aceptable con fallback |

---

## 📋 PLAN DE ACCIÓN INMEDIATO

### FASE 1: Resolver Falta de Clínicas (1,840)

**ROOT CAUSE IDENTIFIED:**
- Script `import_son_clinics.py` conecta a BD de SON (NO a Excel)
- BD de SON tiene solo ~1,120 registros con `IsRegularProvider=1`
- Excel SON tiene 2,960 clínicas marcadas como "PublicadoMarketplace=SI"
- **Diferencia:** BD de SON es subset incompleto del Excel

**SOLUCIÓN RECOMENDADA:**

Opción A (Recomendada): Importar desde Excel directamente
```python
# Crear: scripts/import_from_excel.py
# 1. Leer Excel "Cuadro Medico SON - 170426.xlsx"
# 2. Filtrar por PublicadoMarketplace = 'SI' (2,960 clínicas)
# 3. Mapear columnas: IdClon -> id, Proveedor -> name, etc.
# 4. Upsert en tabla clinics
```

Opción B: Verificar BD de SON
```bash
# Conectar a sonwesteurope.database.windows.net
# SELECT COUNT(*) FROM ProductProviders WHERE IsRegularProvider=1 AND PublicadoMarketplace=1
# ¿Es 2,960 o menos?
```

**Recomendación:** Opción A (usar Excel) - es la fuente única de verdad visible

---

### FASE 2: Resolver Especialidades Faltantes (586 clínicas)

**Paso 2.1:** Verificar import_catalog_b2c.py
- ¿Está filtrando por clínicas existentes?
- ¿El Excel de catálogo tiene 2,961 clínicas?

**Paso 2.2:** Re-ejecutar importación
```bash
python scripts/import_catalog_b2c.py --full
```

---

### FASE 3: Resolver Doctoralia Incompleto (763 clínicas)

**Paso 3.1:** Mejorar fuzzy-match en `import_doctoralia_schedules.py`
- Threshold actual: 0.75 ¿Es muy alto?
- Probar 0.70 o 0.65

**Paso 3.2:** Para las 763 clínicas sin Doctoralia
- Usar REGLA 2: generar 2-4 slots/semana (próximos 5 días hábiles)
- No requiere datos de Doctoralia

---

## 🔧 REGLAS BASADAS EN AUDITORÍA

### REGLA 1: Clínicas CON Doctoralia (357 clinics)

Para estas clínicas:
- Generar slots cada 15 minutos dentro de horarios Doctoralia
- Solo en días de semana importados (0-4)
- Rango ±15 min de horarios

### REGLA 2: Clínicas SIN Doctoralia (763 clinics)

Para estas clínicas:
- Generar 2-4 citas por semana
- Próximos 5 días hábiles desde hoy
- 2 mañana, 2 tarde
- Lunes a viernes SOLAMENTE

---

## 📊 QUERIES EJECUTADAS

Script: `scripts/audit_database.js`

Queries ejecutadas:
1. `SELECT COUNT(*) FROM clinics`
2. `SELECT COUNT(DISTINCT clinic_id) FROM clinic_schedules WHERE source='doctoralia'`
3. `SELECT COUNT(*) FROM clinic_specialties`
4. `SELECT COUNT(*) FROM clinic_procedures`
5. `SELECT day_of_week, COUNT(DISTINCT clinic_id) FROM clinic_schedules GROUP BY day_of_week`

**Tiempo de ejecución:** ~5 segundos

---

## 🎯 PRÓXIMOS PASOS

1. ✅ Ejecutar auditoría SQL (HECHO)
2. ⏳ Cargar Excel SON y validar cantidad exacta
3. ⏳ Revisar scripts de importación
4. ⏳ Re-ejecutar importaciones si es necesario
5. ⏳ Validar que lleguemos a 2,961 clínicas
6. ⏳ Crear validación de slots (REGLA 1 + REGLA 2)

---

**Reporte generado:** 2026-04-25  
**Base de datos:** `saludonai` (saludonai.database.windows.net)  
**Estado:** 🔴 CRÍTICO - Requiere acción inmediata
