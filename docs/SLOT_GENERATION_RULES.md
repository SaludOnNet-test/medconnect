# Reglas de Generación de Slots - MedConnect

**Última actualización:** 2026-04-25  
**Estado:** FINAL - Regla inamovible

---

## VISIÓN GENERAL

El sistema de MedConnect SIEMPRE inventa/genera slots (citas disponibles) para cada clínica. Sin embargo, la regla de generación varía según si la clínica tiene datos de Doctoralia o no:

- **Clínicas CON Doctoralia:** Slots restringidos a días/horarios importados ± 15 min
- **Clínicas SIN Doctoralia:** Slots genéricos en próximos 5 días hábiles

Los datos de Doctoralia se importan UNA SOLA VEZ en tabla `clinic_schedules`. A partir de ahí, se usan como referencia para validar slots generados, no como fuente única.

---

## REGLA 1: Clínicas CON Datos Importados de Doctoralia

**Condición:** Clínica tiene ≥1 registro en `clinic_schedules` (source='doctoralia')

**Generación de Slots:**

```
Para cada día en ventana de 45 días adelante:
  1. Calcular day_of_week (0=Lunes, 1=Martes, ..., 4=Viernes)
  2. Buscar registros en clinic_schedules para ese day_of_week
  3. SI EXISTE registro Doctoralia para ese day:
     → Generar slots cada 15 minutos
     → Rango: start_time a end_time (±15 min permitido)
     → Intervalos: 00, 15, 30, 45 minutos
  4. SI NO EXISTE registro Doctoralia para ese day:
     → NO generar slots (día bloqueado)
  5. SIEMPRE excluir sábados (day=5), domingos (day=6), festivos españoles
```

**Ejemplo Práctico:**

```
Clínica ID: 123
Doctoralia data:
  - Monday (day=0): 09:00-13:00 (427 mins)
  - Tuesday (day=1): 09:00-14:00 (300 mins)
  - No Wednesday data
  - Thursday (day=3): 10:00-12:30 (150 mins)
  - Friday (day=4): 09:00-13:00

Generación de slots:
  Monday:    09:00, 09:15, 09:30, 09:45, 10:00, ..., 12:45 ✓
  Tuesday:   09:00, 09:15, 09:30, ..., 13:45 ✓
  Wednesday: (vacío - no hay Doctoralia)
  Thursday:  10:00, 10:15, 10:30, 10:45, 11:00, 11:15, 11:30, 11:45, 12:15, 12:30 ✓
  Friday:    09:00, 09:15, 09:30, ..., 12:45 ✓
  Saturday:  (nunca)
  Sunday:    (nunca)
```

**Validación:**

```javascript
function validateSlotAgainstDoctoralia(clinicId, date, time) {
  const dayOfWeek = date.getDay() - 1; // 0=Monday
  
  // Excluir weekends
  if (dayOfWeek < 0 || dayOfWeek > 4) return false;
  
  // Excluir festivos españoles
  if (isSpanishHoliday(date)) return false;
  
  // Buscar schedule
  const schedule = await db.query(
    `SELECT start_time, end_time FROM clinic_schedules 
     WHERE clinic_id=? AND day_of_week=? AND source='doctoralia'`,
    [clinicId, dayOfWeek]
  );
  
  if (!schedule) return false; // Sin schedule = sin slots
  
  // Validar rango ±15 min
  const startMinutes = timeToMinutes(schedule.start_time);
  const endMinutes = timeToMinutes(schedule.end_time);
  const slotMinutes = timeToMinutes(time);
  
  // Permitir ±15 min
  return slotMinutes >= (startMinutes - 15) && slotMinutes <= (endMinutes + 15);
}
```

**Performance:**

- Querybase: 1 query por slot generado (costoso)
- **Optimización:** Precachear schedules al inicio de sesión
- Cache TTL: 1 hora

---

## REGLA 2: Clínicas SIN Datos Importados de Doctoralia

**Condición:** Clínica tiene 0 registros en `clinic_schedules`

**Generación de Slots:**

```
Parámetros:
  - Cantidad: 2-4 slots por semana
  - Ventana: SOLO próximos 5 días hábiles desde hoy
  - Horarios: 2 mañana (08:00-13:00), 2 tarde (14:00-19:00)
  - Días: Lunes a Viernes SOLAMENTE (day 0-4)
  - Excluir: Sábados, domingos, festivos españoles

Algoritmo:
  1. Hoy = datetime.now()
  2. Calcular próximos 5 días hábiles (L-V, no festivos)
  3. Distribuir 4 slots entre esos 5 días
     - Slot 1: Día 1, mañana (aleatorio entre 08:00-13:00)
     - Slot 2: Día 2, tarde (aleatorio entre 14:00-19:00)
     - Slot 3: Día 3 ó 4, mañana
     - Slot 4: Día 4 ó 5, tarde
  4. Intervalos de 30 minutos (09:00, 09:30, 10:00, etc.)
  5. Retornar 4 slots
```

**Ejemplo:**

```
Hoy: Lunes 25 de abril de 2026
Próximos 5 días hábiles: L25, M26, W27, R28, V29

Slots generados:
  - Lunes 25 de abril, 10:15 (mañana) ✓
  - Martes 26 de abril, 15:30 (tarde) ✓
  - Jueves 28 de abril, 11:00 (mañana) ✓
  - Viernes 29 de abril, 16:45 (tarde) ✓

Excluidos:
  - Sábados y domingos
  - Festivos españoles (Semana Santa, 1 de mayo, etc.)
  - Más allá de 5 días hábiles
```

**Código:**

```javascript
function generateFallbackSlots(clinicId) {
  const slots = [];
  const today = new Date();
  const businessDays = getNextBusinessDays(today, 5);
  
  // Generar 4 slots distribuidos
  const distribution = [
    { day: 0, period: 'morning' },   // Día 1, mañana
    { day: 1, period: 'afternoon' }, // Día 2, tarde
    { day: 3, period: 'morning' },   // Día 4, mañana
    { day: 4, period: 'afternoon' }  // Día 5, tarde
  ];
  
  for (const { day, period } of distribution) {
    const date = businessDays[day];
    const time = generateRandomTime(period); // 08:00-13:00 o 14:00-19:00
    slots.push({ date, time, available: true });
  }
  
  return slots;
}

function getNextBusinessDays(fromDate, count) {
  const days = [];
  const current = new Date(fromDate);
  
  while (days.length < count) {
    const dow = current.getDay();
    
    // Lunes (1) a Viernes (5)
    if (dow >= 1 && dow <= 5) {
      // No es festivo español
      if (!isSpanishHoliday(current)) {
        days.push(new Date(current));
      }
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}
```

---

## REGLA 3: Importación y Almacenamiento de Doctoralia

**Fuente:** Excel `doctoralia_medicos-6.xlsx`  
**Script:** `/scripts/import_doctoralia_schedules.py`  
**Tabla:** `clinic_schedules`  
**Campos:**
- `clinic_id`: ID de clínica
- `day_of_week`: 0=Lunes, 1=Martes, ..., 4=Viernes
- `start_time`: HH:MM (ej: "09:00")
- `end_time`: HH:MM (ej: "13:00")
- `source`: 'doctoralia'
- `created_at`: timestamp

**Proceso:**

```
1. Leer Excel doctoralia_medicos-6.xlsx
2. Fuzzy-match (similaridad ≥ 0.70) entre:
   - clinic_name + province (Excel) → clinic_id (BD MedConnect)
3. Para cada match:
   - Extraer horarios lunes-viernes
   - Normalizar formato HH:MM
   - Upsert en clinic_schedules
4. Marcar source='doctoralia' para identificar

Frecuencia: Bajo demanda (no hay job recurrente)
Última ejecución: 2026-04-XX
```

---

## REGLA 4: Festivos Españoles

**Hardcodeados TEMPORALMENTE** (deben cargarse de BD):

```python
SPANISH_HOLIDAYS = [
    # Semana Santa 2026
    '2026-04-02', '2026-04-03', '2026-04-06',
    # Fiestas de mayo
    '2026-05-01',
    # Vacaciones verano
    # '2026-08-15', # Asunción
    # Navidad
    '2026-12-06', '2026-12-08', '2026-12-25',
    # Año nuevo
    '2027-01-01'
]
```

**TODO:** Crear tabla `spanish_holidays` y cargar desde BD.

---

## REGLA 5: Rango de Tiempo

**Ventana de generación:** 45 días adelante  
**Motivo:** Balance entre:
- Suficientemente largo para mostrar disponibilidad
- Suficientemente corto para ser relevante (no ofertar citas en 6 meses)

**Ajustable:** En variables de entorno o settings.

---

## CASOS DE USO

### Caso 1: Usuario busca clínica con Doctoralia

```
Usuario: "Traumatología en Madrid, próxima semana"
  → Clínica tiene datos Doctoralia
  → Slots mostrados SOLO en días/horarios importados
  → Ejemplo: "Lunes 10:00, Martes 14:30, Viernes 11:00"
  → Validación: RGLA 1
```

### Caso 2: Usuario busca clínica sin Doctoralia

```
Usuario: "Odontología en Barcelona"
  → Clínica SIN datos Doctoralia
  → Slots generados aleatoriamente próximos 5 días
  → Ejemplo: "Martes 11:00, Miércoles 15:30, Viernes 10:00"
  → Validación: REGLA 2
  → UX Note: Mostrar "Disponibilidad estimada" (no garantizada)
```

### Caso 3: Relleno de BD

```
Se importan 2,960 clínicas del Excel SON.
  → ~357 tienen Doctoralia (REGLA 1)
  → ~2,603 sin Doctoralia (REGLA 2)
  → Frontend elige regla automáticamente según BD
```

---

## IMPLEMENTACIÓN

### Archivos a crear/modificar

| Archivo | Acción | Prioridad |
|---------|--------|-----------|
| `/src/lib/slot-validation.js` | Crear | 🔴 |
| `/src/lib/spanish-holidays.js` | Crear | 🟡 |
| `/src/app/api/clinics/[id]/available-slots/route.js` | Modificar | 🔴 |
| `/src/app/api/clinics/batch-slots/route.js` | Modificar | 🔴 |
| `/src/data/mock.js` | Rewrite | 🔴 |

### Endpoints afectados

- `GET /api/clinics/[id]/available-slots` → Validar REGLA 1/2
- `GET /api/clinics/batch-slots` → Validar REGLA 1/2
- `GET /api/clinics/filters` → No cambios

### Testing

```bash
# Test REGLA 1 (Doctoralia)
curl "http://localhost:3000/api/clinics/123/available-slots"
# Esperar: Slots SOLO en días con Doctoralia

# Test REGLA 2 (Sin Doctoralia)
curl "http://localhost:3000/api/clinics/999/available-slots"
# Esperar: 4 slots próximos 5 días hábiles

# Test validación ±15 min
# Clínica con Doctoralia 09:00-13:00
# Slots válidos: 08:45, 09:00, 09:15, ..., 13:15
```

---

## AUTORIZACIÓN Y CAMBIOS FUTUROS

**Esta regla es INAMOVIBLE.** Cualquier cambio requiere:
1. Aprobación escrita de Francisco Pizarro
2. Actualización de este documento
3. Tests que validen la nueva regla

**Cambios posibles futuros:**
- Aumentar ventana de 45 a 60 días
- Usar 3 slots en lugar de 4 para sin-Doctoralia
- Cargar festivos españoles de BD (no hardcodeados)

---

**Reporte:** 2026-04-25  
**Validado:** Sí  
**Estado:** Listo para implementación
