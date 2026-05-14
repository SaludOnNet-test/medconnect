# Locuciones IVR — Medconnect

Adaptación de las locuciones del IVR de SaludOnNet al brand y al modelo de
operación de Medconnect. Estructura idéntica para facilitar la
parametrización por el equipo que mantenga la centralita (mismas
posiciones lógicas: entrada → festivo → fuera de horario → espera 1 →
espera 2).

**Voz objetivo:** misma voz que SaludOnNet si está disponible para
preservar coherencia de marca; si no, voz profesional femenina española
neutral.

**Tono:** sereno, claro, sin alarmismo. Pausas marcadas con punto y aparte
para que el operador pueda separar bloques fácilmente.

**Brand de referencia:** "Medconnect" (una palabra, sin separación).
Cuando se deletree por el sistema (típicamente sólo el email), usar las
letras una a una para legibilidad telefónica.

## 1 · Entrada (welcome + RGPD)

> Bienvenido a Medconnect, tu plataforma de citas médicas prioritarias.
> Te informamos que por motivos de control de calidad, esta llamada
> puede ser grabada.
>
> Medconnect tratará tus datos personales con la finalidad de gestionar
> tu solicitud de información en base a su interés legítimo.
>
> Puedes ejercer tus derechos a través de la siguiente dirección de
> correo electrónico:
>
> d.
>
> p.
>
> o.
>
> arroba medconnect punto e s.
>
> y obtener información adicional sobre el tratamiento de tus datos en
> www punto medconnect punto e s.
>
> En breves momentos te atenderemos.

**Notas para el integrador:**
- Misma estructura que SaludOnNet (saludo + grabación + RGPD + datos
  contacto + cierre "en breves momentos te atenderemos"). Sólo cambia
  marca, dominio y email.
- El email `dpo@medconnect.es` debe estar dado de alta antes de
  publicar — la oficina de protección de datos lo recibe.
- Tras esta locución, el sistema enruta a un agente disponible (cola
  por defecto). Si todos los agentes están ocupados, va a Espera 1.

## 2 · Festivo genérico

> Debido a la festividad, nuestras oficinas permanecerán cerradas en el
> día de hoy.
>
> Rogamos contacten con nosotros en el día hábil siguiente, en nuestro
> horario habitual de diez de la mañana a seis de la tarde.
>
> Gracias.

**Notas:**
- Misma frase que SaludOnNet, con el añadido del rango horario al final
  para que el llamante sepa cuándo volver a probar.
- El calendario de festivos coincide con el del marketplace
  (`src/lib/holidays/madrid.js`): nacionales + CCAA Madrid + municipio
  Madrid. Cuando ampliemos a otra ciudad habrá que parametrizar por
  CCAA del centro de atención (Madrid sigue siendo el HQ aunque vendamos
  fuera).
- Si la centralita soporta locuciones por día concreto (ej. mensaje
  específico de Navidad), se mantiene esta versión como fallback.

## 3 · Fuera de horario

> Nuestro horario de atención es de diez de la mañana a seis de la tarde
> de lunes a viernes.
>
> Si lo prefieres, también puedes enviarnos un correo electrónico a
>
> operaciones arroba medconnect punto e s.
>
> Gracias.

**Notas:**
- `operaciones@medconnect.es` es el buzón principal del equipo de
  Operaciones / Atención al Cliente (Raquel + equipo). Coincide con la
  dirección que aparece en los emails al paciente.
- Horario L–V 10:00–18:00 Madrid coincide con el SLA documentado en el
  manual de Ops.

## 4 · Espera 1 (cola normal)

> Todos nuestros agentes se encuentran ocupados.
>
> En breve atenderemos su llamada.

**Notas:**
- Reproducible varias veces (loop). SaludOnNet la pone en bucle hasta
  que un agente queda libre o pasa el umbral configurado.
- Recomendado: reproducir cada 30–45 s mezclada con música corporativa.

## 5 · Espera 2 (corte tras N ciclos)

> Todos nuestros agentes continúan ocupados.
>
> Por favor, contacta con nosotros pasados unos minutos.
>
> También puedes enviarnos un mensaje a
>
> operaciones arroba medconnect punto e s.
>
> Gracias.

**Notas:**
- Tras esta locución la centralita corta la llamada (mismo
  comportamiento que SaludOnNet).
- Umbral propuesto: cortar tras 2 ciclos completos de Espera 1 + 1 ciclo
  de Espera 2 (≈ 2 minutos de espera total). Parametrizable.
- Si tenemos KPI de SLA telefónico (% atendidas < 30 s) se afina el
  umbral con datos reales después de las primeras 2 semanas.

## Parámetros configurables

| Parámetro | Valor MVP | Fuente / dueño |
| --- | --- | --- |
| Email DPO | `dpo@medconnect.es` | Pendiente alta · Francisco |
| Email operaciones | `operaciones@medconnect.es` | Ya existe |
| Dominio web | `www.medconnect.es` | Ya existe |
| Horario laboral | L–V 10:00–18:00 | Manual de Ops (slide 4) |
| Calendario festivos | Nacional + CCAA Madrid + Madrid municipio | `src/lib/holidays/madrid.js` |
| Brand pronunciado | "Medconnect" (una palabra) | Decisión brand |
| Voz | Misma que SaludOnNet si posible | Solicitar a Raquel |

## Variantes a generar

Para que el operador del IVR pueda dejar las cinco listas en una sesión
de grabación, conviene generar también:

- Locución 1 sin la línea "te informamos que por motivos de control de
  calidad…" (mercados donde la grabación no aplica). MVP no la necesita
  — España siempre la requiere.
- Locución 5 sin la línea del correo electrónico (versión más corta
  cuando el aforo está saturado y queremos cortar más rápido).

## Próximos pasos

1. Aprobar el texto con Raquel y con compliance.
2. Reservar estudio de grabación o usar TTS de calidad (Polly / Azure
  con voz Lucia o Sergio). Recomendado TTS por velocidad y por permitir
  cambios futuros sin re-grabar.
3. Subir las cinco pistas al sistema IVR con los nombres:
   `entrada.wav`, `festivo.wav`, `fuera_horario.wav`,
   `espera_1.wav`, `espera_2.wav`.
4. Configurar el flujo igual que SaludOnNet — mismo árbol, mismos
  triggers.
5. Probar con número de prueba antes de cutover al número de producción
  `+34 91 197 70 52`.
