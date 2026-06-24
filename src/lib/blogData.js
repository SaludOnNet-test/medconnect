/**
 * blogData.js — Static blog content store
 *
 * Each post has: slug, title, description, category, publishedAt,
 * readingMinutes, relatedSpecialty (slug from SPECIALTY_MAP), relatedCity,
 * and content (HTML string).
 *
 * To migrate to DB: replace getBlogPost/getAllBlogPosts with SQL queries
 * against a `blog_posts` table with the same shape.
 */

export const BLOG_CATEGORIES = {
  valor: 'El valor de la medicina privada',
  especialidad: 'Por especialidad',
  sintomas: 'Síntomas y cuándo actuar',
  seguro: 'Seguros médicos',
  ciudad: 'Por ciudad',
};

export const BLOG_POSTS = [
  // ── Cluster de valor Medconnect ────────────────────────────────────────────
  {
    slug: 'espera-media-especialista-espana',
    title: 'Cuánto se espera de media para ver a un especialista en España en 2025',
    description: 'El Barómetro Sanitario del Ministerio revela esperas de hasta 90 días para cardiología y reumatología en la Seguridad Social. ¿Qué opciones tienes cuando no puedes esperar tanto?',
    category: 'valor',
    publishedAt: '2026-06-10',
    readingMinutes: 6,
    relatedSpecialty: null,
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Sala de espera de hospital',
    content: `
<p>Según el <strong>Barómetro Sanitario 2024</strong> del Ministerio de Sanidad, la espera media para ver a un especialista en la Seguridad Social española supera los <strong>68 días</strong>. Para especialidades como reumatología, oftalmología o cardiología, ese plazo puede llegar a los 90-120 días según la comunidad autónoma.</p>

<h2>Los datos que el SNS publica pero nadie lee</h2>
<p>El Sistema de Información sobre Listas de Espera del SNS (SISLE) publica trimestralmente cuántos pacientes esperan cita y cuánto tiempo llevan esperando. Los últimos datos disponibles (diciembre 2024) muestran:</p>
<ul>
  <li><strong>Cardiología:</strong> 72 días de espera media en consultas externas</li>
  <li><strong>Dermatología:</strong> 58 días</li>
  <li><strong>Traumatología:</strong> 61 días</li>
  <li><strong>Ginecología:</strong> 45 días</li>
  <li><strong>Urología:</strong> 54 días</li>
</ul>
<p>Estos son promedios nacionales. En Madrid, Barcelona o Sevilla las esperas son generalmente menores; en provincias con menos especialistas per cápita pueden duplicarse.</p>

<h2>¿Por qué esperar tanto si tienes seguro privado?</h2>
<p>Aquí está el error más común: <strong>tener seguro privado no garantiza cita inmediata</strong>. La mayoría de cuadros médicos de las grandes aseguradoras tienen los mismos cuellos de botella que la sanidad pública en especialidades de alta demanda. Es habitual llamar a Sanitas o AXA y que el primer cardiólogo disponible en tu zona esté dentro de 3-6 semanas.</p>
<p>El seguro privado reduce la espera respecto a la pública, pero no la elimina. Y cuando necesitas una respuesta esta semana — un dolor en el pecho, una lesión deportiva, un lunar que ha cambiado — esas semanas se hacen meses.</p>

<h2>Qué hacer cuando no puedes esperar</h2>
<p>Tienes tres opciones reales:</p>
<ol>
  <li><strong>Pago directo (self-pay):</strong> Pagas la consulta completa en una clínica privada fuera de tu seguro. Precio típico: 60-120€ por consulta según especialidad y centro.</li>
  <li><strong>Usar tu seguro con reserva prioritaria:</strong> Clínicas concertadas con tu aseguradora que tienen huecos específicamente reservados para urgencias. Esto es lo que hace Med Connect: acceso a esos huecos con una tarifa de prioridad de 5-29€ según la urgencia, sin pagar la consulta.</li>
  <li><strong>Urgencias hospitalarias:</strong> Válido para emergencias reales, no para consultas planificadas. El tiempo de espera en urgencias por un motivo no urgente puede superar las 6-8 horas.</li>
</ol>

<h2>La brecha entre lo que cubre tu seguro y lo que realmente accedes</h2>
<p>Los informes de la patronal aseguradora UNESPA muestran que el <strong>20% de los asegurados privados</strong> han tenido dificultades para acceder a un especialista en el plazo que necesitaban en el último año. No porque su seguro no cubra la especialidad, sino porque los centros en red no tienen disponibilidad inmediata.</p>
<p>La cobertura está, pero el acceso real depende de la oferta de plazas en cada momento. Y esa oferta, en especialidades de alta demanda en ciudades grandes, es insuficiente.</p>
    `,
  },
  {
    slug: 'problema-oculto-seguros-salud-esperas',
    title: 'El problema oculto de los seguros de salud: tienes cobertura pero no puedes usarla',
    description: 'Millones de españoles con seguro médico privado descubren que tener póliza no equivale a tener acceso inmediato. Por qué ocurre y cómo resolverlo.',
    category: 'valor',
    publishedAt: '2026-06-12',
    readingMinutes: 5,
    relatedSpecialty: null,
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Documentos de póliza de seguro médico',
    content: `
<p>España tiene más de <strong>12 millones de asegurados de salud privada</strong> (datos UNESPA 2024). La mayoría contrató su seguro con una expectativa razonable: si necesito un médico, lo tengo. Lo que no imaginaban es que "tenerlo" no significa "tenerlo ahora".</p>

<h2>Por qué los cuadros médicos se colapsan</h2>
<p>Las aseguradoras contratan clínicas y médicos en red (el "cuadro médico"). Pero la demanda creció mucho más rápido que la oferta de especialistas concertados. Resultado: los mismos especialistas que antes veían a 15 pacientes privados al día ahora tienen agendas con 4-8 semanas de espera.</p>
<p>El problema se agrava en especialidades con escasez de profesionales (dermatología, reumatología, cardiología pediátrica) y en ciudades medianas donde el cuadro es más reducido.</p>

<h2>Lo que tu póliza garantiza (y lo que no)</h2>
<p>Tu seguro privado garantiza:</p>
<ul>
  <li>✅ Que la consulta con el especialista estará cubierta económicamente</li>
  <li>✅ Que hay especialistas de esa área en red</li>
  <li>❌ Que podrás verte con uno esta semana</li>
  <li>❌ Que el especialista más cercano a ti tendrá hueco pronto</li>
</ul>
<p>Nadie lo dice en el contrato porque técnicamente no hay incumplimiento: el especialista existe, está en el cuadro, y te verá. Solo que dentro de tres semanas.</p>

<h2>Cuándo el seguro "funciona" y cuándo no</h2>
<p>Para revisiones programadas sin urgencia (análisis anuales, revisión ginecológica de rutina, chequeo general) el seguro privado es perfectamente válido. Las esperas de 2-4 semanas son aceptables.</p>
<p>Donde falla es en lo que podríamos llamar <strong>"urgencias no emergentes"</strong>: síntomas que aparecen esta semana, que no son una emergencia vital pero que necesitan diagnóstico en días, no en meses. Un dolor articular que empeora, una mancha en la piel que cambia, palpitaciones que llevan una semana. Para esto, la espera de 6 semanas es inaceptable.</p>

<h2>La solución real: acceso prioritario dentro de tu seguro</h2>
<p>Existe una tercera vía entre "esperar lo que toque" y "pagar la consulta completa de tu bolsillo": las <strong>plazas prioritarias en centros concertados</strong>. Muchas clínicas privadas del cuadro de tu aseguradora reservan un porcentaje de su agenda para citas de acceso preferente. No son huecos de urgencias hospitalarias, sino consultas ordinarias que se liberan con antelación para quienes las necesitan antes.</p>
<p>Med Connect gestiona el acceso a esas plazas con una tarifa de prioridad de 5 a 29€ según la urgencia. Tu consulta sigue facturándose a tu aseguradora exactamente igual — solo que la fecha es esta semana, no dentro de un mes y medio.</p>
    `,
  },
  {
    slug: 'medicina-privada-vs-seguro-privado-vs-seguridad-social',
    title: 'Medicina privada, seguro médico y Seguridad Social: cuándo cada opción falla',
    description: 'Una comparativa honesta de los tres sistemas de salud en España: qué garantiza cada uno, dónde falla cada uno, y cómo combinarlos inteligentemente.',
    category: 'valor',
    publishedAt: '2026-06-14',
    readingMinutes: 7,
    relatedSpecialty: null,
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Médico con estetoscopio en clínica moderna',
    content: `
<p>En España convivimos con tres sistemas de acceso a la salud y casi nadie entiende bien qué garantiza cada uno. Lo cual lleva a dos errores frecuentes: infrautilizar el sistema público cuando es la mejor opción, y esperar del seguro privado lo que no puede ofrecer.</p>

<h2>Sistema 1: Seguridad Social (sanidad pública)</h2>
<p><strong>Qué garantiza:</strong> Cobertura universal, coste cero en el punto de uso, alta calidad técnica en la mayoría de patologías, especialmente las graves y crónicas.</p>
<p><strong>Dónde falla:</strong> Tiempos de espera para especialistas y pruebas diagnósticas. Para una colonoscopia en Madrid la espera media es de 45 días; para un TAC en algunas comunidades, hasta 60. Para especialidades de alta demanda (reumatología, dermatología, neurología), 2-4 meses.</p>
<p><strong>Cuándo es la mejor opción:</strong> Patologías graves que requieren hospitalización, oncología, enfermedades crónicas complejas, urgencias reales. El sistema público español en estas áreas está entre los mejores del mundo.</p>

<h2>Sistema 2: Seguro médico privado</h2>
<p><strong>Qué garantiza:</strong> Acceso a una red de especialistas privados con tiempos de espera menores que la pública, instalaciones más modernas en muchos casos, y mayor disponibilidad horaria (tardes, fines de semana).</p>
<p><strong>Dónde falla:</strong> Cuadros médicos con cobertura desigual según ciudad y especialidad. Esperas de 3-6 semanas en especialidades de alta demanda son habituales incluso con póliza vigente. Copagos no siempre transparentes. El seguro más barato suele tener un cuadro muy limitado fuera de capitales.</p>
<p><strong>Cuándo es la mejor opción:</strong> Revisiones periódicas, especialidades de baja demanda, medicina preventiva, segunda opinión médica. Con la prima adecuada, también para acceso ágil en ciudades con cuadros amplios.</p>

<h2>Sistema 3: Pago directo (medicina privada sin seguro)</h2>
<p><strong>Qué garantiza:</strong> Acceso inmediato. Puedes llamar hoy a cualquier clínica privada y tener cita mañana. Total flexibilidad de elección de especialista y centro.</p>
<p><strong>Dónde falla:</strong> Coste. Una consulta con especialista en clínica privada en Madrid o Barcelona cuesta entre 60 y 150€. Pruebas adicionales (eco, análisis, TAC) van aparte. Sin seguro, el coste de un proceso diagnóstico puede llegar a 500-1.000€ fácilmente.</p>
<p><strong>Cuándo es la mejor opción:</strong> Segunda opinión puntual, especialidades no cubiertas por tu seguro, cuando necesitas cita inmediata y el coste es asumible.</p>

<h2>La cuarta vía: tu seguro + acceso prioritario</h2>
<p>Para el escenario más común — tienes seguro privado pero no puedes esperar 4 semanas para el especialista que necesitas — existe una alternativa que combina lo mejor de los dos mundos privados: usar tu póliza para pagar la consulta (sin coste adicional de la consulta) y pagar una pequeña tarifa de prioridad (5-29€) para conseguir la cita esta semana en lugar de dentro de un mes.</p>
<p>Es lo que hacemos en Med Connect: accedemos a huecos prioritarios en clínicas de tu cuadro asegurador que de otra manera no verías disponibles en el buscador de tu aseguradora.</p>

<h2>Regla práctica para decidir</h2>
<table>
  <thead><tr><th>Situación</th><th>Mejor opción</th></tr></thead>
  <tbody>
    <tr><td>Emergencia vital</td><td>Urgencias hospitalarias (pública)</td></tr>
    <tr><td>Patología grave / crónica compleja</td><td>Seguridad Social</td></tr>
    <tr><td>Revisión programada sin urgencia</td><td>Seguro privado (por turno normal)</td></tr>
    <tr><td>Síntoma que no puede esperar semanas</td><td>Seguro + acceso prioritario (Med Connect)</td></tr>
    <tr><td>Segunda opinión puntual</td><td>Pago directo en clínica de confianza</td></tr>
  </tbody>
</table>
    `,
  },

  // ── Cluster por especialidad ───────────────────────────────────────────────
  {
    slug: 'cuando-necesitas-cardiologo-privado',
    title: 'Cuándo necesitas un cardiólogo: síntomas que no puedes ignorar',
    description: 'Palpitaciones, dolor en el pecho, fatiga inusual... ¿cuándo son una señal de alarma cardíaca? Guía para saber cuándo acudir al cardiólogo y con qué urgencia.',
    category: 'especialidad',
    publishedAt: '2026-06-15',
    readingMinutes: 5,
    relatedSpecialty: 'cardiologia',
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1628348070889-cb656235b4eb?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Cardiólogo revisando electrocardiograma',
    content: `
<p>El corazón raramente avisa con claridad. Los síntomas cardíacos a menudo son vagos, intermitentes o fácilmente confundibles con ansiedad, reflujo o cansancio. Por eso, saber cuándo acudir al cardiólogo — y con qué urgencia — puede marcar una diferencia importante.</p>

<h2>Síntomas que requieren valoración cardiológica</h2>
<h3>Con urgencia (esta semana, no en 6 semanas)</h3>
<ul>
  <li><strong>Palpitaciones frecuentes o irregulares:</strong> Sensación de que el corazón se "salta" latidos, late muy rápido o de forma errática durante más de unos segundos, especialmente si se acompañan de mareo.</li>
  <li><strong>Dolor o presión en el pecho:</strong> Cualquier molestia en la zona del esternón o el pecho izquierdo que dure más de unos minutos, aunque sea leve. El dolor de origen cardíaco suele describirse como "presión", "peso" o "opresión".</li>
  <li><strong>Disnea de esfuerzo nueva:</strong> Si antes subías escaleras sin problema y ahora te quedas sin aire en el primer tramo, merece evaluación.</li>
  <li><strong>Síncope o pre-síncope:</strong> Desmayo o sensación inminente de desmayo, especialmente si ocurre durante el ejercicio.</li>
  <li><strong>Hinchazón de piernas persistente:</strong> Edema bilateral en tobillos y pantorrillas que no mejora con el reposo puede indicar insuficiencia cardíaca.</li>
</ul>

<h3>Sin urgencia extrema, pero sin aplazar meses</h3>
<ul>
  <li>Hipertensión arterial diagnosticada que no se controla bien con medicación</li>
  <li>Colesterol elevado que no responde a cambios de dieta</li>
  <li>Antecedentes familiares de infarto o muerte súbita antes de los 55 años</li>
  <li>Chequeo previo a inicio de deporte intenso (especialmente en mayores de 40)</li>
</ul>

<h2>¿Qué hace el cardiólogo en la primera consulta?</h2>
<p>La consulta de cardiología inicial incluye habitualmente: anamnesis (historia clínica), exploración física (auscultación, medición de tensión, pulso), electrocardiograma (ECG) de 12 derivaciones, y valoración de pruebas complementarias previas. En función de lo encontrado, puede solicitar ecocardiograma, Holter o prueba de esfuerzo.</p>
<p>El ECG es rápido, indoloro y da mucha información. La mayoría de clínicas privadas lo incluyen en la primera consulta sin coste adicional.</p>

<h2>Esperas para cardiología privada en España</h2>
<p>En el sistema público, la espera media para cardiología supera los 70 días. En seguros privados, la situación mejora pero sigue siendo de 3-6 semanas en ciudades grandes. Si tus síntomas son recientes y te preocupan, no esperes 6 semanas — consigue cita esta semana a través de acceso prioritario.</p>
    `,
  },
  {
    slug: 'cuando-ir-dermatologo-señales-piel',
    title: 'Cuándo ir al dermatólogo: señales de la piel que no debes ignorar',
    description: 'Desde un lunar que cambia hasta una erupción que no cura. Guía para identificar cuándo una alteración cutánea necesita revisión dermatológica urgente.',
    category: 'especialidad',
    publishedAt: '2026-06-17',
    readingMinutes: 5,
    relatedSpecialty: 'dermatologia',
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Dermatólogo examinando la piel de un paciente',
    content: `
<p>La piel es el órgano más visible del cuerpo y, paradójicamente, el que más tardamos en consultar. Nos habituamos a las manchas, a los lunares que cambian despacio, a las erupciones que "seguro que no es nada". A veces tienen razón. Otras veces, no.</p>

<h2>La regla ABCDE de los lunares</h2>
<p>Para evaluar si un lunar (nevus) merece revisión urgente, los dermatólogos usan el criterio ABCDE:</p>
<ul>
  <li><strong>A — Asimetría:</strong> Si divides el lunar en dos mitades, ¿son iguales? La asimetría es una señal de alarma.</li>
  <li><strong>B — Bordes:</strong> Bordes irregulares, dentados o difusos merecen revisión.</li>
  <li><strong>C — Color:</strong> Un lunar de varios colores (marrón claro, marrón oscuro, negro, rojo o azulado) es sospechoso.</li>
  <li><strong>D — Diámetro:</strong> Lunares de más de 6 mm (tamaño de un borrador de lápiz) deben revisarse.</li>
  <li><strong>E — Evolución:</strong> Cualquier lunar que haya cambiado en las últimas semanas o meses merece valoración urgente, independientemente del resto de criterios.</li>
</ul>
<p>Si uno o más de estos criterios se cumplen, pide cita con dermatólogo esta semana, no dentro de dos meses.</p>

<h2>Otras lesiones que requieren valoración dermatológica</h2>
<ul>
  <li><strong>Úlceras que no cicatrizan:</strong> Una herida en la piel que lleva más de 3 semanas sin cerrar necesita evaluación.</li>
  <li><strong>Erupciones generalizadas de inicio súbito:</strong> Especialmente si se acompañan de fiebre o toma reciente de medicación.</li>
  <li><strong>Psoriasis sin controlar:</strong> Si tienes psoriasis diagnosticada y el brote actual es el más intenso que has tenido, el dermatólogo puede ajustar tratamiento.</li>
  <li><strong>Acné severo en adultos:</strong> El acné en adultos (especialmente en mujeres) puede tener un componente hormonal que requiere tratamiento específico.</li>
  <li><strong>Pérdida de cabello en placas:</strong> La alopecia areata (pérdida en zonas delimitadas) tiene tratamientos eficaces si se aborda pronto.</li>
</ul>

<h2>Dermatoscopia: la herramienta clave</h2>
<p>La dermatoscopia es una técnica no invasiva que permite al dermatólogo ver las capas superficiales de la piel con una magnificación de 10-40x. Esencial para valorar lunares. La mayoría de dermatólogos privados la incluyen en la revisión de lunares o la cobran como un complemento de 20-40€. Pregunta al reservar si está incluida.</p>
    `,
  },
  {
    slug: 'cuando-acudir-ginecologo-privado',
    title: 'Cuándo acudir a la ginecóloga: síntomas que no deben esperar meses',
    description: 'Dolor pélvico, sangrado irregular, bultos mamarios... Cuándo la revisión ginecológica es urgente y cómo conseguir cita rápida con tu seguro.',
    category: 'especialidad',
    publishedAt: '2026-06-18',
    readingMinutes: 5,
    relatedSpecialty: 'ginecologia',
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Médica especialista en consulta',
    content: `
<p>La revisión ginecológica anual es rutinaria, pero hay síntomas que no pueden esperar al siguiente chequeo programado. Identificar cuándo la consulta ginecológica es urgente puede marcar la diferencia en el diagnóstico precoz de patologías que responden muy bien al tratamiento temprano.</p>

<h2>Síntomas ginecológicos que requieren cita esta semana</h2>
<ul>
  <li><strong>Sangrado vaginal fuera de la menstruación:</strong> En mujeres premenopáusicas, el sangrado entre periodos o muy abundante durante la menstruación puede indicar miomas, pólipos o alteraciones hormonales. En posmenopáusicas, cualquier sangrado es una señal de alarma que requiere valoración.</li>
  <li><strong>Dolor pélvico persistente:</strong> Dolor o presión en la zona baja del abdomen que dura más de una semana, especialmente si no se relaciona con la regla.</li>
  <li><strong>Flujo vaginal inusual con mal olor o picor intenso:</strong> Puede indicar infección que requiere tratamiento antibiótico específico.</li>
  <li><strong>Bulto o cambio en una mama:</strong> Cualquier masa palpable nueva, retracción del pezón, cambio en la piel de la mama o secreción espontánea del pezón merece evaluación en días, no semanas.</li>
  <li><strong>Dolor en la relación sexual (dispareunia):</strong> Puede tener múltiples causas tratables, desde sequedad vaginal hasta endometriosis.</li>
</ul>

<h2>Cuándo es la revisión anual y cuándo es más</h2>
<p>La revisión ginecológica anual en mujeres con factores de riesgo debe incluir: exploración mamaria, citología cervical (Papanicolau), y revisión pélvica. En mujeres sin factores de riesgo, la citología puede espaciarse cada 3 años si los resultados anteriores son normales (según protocolo del SNS).</p>
<p>Sin embargo, cualquiera de los síntomas listados arriba convierte la consulta en prioritaria, independientemente de cuándo fue la última revisión.</p>

<h2>La espera para ginecología privada</h2>
<p>En el sistema público, la espera para ginecología no urgente es de 30-60 días según comunidad. En seguros privados, oscila entre 2 y 5 semanas para el primer especialista disponible en tu cuadro. Si el síntoma que tienes no puede esperar ese tiempo, acceder a una plaza prioritaria permite ver a la ginecóloga en 24-72 horas.</p>
    `,
  },
  {
    slug: 'cuando-necesitas-urologo',
    title: 'Cuándo necesitas un urólogo: síntomas urológicos que merecen atención rápida',
    description: 'Dificultad para orinar, sangre en orina, dolor en los riñones... Los síntomas urológicos que deben evaluarse pronto y qué esperar de la primera consulta.',
    category: 'especialidad',
    publishedAt: '2026-06-19',
    readingMinutes: 5,
    relatedSpecialty: 'urologia',
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1551190822-a9333d879b1f?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Médico revisando resultados de laboratorio',
    content: `
<p>La urología abarca una amplia gama de patologías, desde infecciones de orina hasta cáncer de próstata, pasando por cálculos renales, disfunción eréctil e incontinencia. Muchos de estos problemas se tratan mejor cuanto antes se diagnostican.</p>

<h2>Síntomas urológicos que no deben ignorarse</h2>
<h3>Requieren valoración urgente (días, no semanas)</h3>
<ul>
  <li><strong>Sangre en la orina (hematuria):</strong> La hematuria visible, aunque sea en una sola ocasión y sin dolor, es siempre motivo de consulta urológica. Las causas van desde infecciones hasta litiasis o tumores de vejiga o riñón.</li>
  <li><strong>Dolor intenso en el flanco o la espalda baja:</strong> El típico "dolor de piedra" (cólico nefrítico) es uno de los dolores más intensos que existen. Requiere diagnóstico urgente para confirmar el tamaño y ubicación del cálculo.</li>
  <li><strong>Incapacidad para orinar (retención urinaria):</strong> Urgencia hospitalaria si es completa.</li>
  <li><strong>Testículo doloroso e hinchado de aparición súbita:</strong> La torsión testicular es una emergencia quirúrgica que requiere tratamiento en horas.</li>
</ul>

<h3>Merecen cita en la próxima semana</h3>
<ul>
  <li>Dificultad para iniciar la micción o chorro débil (especialmente en hombres mayores de 50)</li>
  <li>Necesidad de orinar con frecuencia, especialmente por la noche</li>
  <li>PSA elevado en analítica reciente</li>
  <li>Infecciones de orina recurrentes (más de 3 en un año)</li>
  <li>Disfunción eréctil de inicio reciente (puede ser señal de alteración cardiovascular)</li>
</ul>

<h2>El PSA y el cribado de cáncer de próstata</h2>
<p>El PSA (antígeno prostático específico) es una proteína que se mide en una analítica de sangre rutinaria. Un valor elevado no significa automáticamente cáncer — muchas hipertrofias benignas de próstata también elevan el PSA — pero sí indica que un urólogo debe interpretar el resultado en contexto clínico. No postergues esta consulta: el cáncer de próstata detectado en estadio localizado tiene tasas de curación superiores al 95%.</p>
    `,
  },

  // ── Cluster por síntomas / condiciones ────────────────────────────────────
  {
    slug: 'palpitaciones-cuando-preocuparse',
    title: 'Palpitaciones: cuándo son inofensivas y cuándo debes ver a un cardiólogo',
    description: 'Las palpitaciones son muy comunes pero no siempre inocuas. Aprende a distinguir cuándo son una respuesta normal al estrés y cuándo indican una arritmia que debe evaluarse.',
    category: 'sintomas',
    publishedAt: '2026-06-20',
    readingMinutes: 5,
    relatedSpecialty: 'cardiologia',
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1530026186672-2cd00ffc50fe?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Electrocardiograma mostrando ritmo cardíaco',
    content: `
<p>Las palpitaciones — esa sensación de notar los propios latidos, de que el corazón late fuerte, rápido o de forma irregular — son uno de los motivos de consulta cardiológica más frecuentes. Y también uno de los que más angustia generan, precisamente porque el corazón está implicado.</p>
<p>La buena noticia: la gran mayoría de las palpitaciones no indican ninguna enfermedad cardíaca grave. La mala: algunas sí, y saber distinguirlas importa.</p>

<h2>Palpitaciones benignas: cuándo son normales</h2>
<p>Las siguientes situaciones pueden causar palpitaciones sin que haya ninguna patología cardíaca:</p>
<ul>
  <li>Consumo elevado de cafeína (café, té, bebidas energéticas, guaraná)</li>
  <li>Ansiedad o ataques de pánico</li>
  <li>Ejercicio físico intenso</li>
  <li>Falta de sueño</li>
  <li>Fiebre o deshidratación</li>
  <li>Hipoglucemia (bajada de azúcar)</li>
  <li>Algunos medicamentos (descongestionantes nasales, broncodilatadores, antidepresivos)</li>
  <li>Consumo de alcohol o tabaco</li>
</ul>
<p>Si las palpitaciones duran segundos, son aisladas, se relacionan claramente con alguno de estos factores y desaparecen solas, probablemente son benignas.</p>

<h2>Cuándo las palpitaciones necesitan evaluación cardiológica</h2>
<p>Consulta con un cardiólogo si las palpitaciones:</p>
<ul>
  <li>Duran varios minutos o son prolongadas</li>
  <li>Se acompañan de mareo, presíncope o desmayo</li>
  <li>Ocurren durante el ejercicio físico</li>
  <li>Se acompañan de dolor o presión en el pecho</li>
  <li>Son muy frecuentes (varias veces al día) sin causa aparente</li>
  <li>Tienen un inicio y fin bruscos ("como si me dieran un interruptor")</li>
  <li>Tienes antecedentes familiares de muerte súbita o cardiopatía antes de los 50 años</li>
</ul>

<h2>Qué pruebas pedirá el cardiólogo</h2>
<p>La evaluación estándar de palpitaciones incluye electrocardiograma (ECG) en reposo y posiblemente un Holter de 24 o 48 horas (ECG ambulatorio que registra el ritmo cardíaco mientras haces tu vida normal). Si las palpitaciones son muy intermitentes, puede indicarse un monitor de eventos de 30 días.</p>
<p>La clave es capturar el ritmo cardíaco durante un episodio. Por eso, si tienes palpitaciones frecuentes, el Holter suele ser más informativo que el ECG puntual en consulta.</p>
    `,
  },
  {
    slug: 'dolor-espalda-baja-cuando-traumatologo',
    title: 'Dolor de espalda baja: cuándo es normal y cuándo ver a un traumatólogo',
    description: 'El 80% de los adultos sufrirá lumbalgia en algún momento. La mayoría se resuelve sola, pero hay señales de alarma que indican que necesitas valoración especializada urgente.',
    category: 'sintomas',
    publishedAt: '2026-06-21',
    readingMinutes: 6,
    relatedSpecialty: 'traumatologia',
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Fisioterapeuta tratando dolor de espalda',
    content: `
<p>El dolor de espalda baja (lumbalgia) es la principal causa de discapacidad laboral en España y uno de los motivos de consulta médica más frecuentes. La buena noticia: el 90% de los episodios agudos de lumbalgia se resuelven solos en 4-6 semanas con reposo relativo, antiinflamatorios y movimiento progresivo. La mala: un 10% tiene causas que requieren diagnóstico y tratamiento especializado.</p>

<h2>Lumbalgia mecánica: cuándo no necesitas especialista</h2>
<p>La lumbalgia mecánica es la más común. Se caracteriza por:</p>
<ul>
  <li>Dolor que empeora con el movimiento y mejora con el reposo</li>
  <li>Inicio relacionado con un esfuerzo, giro brusco o mala postura</li>
  <li>No irradia a la pierna (o irradia poco, hasta la rodilla)</li>
  <li>No hay debilidad en las piernas</li>
  <li>No hay pérdida de control de vejiga o intestino</li>
</ul>
<p>En este caso, el médico de cabecera puede manejarlo con analgesia, reposo relativo y fisioterapia. No necesitas especialista en la fase aguda.</p>

<h2>Señales de alarma que requieren valoración urgente</h2>
<p>Consulta con traumatólogo (o ve a urgencias si son muy intensas) si el dolor se acompaña de:</p>
<ul>
  <li><strong>"Banderas rojas" neurológicas:</strong> Debilidad en una o ambas piernas, pérdida de sensibilidad en la pierna o el pie, incontinencia o retención urinaria/intestinal. Pueden indicar compromiso medular.</li>
  <li><strong>Dolor que no mejora en absoluto con el reposo</strong> o que empeora de noche (puede indicar causa inflamatoria o tumoral).</li>
  <li><strong>Fiebre + dolor lumbar:</strong> Posible infección vertebral o discal (espondilodiscitis).</li>
  <li><strong>Antecedentes de cáncer + dolor lumbar nuevo:</strong> Descartar metástasis vertebral.</li>
  <li><strong>Traumatismo previo significativo</strong> (caída, accidente de tráfico).</li>
  <li><strong>Lumbalgia en mayores de 50 sin episodios previos.</strong></li>
</ul>

<h2>Hernia discal: cuándo operar y cuándo no</h2>
<p>La hernia discal es una de las causas más frecuentes de lumbalgia con ciática (dolor que irradia por la pierna). El 80-90% de las hernias discales se tratan de forma conservadora (fisioterapia, analgesia, infiltraciones). La cirugía se reserva para casos con déficit neurológico progresivo, dolor intratable o síndrome de cauda equina.</p>
<p>El traumatólogo valorará con resonancia magnética (RM) si la hernia es la causa de tus síntomas y qué grado de afectación nerviosa existe.</p>
    `,
  },
  {
    slug: 'manchas-piel-cuando-ver-dermatologo',
    title: 'Manchas en la piel: una guía para saber cuándo preocuparse',
    description: 'No todas las manchas son iguales. Aprende a distinguir manchas benignas de lesiones que requieren revisión dermatológica urgente con la regla ABCDE y otros criterios clínicos.',
    category: 'sintomas',
    publishedAt: '2026-06-22',
    readingMinutes: 5,
    relatedSpecialty: 'dermatologia',
    relatedCity: null,
    coverImage: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&h=500&fit=crop&q=80',
    coverAlt: 'Dermatoscopia revisión de lunares',
    content: `
<p>La piel de un adulto tiene de media entre 10 y 40 lunares. Añade manchas solares, angiomas, verrugas y otras lesiones benignas comunes, y resulta que revisarse la piel puede parecer una tarea interminable. La clave es saber en qué fijarse.</p>

<h2>Tipos de manchas cutáneas y su relevancia</h2>
<h3>Generalmente benignas (vigila si cambian)</h3>
<ul>
  <li><strong>Léntigos solares ("manchas del sol"):</strong> Manchas marrón claro uniformes que aparecen en zonas expuestas al sol (manos, escote, cara). Benignas, pero el dermatólogo puede confirmar con dermatoscopia.</li>
  <li><strong>Queratosis seborreicas:</strong> Lesiones verrugosas, marrón o negras, de aspecto "pegado" a la piel. Muy comunes en mayores de 40. Benignas salvo que cambien bruscamente.</li>
  <li><strong>Angiomas rubí (puntos rubí):</strong> Pequeñas manchas rojas redondas, muy frecuentes. Benignas.</li>
  <li><strong>Dermatofibroma:</strong> Nódulo firme, marrón, a menudo en piernas. Benigno.</li>
</ul>

<h3>Requieren revisión dermatológica</h3>
<ul>
  <li><strong>Cualquier lesión que aplique la regla ABCDE</strong> (Asimetría, Bordes irregulares, Color heterogéneo, Diámetro &gt;6mm, Evolución reciente)</li>
  <li><strong>Lesión que sangra sin traumatismo previo</strong></li>
  <li><strong>Mancha que pica o duele persistentemente</strong></li>
  <li><strong>Úlcera o costra que no cicatriza en 3 semanas</strong></li>
  <li><strong>Lesión perlada o brillante en zona fotoexpuesta</strong> (puede ser carcinoma basocelular)</li>
</ul>

<h2>El melanoma: detección precoz lo cambia todo</h2>
<p>El melanoma es el cáncer de piel más grave, pero también uno de los que mejor responde al tratamiento cuando se detecta en estadio I. La supervivencia a 5 años del melanoma localizado es superior al 98%. En estadio metastásico, cae al 20-30%.</p>
<p>Por eso la revisión de lunares por dermatólogo con dermatoscopia, aunque sea una vez al año en personas con muchos lunares o antecedentes familiares, es una de las inversiones preventivas con mayor relación coste-beneficio.</p>

<h2>Revisión de lunares: ¿cada cuánto?</h2>
<ul>
  <li>Sin factores de riesgo: cada 2-3 años a partir de los 30</li>
  <li>Piel clara, muchos lunares (>50), o antecedentes familiares de melanoma: anual</li>
  <li>Lesión que aplica ABCDE o ha cambiado recientemente: esta semana</li>
</ul>
    `,
  },
];

// ── Accessors ──────────────────────────────────────────────────────────────

export function getAllBlogPosts() {
  return [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );
}

export function getBlogPost(slug) {
  return BLOG_POSTS.find((p) => p.slug === slug) || null;
}

export function getBlogPostsByCategory(category) {
  return BLOG_POSTS.filter((p) => p.category === category).sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );
}

export function getBlogPostsBySpecialty(specialtySlug) {
  return BLOG_POSTS.filter((p) => p.relatedSpecialty === specialtySlug);
}

export function getAllBlogSlugs() {
  return BLOG_POSTS.map((p) => p.slug);
}
