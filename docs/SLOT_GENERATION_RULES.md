# Reglas de Generación de Slots — MedConnect MVP

**Última actualización:** 2026-04-25
**Estado:** FINAL (post-brainstorming Francisco × Claude). Cambios requieren aprobación escrita.

---

## VISIÓN GENERAL

Cada clínica del marketplace publica **8 slots = 2 slots × 4 tiers de precio**. Los tiers reflejan urgencia: cuanto más cerca la fecha, mayor el precio. La sensación de escasez se construye a nivel de tier (solo 2 plazas a €29 esta semana), no a nivel total.

Los datos de Doctoralia se importan **una sola vez** en `clinic_schedules`. Las clínicas con datos respetan días/horarios reales (±15 min); las que no los tienen reciben slots inventados dentro de horario laborable.

---

## TIERS Y PRICING

| Tier | Días desde search | Etiqueta UI | Precio público | Pago a clínica | Margen € | Margen % |
|------|-------------------|-------------|----------------|----------------|----------|----------|
| 1 | 0–7 | "Esta semana" | **€29,00** | €15 | €14,00 | 48,3% |
| 2 | 8–14 | "Próxima semana" | **€19,00** | €10 | €9,00 | 47,4% |
| 3 | 15–30 | "En 2–4 semanas" | **€9,99** | €5 | €4,99 | 49,9% |
| 4 | 31–45 | "Más adelante" | **€4,99** | €2 | €2,99 | 59,9% |

> **Margen mínimo MVP:** 45% (relajado del 50% original). Tiers 1/2/3 quedan justo debajo del 50%; aceptado para validación inicial.

> **Pago a clínica** = importe que SaludOnNet paga a la clínica encima de la tarifa que ya recibe del seguro del paciente (Sanitas, etc.). Operativamente: cuando se vende un slot, el equipo llama a la clínica y le ofrece "atender a este paciente con su Sanitas + €X extra de nuestra parte".

---

## REGLA DE BUFFER MÍNIMO

Ningún slot puede caer antes de **`now + 6 horas hábiles`** donde "hora hábil" = lun–vie 09:00–18:00, excluyendo festivos españoles.

**Ejemplo:** search a las 16:00 del viernes
- 16:00–18:00 viernes = 2 h hábiles
- Lun 09:00–18:00 = 9 h hábiles
- Total acumulado a las 11:00 lunes = 11 h hábiles → **primer slot vendible: lunes 11:00**

Implementación: `applyBusinessHourBuffer(now, hours)` en `src/lib/slot-validation.js`.

---

## DISTRIBUCIÓN DE LOS 2 SLOTS POR TIER

Para cada tier:
- 1 slot en franja **mañana** (08:00–13:00)
- 1 slot en franja **tarde** (14:00–19:00)
- En **2 días distintos** cuando sea posible
- Solo lun–vie, no festivos
- Días dentro del rango del tier (ej. tier 1 → días 0–7 desde hoy)

La elección del día y la hora dentro de cada franja es **determinística** por `(clinicId, tier, salt)` → si el paciente refresca el mismo día ve los mismos slots. Cada 24h (medianoche) cambia el seed del día.

---

## REGLA 1 — Clínicas CON datos Doctoralia

Filtrar la generación a los registros de `clinic_schedules` (source='doctoralia'):
- Solo días de semana presentes en la tabla.
- Horarios `start_time`–`end_time` con tolerancia ±15 min.
- Cada slot debe caer en intervalos de 15 min (`08:00, 08:15, ..., 12:45, ...`).

Si para un tier no se puede colocar 1 mañana + 1 tarde dentro del rango, se devuelven solo los que sí caben (puede ser 1 ó 0).

---

## REGLA 2 — Clínicas SIN datos Doctoralia

Generación libre dentro de horario laborable:
- Mañana: 08:00–13:00
- Tarde: 14:00–19:00
- Intervalos de 15 min
- Lun–vie, no festivos

Siempre se llenan los 8 slots porque no hay restricción horaria fuente.

---

## RESPUESTA DEL API

**`GET /api/clinics/:id/available-slots`**

```json
{
  "slots": [
    {
      "date": "2026-04-29",
      "time": "11:15",
      "available": true,
      "tier": 1,
      "tierName": "urgencia",
      "tierLabel": "Esta semana",
      "price": 29.00,
      "paymentToClinic": 15,
      "period": "morning"
    }
    // ... hasta 8 slots
  ],
  "source": "db" | "fallback",
  "rule": "doctoralia" | "fallback",
  "earliestSellable": "2026-04-27T15:00:00.000Z",
  "pricingTiers": [...],
  "clinicId": 6
}
```

**`GET /api/clinics/batch-slots?ids=1,2,3&preview=true`**
En modo `preview=true` devuelve **el slot más temprano de cada tier (1 por tier × 4 tiers max)** por clínica. Sirve para los chips en las tarjetas de búsqueda.

---

## DETERMINISMO Y ESCASEZ

- **Mismo día → mismos slots** (paciente refresca, ve lo mismo, no se siente "manipulado").
- **24h después → set rotado** (impresión "se vendieron, hay nuevos").
- **Slot reservado → invalidado** para otros usuarios hasta confirmación/rechazo de la clínica (esto NO está en esta fase; pendiente para "lock-in" del checkout).

---

## ARCHIVOS DE IMPLEMENTACIÓN

| Archivo | Responsabilidad |
|---------|-----------------|
| [src/lib/slot-validation.js](../src/lib/slot-validation.js) | Lógica completa: tiers, buffer, generación. |
| [src/app/api/clinics/[id]/available-slots/route.js](../src/app/api/clinics/[id]/available-slots/route.js) | Endpoint principal. |
| [src/app/api/clinics/batch-slots/route.js](../src/app/api/clinics/batch-slots/route.js) | Endpoint para previews en tarjetas. |
| [src/components/SlotCalendar.js](../src/components/SlotCalendar.js) | Renderiza slots agrupados por fecha con precio/tier del slot. |
| [src/components/ClinicCardV2.js](../src/components/ClinicCardV2.js) | Muestra "desde €X,XX" + chips coloreados por tier. |
| [src/components/ClinicBookingModal.js](../src/components/ClinicBookingModal.js) | Modal de reserva, lee `slot.price` directamente del API. |

---

## FUERA DE SCOPE (PRÓXIMA SESIÓN)

- Lock/reserva del slot durante checkout (race conditions)
- Reembolso si la clínica rechaza
- Pricing variable por especialidad
- A/B testing de precios
- Notificaciones email a la clínica con detalle del paciente
- Dashboard de operaciones para "llamar a la clínica"
