# Manual de Operaciones — Med Connect

**Versión:** 1.0 (MVP)
**Última actualización:** 2026-04-25
**Audiencia:** Equipo de operaciones (los que llaman a las clínicas).

---

## 1. Qué hace Med Connect en una frase

Vendemos al paciente una "tarifa de prioridad" para que su clínica de cuadro médico (Sanitas, Adeslas, DKV, etc.) le atienda en menos de 7 días en vez de en 30. La consulta la sigue pagando su seguro; nosotros le pagamos a la clínica un extra para que acepte atender al paciente cuando nosotros nos comprometimos.

Es decir: el paciente nos paga a nosotros una tarifa de "salto de cola" y nosotros operacionalmente conseguimos que la clínica honre esa hora.

---

## 2. Flujo end-to-end de una venta

```
[1] Paciente busca cita en medconnect.es
        │
[2] Reserva un slot y paga (Stripe)
        │
[3] Se crea automáticamente:
      • Booking en BD
      • Caso en `operations_cases` (estado: pending_call)
      • Email a operaciones@medconnect.es con todo lo que necesita el operador
      • Email de confirmación al paciente ("estamos gestionando")
        │
[4] Operador abre el caso en /admin/ops y llama a la clínica  ← AQUÍ EMPIEZA TU TRABAJO
        │
[5] Según lo que diga la clínica, el operador clickea una de
    las acciones del dashboard (ver §6).
        │
[6] El sistema notifica al paciente automáticamente (cita
    confirmada, alternativa propuesta o reembolso emitido).
```

---

## 3. SLA — tiempos máximos

| Hito | Tiempo desde la compra |
|------|------------------------|
| Primer intento de llamar a la clínica | < 1 h hábil |
| Caso resuelto (confirmado o reembolsado) | **< 6 h hábiles** |
| Si la clínica no contesta tras 3 intentos espaciados 1h | Buscar otra clínica o reembolsar |

> Las "horas hábiles" son lun–vie 9:00–18:00, no festivos. El buffer se aplica también a los slots vendibles: nunca vendemos un slot a menos de 6h hábiles del momento del search, para tener margen operativo.

---

## 4. Qué encontrarás en el email de un nuevo caso

El email que llega a `operaciones@medconnect.es` (con copia automática al sistema Zendesk si está configurado para reenviar) tiene este formato:

```
Asunto: [BOOKING_ID:pi_xxx][CASE:42] Nueva venta — Centro Médico X 2026-05-04 11:00
```

El cuerpo incluye:
- **Bloque metadata parseable** (`[BOOKING_ID:...]`, `[CASE_ID:...]`, `[CLINIC_PHONE:...]`, etc.) — Zendesk lo puede usar para autocompletar campos del ticket.
- **Resumen del caso**: paciente, aseguradora, especialidad, clínica, teléfono, fecha de cita, importe que se le cobró al paciente, importe que SaludOnNet puede pagar a la clínica, tier.
- **Guion de llamada** (lo de §5).
- **Reglas del operador** (lo de §7).
- **Link directo al dashboard** (`/admin/ops/{CASE_ID}`).

> El email NO debe responderse: las acciones se ejecutan desde el dashboard, no por email.

---

## 5. Guion de llamada (pitch a la clínica)

Adapta el tono pero respeta los 4 pasos:

### Paso 1 — Saludo y presentación

> "Buenos días, le llamo de Med Connect, somos un marketplace que envía pacientes con seguro privado (Sanitas, Adeslas, DKV, etc.) a clínicas como la suya."

### Paso 2 — La oferta concreta

> "Tengo un paciente de **{Aseguradora}** que quiere ser visto el **{Fecha} a las {Hora}**. Su seguro paga la consulta como siempre, y nosotros les pagamos **€{Importe a clínica}** extra por encima por aceptar atenderlo a esa hora."

### Paso 3 — La promesa de volumen (caso testigo)

> "Si aceptan este caso testigo, podemos enviarles más pacientes de forma recurrente. Es trabajo que ya están haciendo (consultas de aseguradora) con un extra por cada paciente que les enviamos. Los pacientes ya están filtrados — todos tienen seguro privado, todos quieren cita rápida y todos ya nos pagaron."

### Paso 4 — Cierre

Según la respuesta de la clínica, ejecuta una de las **acciones del dashboard** (ver §6).

---

## 6. Acciones del dashboard

En `/admin/ops/{caseId}` tienes estos botones. Cada uno dispara automáticamente lo correspondiente.

### A. ✓ "La clínica aceptó el slot original"

**Cuándo:** la clínica acepta exactamente la fecha y hora que el paciente compró.

**Qué hace el sistema:**
- Marca el caso como `confirmed`.
- Envía email al paciente: "Cita confirmada con {Clínica} para el {Fecha} a las {Hora}. Lleva tu DNI y tarjeta de seguro."
- Caso cerrado.

### B. 🕐 "La clínica propone otro día/hora"

**Cuándo:** la misma clínica acepta atender al paciente pero a otra fecha/hora distinta.

**Qué hace el sistema:**
- Te pide la nueva fecha/hora y un motivo.
- Marca el caso como `clinic_proposed_alternative`.
- Envía email al paciente con dos botones grandes: **Aceptar** o **Reembolsar**.
- Si el paciente acepta → cita confirmada con el nuevo slot.
- Si el paciente rechaza → reembolso completo automático.

> Aunque el cambio sea de ±15 min, **siempre** hay que mandar este email — la cita comprometida cambió y el paciente tiene que confirmar.

### C. ✕ "La clínica rechazó"

**Cuándo:** la clínica dice que no puede atender al paciente.

**Qué hace el sistema:**
- Marca el caso como `clinic_rejected_searching`.
- El operador busca una clínica alternativa cercana, con la misma especialidad.

### D. 🔁 "Encontré una clínica alternativa"

**Cuándo:** después de rechazo, el operador encuentra otra clínica que sí acepta misma fecha/hora (o muy cercana).

**Qué hace el sistema:**
- Te pide nombre/ID/fecha/hora de la nueva clínica.
- Marca como `alternative_clinic_proposed`.
- Envía email al paciente con la propuesta y dos botones (Aceptar / Reembolsar).
- Igual que B: si acepta → cita confirmada; si rechaza → reembolso.

### E. 💸 "Sin alternativa — emitir reembolso"

**Cuándo:** después de rechazo, no se encuentra ninguna alternativa razonable.

**Qué hace el sistema:**
- Llama a Stripe y emite reembolso al payment_intent del paciente (mismo importe que pagó).
- Marca caso como `refunded`.
- Envía email al paciente: "Te devolvimos €X. Verás el ingreso en 1–2 días hábiles."

### F. Reembolso manual (caso atípico)

**Cuándo:** ventas duplicadas, fraude, queja del paciente, decisión gerencial.

Igual que E pero el operador escribe el motivo libremente.

---

## 7. Reglas del operador (no negociar fuera de esto)

- **Importe que SaludOnNet puede ofrecer a la clínica:** según el tier del caso. El dashboard te muestra el número exacto. **No negocies al alza** sin aprobación de un admin.
  - Tier 1 (cita esta semana, paciente pagó €29): clínica recibe **€15**.
  - Tier 2 (cita semana próxima, paciente pagó €19): clínica recibe **€10**.
  - Tier 3 (cita 15–30 días, paciente pagó €9,99): clínica recibe **€5**.
  - Tier 4 (cita 31–45 días, paciente pagó €4,99): clínica recibe **€2**.

- **Si la clínica pide más:** "Tengo que consultarlo internamente, le devuelvo la llamada." — escala a un admin (no comprometas en el momento).

- **Si la clínica no atiende:** intenta 3 veces espaciadas 1 hora. Después → buscar alternativa.

- **Si la clínica acepta verbalmente pero no confirma por email:** igual marca "aceptó". Confiamos en su palabra para el MVP.

- **Nunca** confirmar al paciente una hora distinta sin que él la apruebe explícitamente. Eso lo hace automáticamente el dashboard mediante el email con botones.

- **No prometas cosas que el sistema no hace** (ej. "le mandamos un SMS de recordatorio el día antes"). Para el MVP solo hay email.

- Si un paciente llama directo pidiendo cancelar → emite reembolso manual. Es nuestra política liberal en MVP.

---

## 8. Casuísticas frecuentes (FAQ)

**Q: La clínica pregunta cómo cobra el extra.**
A: "Lo transferimos a la clínica en el cierre semanal por la cuenta que nos faciliten."

**Q: La clínica dice que el paciente ya tiene cita programada para la semana siguiente.**
A: Decir: "Perfecto, mi paciente prefiere ser visto antes — ¿tienes disponibilidad para el {fecha original}?". Si no, ejecutar B (propone otro día/hora).

**Q: La clínica nunca había oído hablar de Med Connect.**
A: "Somos un marketplace nuevo de pacientes asegurados que quieren cita rápida. Estamos arrancando con clínicas como la suya. Si esto funciona, le envío más pacientes de forma recurrente."

**Q: La clínica acepta solo si pagamos por adelantado.**
A: Para el MVP: comprométete verbalmente, marca "aceptó", y luego operaciones se encarga de coordinar la transferencia. Si la clínica insiste en pago previo: escalá a admin.

**Q: El paciente llama enojado porque cambiamos su cita.**
A: Reenvíale el email de alternativa. Si no le gusta ninguna alternativa: emite reembolso manual con motivo "queja del paciente".

**Q: La clínica acepta un día distinto al original pero con la misma hora.**
A: Igual hay que ejecutar acción B (propone otro día/hora). El paciente confirma o rechaza.

---

## 9. Métricas que debe vigilar operaciones

| Métrica | Objetivo MVP |
|---------|--------------|
| % casos resueltos en < 6h hábiles | ≥ 80% |
| % aceptación de la clínica al primer call | ≥ 60% |
| % alternativas aceptadas por el paciente | ≥ 70% |
| % reembolsos sobre ventas totales | ≤ 15% |
| Tiempo medio desde compra hasta primer call | < 60 min hábiles |

---

## 10. Acceso y usuarios del dashboard

**URL:** https://medconnect-bay.vercel.app/admin/login (o medconnect.es/admin/login)

**Credenciales por defecto:**
- Usuario: `Admin`
- Contraseña: `ADMIN`

**Importante:** cambia la contraseña por defecto y crea un usuario por cada operador. Cada acción queda registrada con el username que la ejecutó.

**Roles:**
- `admin`: puede crear/desactivar usuarios. Recomendado: solo Francisco y un backup.
- `ops`: puede gestionar casos. Asigna este rol a los operadores.

---

## 11. Anexos

- Reglas de generación de slots y pricing: [SLOT_GENERATION_RULES.md](SLOT_GENERATION_RULES.md)
- Reglas de deployment: [DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md)
- Auditoría de la BD de clínicas: [CLINICS_AUDIT_REPORT.md](CLINICS_AUDIT_REPORT.md)

---

**Cualquier cambio a estas reglas requiere aprobación escrita de Francisco Pizarro.**
