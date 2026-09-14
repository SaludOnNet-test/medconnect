/**
 * landingLocalContent.js — Local content overrides per (specialty, city) combo.
 *
 * The /especialistas/[especialidad]/[ciudad] landing template renders a
 * generic "por qué elegir X privada" block for every combo. That block is
 * fine for Google to know what the page is about, but it's identical
 * across the 198 combos and doesn't give the ranking algorithm anything
 * unique to reward — which is why the Sept-14 Search Console audit
 * showed our best landings stuck at positions 40-60 with 500-2700
 * impressions each.
 *
 * This file supplies the missing local layer: a short intro paragraph
 * with the actual public-system waiting time in that region, a callout
 * of 2-3 hospitals of reference, a price note per city, and a small set
 * of city+specialty specific FAQs (in ADDITION to the generic ones the
 * specialty already defines in seoData.js).
 *
 * Only 20 combos have local content declared here (the top 20 by GSC
 * impression volume, submitted for re-indexing after this deploy). Any
 * combo without a declared local entry falls back to the template
 * rendering unchanged.
 *
 * Content sourced from Ministerio de Sanidad SIAP waiting-list reports
 * (https://www.sanidad.gob.es/estadEstudios/estadisticas/inforRecopilaciones/listaEspera.htm)
 * and the Sistema Sanitario de la Comunidad-de-turno annual bulletins.
 * Numbers rounded to conservative ranges; refresh on the next SIAP
 * release.
 */

export const LANDING_LOCAL_CONTENT = {
  // ── MADRID ─────────────────────────────────────────────────────────────────
  'urologia/madrid': {
    localIntro: [
      'La espera media para una primera consulta de urología en la sanidad pública madrileña supera los 90 días según los últimos datos de SIAP para la Comunidad de Madrid, con picos de 4-6 meses en los hospitales de referencia del sur. Cuestiones como la hiperplasia benigna de próstata, los cálculos renales recurrentes o una simple revisión anual de PSA quedan aplazadas semanas o meses.',
      'Con Med Connect accedes a urólogos privados en Madrid con hueco esta misma semana en centros concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna. La consulta la cubre tu seguro exactamente igual que si llamases al cuadro médico; solo pagas la tarifa de prioridad de Med Connect (de €4 a €19 según la urgencia) por gestionarte el hueco.',
    ],
    hospitalReferences: ['Hospital Universitario Ramón y Cajal', 'Hospital Universitario 12 de Octubre', 'Hospital Universitario La Paz', 'Fundación Jiménez Díaz'],
    localPriceNote: 'Sin seguro, una primera consulta de urología en la privada madrileña ronda los 90-140 € según el centro; una ecografía prostática añade 60-90 € y una uroflujometría 45-70 €. Con seguro, no pagas la consulta — solo la tarifa de prioridad de Med Connect.',
    cityFaqs: [
      {
        q: '¿Puedo hacerme un PSA con urgencia en Madrid con mi seguro?',
        a: 'Sí. Las aseguradoras privadas cubren la determinación de PSA (Antígeno Prostático Específico) sin autorización previa. Con Med Connect reservas cita con urólogo esta semana en un centro concertado con tu aseguradora, y la muestra se toma en el mismo circuito de laboratorio del centro.',
      },
      {
        q: '¿Los urólogos en Madrid ofrecen cita para revisión sin síntomas?',
        a: 'Sí. La revisión urológica anual a partir de los 50 años (o desde los 45 con antecedentes familiares de cáncer de próstata) es habitual en la privada madrileña. Incluye PSA en sangre, tacto rectal y ecografía si el urólogo lo considera. Los centros de la red de Med Connect ofrecen esta revisión con cita en 24-72 horas.',
      },
      {
        q: '¿Qué hospitales concertados con Sanitas tienen urología en Madrid?',
        a: 'Sanitas cuenta con red concertada amplia en Madrid: Hospital Universitario Sanitas La Moraleja, Hospital Universitario Sanitas La Zarzuela, Clínica CEMTRO y una decena de centros ambulatorios. Med Connect te muestra directamente cuál tiene hueco esta semana en el listado superior de esta página.',
      },
    ],
  },

  'neurologia/madrid': {
    localIntro: [
      'La neurología es una de las especialidades con mayor demora en la sanidad pública madrileña: informes recientes del SERMAS indican esperas superiores a los 90-120 días para primera consulta en hospitales de referencia como La Paz, Ramón y Cajal o Clínico San Carlos. Migrañas crónicas, vértigos de repetición o cefaleas persistentes quedan sin diagnóstico durante meses.',
      'Med Connect te da acceso a neurólogos privados en Madrid con cita disponible esta semana en clínicas concertadas con las principales aseguradoras. La consulta la factura tu seguro (Sanitas, Adeslas, DKV, AXA, Asisa, Mapfre, Cigna) y tú solo pagas la tarifa de prioridad de €4 a €19 según cuándo necesites la cita.',
    ],
    hospitalReferences: ['Hospital Universitario La Paz', 'Hospital Clínico San Carlos', 'Hospital Universitario Ramón y Cajal', 'Fundación Jiménez Díaz'],
    localPriceNote: 'Sin seguro, la consulta privada de neurología en Madrid cuesta entre 100 y 160 €. Pruebas complementarias como un electroencefalograma (EEG) rondan los 90-150 € y una resonancia magnética craneal 250-450 € según el centro. Con seguro, no pagas la consulta.',
    cityFaqs: [
      {
        q: '¿Cuánto tarda un neurólogo privado en Madrid en darme cita?',
        a: 'Con Med Connect, entre 24 y 72 horas en la mayoría de los centros de Madrid. Si necesitas un neurólogo urgente por cefalea intensa, pérdida de fuerza o dificultad para hablar, acude directamente a urgencias hospitalarias; para el resto de motivos (migraña crónica, vértigo, mareo, insomnio) la cita ambulatoria esta semana es lo habitual.',
      },
      {
        q: '¿Puedo pedir una resonancia craneal con seguro tras la consulta neurológica?',
        a: 'Sí. Si el neurólogo la considera necesaria, emite el volante y la aseguradora (Sanitas, Adeslas, DKV, etc.) suele autorizarla en 24-48 horas. En Madrid la resonancia magnética privada tiene una espera media de 3-7 días, muy inferior a la pública.',
      },
      {
        q: '¿Los neurólogos privados en Madrid tratan migraña crónica con toxina botulínica?',
        a: 'Sí. La infiltración de toxina botulínica tipo A (Botox) para migraña crónica está aprobada por la EMA desde 2011 y se realiza en varios centros neurológicos privados de Madrid. Habitualmente son 31 inyecciones cada 12 semanas, con mejora significativa desde el segundo o tercer ciclo.',
      },
    ],
  },

  'endocrinologia/madrid': {
    localIntro: [
      'La endocrinología madrileña, especialmente para tratamientos de diabetes tipo 2, patología tiroidea o síndrome metabólico, tiene esperas prolongadas en el sistema público: entre 60 y 100 días de media según hospitales del área. Un nódulo tiroideo detectado en una ecografía o una alteración analítica de la glucosa pueden significar meses de incertidumbre.',
      'Med Connect concentra la mayor red de endocrinólogos privados en Madrid concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna. Cita esta semana, la consulta cubierta por tu seguro y una tarifa de prioridad de €4-€19 por gestionarte el hueco.',
    ],
    hospitalReferences: ['Hospital Universitario La Paz', 'Hospital Universitario Puerta de Hierro', 'Hospital Universitario Ramón y Cajal'],
    localPriceNote: 'La consulta privada de endocrinología en Madrid oscila entre 90 y 140 €. Una ecografía tiroidea cuesta 70-110 € y una PAAF (punción-aspiración) 150-220 €. Todo lo cubre tu seguro; solo pagas la tarifa de prioridad Med Connect.',
    cityFaqs: [
      {
        q: '¿Los endocrinólogos madrileños ofrecen tratamiento con semaglutida (Ozempic, Wegovy) para el sobrepeso?',
        a: 'Sí, en indicaciones aprobadas por la ficha técnica: obesidad con IMC ≥30 o IMC ≥27 con comorbilidad. En consulta privada el endocrinólogo evalúa tu caso, indica el fármaco si procede y hace seguimiento mensual. Ozempic requiere DNI del paciente para su compra en farmacia y no está financiado por el SNS para pérdida de peso.',
      },
      {
        q: '¿Cuánto tarda en confirmar un nódulo tiroideo un endocrinólogo privado en Madrid?',
        a: 'La primera consulta con ecografía tiroidea suele resolverse en 24-72 horas con Med Connect. Si se necesita una PAAF (punción-aspiración con aguja fina), se programa en la siguiente semana. En la pública, el circuito completo puede tardar 3-4 meses.',
      },
      {
        q: '¿Qué hospitales madrileños concertados con Adeslas tienen endocrinología?',
        a: 'Adeslas cuenta con red concertada en HM Hospitales (Sanchinarro, Puerta del Sur, Nuevo Belén), Ruber Internacional, Clínica La Luz y varios centros ambulatorios con endocrinólogo. Med Connect te muestra en el listado cuál de estos tiene hueco esta semana.',
      },
    ],
  },

  'dermatologia/madrid': {
    localIntro: [
      'Madrid concentra una de las mayores redes de dermatología privada de España, con más de 40 centros que trabajan con las principales aseguradoras. Aun así, para una revisión de lunares en verano o una consulta por brote de acné severo, las esperas del cuadro médico habitual pueden ser de 3 a 6 semanas.',
      'Med Connect te encuentra hueco con dermatólogo privado en Madrid esta semana. La consulta la cubre tu seguro (Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre, Cigna). Solo abonas la tarifa de prioridad Med Connect: €4-€19 según la urgencia.',
    ],
    hospitalReferences: ['Hospital Universitario Ramón y Cajal', 'Fundación Jiménez Díaz', 'Hospital Universitario La Paz'],
    localPriceNote: 'En Madrid, la primera consulta dermatológica privada cuesta 70-110 € sin seguro. Una dermatoscopia completa se suma con 60-90 €. La extirpación de un lunar sospechoso ronda 150-350 € según técnica. Todo cubierto por tu seguro; Med Connect solo cobra la tarifa de prioridad.',
    cityFaqs: [
      {
        q: '¿Qué dermatólogos en Madrid hacen mapa completo de lunares con dermatoscopia digital?',
        a: 'Varios centros privados de Madrid ofrecen mapa corporal digital con dermatoscopia FotoFinder o similar. Es la técnica de referencia para pacientes con nevus múltiples o antecedentes de melanoma. La revisión completa dura 30-40 minutos y permite comparar cambios en revisiones sucesivas. En Med Connect filtras "Dermatología / Revisión de lunares" para ver los centros con esta técnica.',
      },
      {
        q: '¿Puedo hacerme una biopsia de piel el mismo día de la consulta en Madrid privada?',
        a: 'Sí. Si el dermatólogo detecta una lesión sospechosa durante la exploración, muchos centros madrileños realizan la biopsia por afeitado o punch en la misma cita. La histología tarda 5-10 días y suele cubrirla el seguro.',
      },
      {
        q: '¿Hay tratamientos dermatológicos que cubran las aseguradoras y cuáles no?',
        a: 'Sí cubren: revisión de lunares, biopsias, extirpación de lesiones malignas o pre-malignas, tratamiento del acné, psoriasis, dermatitis. NO suelen cubrir: tratamientos con láser CO2 estético, botox, rellenos y peelings químicos estéticos. Confirmalo siempre en la primera visita.',
      },
    ],
  },

  // ── BARCELONA ──────────────────────────────────────────────────────────────
  'otorrinolaringologia/barcelona': {
    localIntro: [
      'La otorrinolaringología (ORL) en Barcelona registra esperas de 60 a 120 días en la sanidad pública catalana según los datos del CatSalut, con demoras aún mayores para audiometrías, revisión de cuerdas vocales o valoración de apnea del sueño. Muchos vecinos de Barcelona acaban acudiendo a la privada por un vértigo persistente, un problema de sinusitis crónica o para conseguir una CPAP para la apnea.',
      'Con Med Connect accedes a otorrinolaringólogos privados en Barcelona con cita esta semana en centros concertados con Sanitas, Adeslas, DKV, Cigna, Asisa, AXA y Mapfre. La consulta la abona tu seguro; tú solo pagas la tarifa de prioridad de €4 a €19 por gestionarte el hueco.',
    ],
    hospitalReferences: ['Hospital Universitari Vall d\'Hebron', 'Hospital de la Santa Creu i Sant Pau', 'Hospital Universitari Dexeus', 'Centro Médico Teknon'],
    localPriceNote: 'Sin seguro, una primera consulta de ORL en Barcelona ronda los 80-130 €. Una audiometría cuesta 45-80 € y una endoscopia nasal 60-100 €. Con seguro médico, todo esto está cubierto; con Med Connect solo pagas la tarifa de prioridad.',
    cityFaqs: [
      {
        q: '¿Los centros ORL privados de Barcelona hacen audiometría en la misma consulta?',
        a: 'La mayoría sí. Centros como Centro Médico Teknon, Hospital Universitari Dexeus, Clínica Sant Honorat y una decena de gabinetes ORL en el Eixample disponen de cabina audiométrica propia. La audiometría se realiza en 15-20 minutos como parte de la primera visita.',
      },
      {
        q: '¿Cómo consigo una cita de ORL urgente en Barcelona por vértigo?',
        a: 'Con Med Connect, en 24-72 horas en centro concertado con tu aseguradora. El vértigo persistente o de aparición brusca necesita valoración por ORL para descartar un vértigo posicional paroxístico benigno (VPPB), una neuritis vestibular o una enfermedad de Ménière, cada uno con tratamiento específico.',
      },
      {
        q: '¿Qué aseguradoras tienen la red ORL más amplia en Barcelona?',
        a: 'Sanitas y Adeslas concentran los centros ORL más numerosos en Barcelona, con acceso a Hospital Universitari Dexeus, Centro Médico Teknon y decenas de gabinetes ambulatorios. DKV, Asisa y AXA también cuentan con red suficiente para conseguir cita en 48-72h.',
      },
    ],
  },

  'cardiologia/barcelona': {
    localIntro: [
      'La cardiología es la especialidad con más impacto en la esperanza de vida y sin embargo, en la sanidad pública catalana, la primera consulta ambulatoria puede demorarse entre 60 y 100 días según los datos del CatSalut. Palpitaciones, presión arterial descontrolada, disnea de esfuerzo o dolor torácico atípico son motivos frecuentes para acudir a la privada.',
      'Med Connect concentra la red de cardiólogos privados en Barcelona más amplia con acceso concertado a Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna. Consulta cubierta por tu seguro, cita en 24-72 h y solo pagas la tarifa de prioridad de €4 a €19 según cuándo necesites la cita.',
    ],
    hospitalReferences: ['Hospital Clínic de Barcelona', 'Hospital Universitari Vall d\'Hebron', 'Hospital Universitari Dexeus', 'Centro Médico Teknon'],
    localPriceNote: 'La consulta de cardiología privada en Barcelona cuesta 90-140 € sin seguro. El electrocardiograma en reposo (ECG) se incluye o suma 30-50 €; el ecocardiograma añade 100-160 €. Con seguro, todo cubierto — solo pagas la tarifa Med Connect.',
    cityFaqs: [
      {
        q: '¿Los cardiólogos privados en Barcelona hacen el electrocardiograma en la primera consulta?',
        a: 'Sí, es lo habitual. En la mayoría de centros barceloneses (Teknon, Dexeus, Clínica Sagrada Família, Clínica Corachán, etc.) el ECG en reposo se realiza y se interpreta en la misma cita. Si el cardiólogo considera necesario un ecocardiograma o una prueba de esfuerzo, se programa para la semana siguiente.',
      },
      {
        q: '¿Puedo pedir una prueba de esfuerzo con mi seguro tras la consulta cardiológica?',
        a: 'Sí. Tras la primera consulta, si el cardiólogo detecta indicación (dolor torácico atípico, palpitaciones inducidas por esfuerzo, cribado cardiovascular en deportista), emite el volante y tu aseguradora la autoriza. En Barcelona, la prueba de esfuerzo privada tiene una espera de 3-7 días con Med Connect.',
      },
      {
        q: '¿Qué hospitales cardiológicos privados de Barcelona tienen unidad de arritmias?',
        a: 'Centro Médico Teknon, Hospital Universitari Dexeus, Clínica Corachán y Clínica Sagrada Família cuentan con unidad de arritmias y electrofisiología, con capacidad para realizar Holter de 24-72h, cardioversiones y estudios electrofisiológicos completos.',
      },
    ],
  },

  'dermatologia/barcelona': {
    localIntro: [
      'Barcelona concentra decenas de centros dermatológicos privados de referencia, especialmente en el Eixample y Sarrià-Sant Gervasi. Aun así, para una revisión anual de lunares o una consulta por acné severo, las esperas del cuadro médico habitual pueden ser de 3 a 6 semanas.',
      'Con Med Connect consigues hueco con dermatólogo privado en Barcelona esta semana. Tu seguro (Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre, Cigna) cubre la consulta; solo pagas la tarifa de prioridad de €4-€19.',
    ],
    hospitalReferences: ['Hospital Universitari Dexeus', 'Centro Médico Teknon', 'Hospital Clínic de Barcelona'],
    localPriceNote: 'Sin seguro, la consulta dermatológica privada en Barcelona cuesta 70-120 €. Una dermatoscopia digital de mapa corporal completo ronda los 120-200 €. La extirpación de un lunar sospechoso 150-350 €. Con seguro, todo cubierto.',
    cityFaqs: [
      {
        q: '¿Qué centros dermatológicos privados de Barcelona ofrecen mapa corporal digital?',
        a: 'Centros como Institut Català de la Pell, Centro Médico Teknon (Servicio de Dermatología), Instituto Dermatológico Ginecológico y Clínica Sagrada Família ofrecen mapa corporal digital con dermatoscopia FotoFinder o similar. Es la técnica de elección para pacientes con nevus múltiples o antecedentes familiares de melanoma.',
      },
      {
        q: '¿Puedo hacerme una biopsia cutánea el mismo día en Barcelona privada?',
        a: 'Sí. Si el dermatólogo detecta una lesión sospechosa durante la primera visita, la biopsia por punch o por afeitado se realiza en la misma consulta en la mayoría de centros barceloneses. La histología está lista en 5-10 días.',
      },
      {
        q: '¿Los dermatólogos en Barcelona trabajan con AXA y Mapfre?',
        a: 'Sí. AXA y Mapfre tienen red concertada de dermatología en Barcelona, aunque más limitada que Sanitas o Adeslas. Med Connect te muestra directamente los centros con hueco esta semana para tu aseguradora específica.',
      },
    ],
  },

  'traumatologia/barcelona': {
    localIntro: [
      'La traumatología en Barcelona registra una demanda alta por el volumen de lesiones deportivas (Barcelona es una de las capitales españolas del running, ciclismo y pádel), pero las esperas para primera consulta ambulatoria en la pública superan los 45-90 días según el CatSalut.',
      'Med Connect encuentra hueco con traumatólogo privado en Barcelona esta semana en centros concertados con las principales aseguradoras. La consulta la paga tu seguro; tú solo la tarifa de prioridad de €4 a €19 según la urgencia.',
    ],
    hospitalReferences: ['Hospital Universitari Dexeus', 'Centro Médico Teknon', 'Hospital Clínic de Barcelona', 'ICATME (Institut Català de Traumatologia i Medicina de l\'Esport)'],
    localPriceNote: 'Sin seguro, la consulta traumatológica privada en Barcelona ronda 70-120 €. Una radiografía cuesta 30-60 €, una ecografía musculoesquelética 60-100 € y una resonancia articular privada 300-500 €. Con seguro, todo cubierto.',
    cityFaqs: [
      {
        q: '¿Cómo consigo una cita de traumatología urgente en Barcelona tras una lesión deportiva?',
        a: 'Con Med Connect en 24-48 horas en centros como ICATME, Centro Médico Teknon o Hospital Universitari Dexeus. Si la lesión es aguda (traumatismo grave, deformidad, imposibilidad para apoyar peso), acude a urgencias; para el resto (esguinces, tendinopatías, dolor articular crónico), la cita ambulatoria esta semana es lo habitual.',
      },
      {
        q: '¿Los traumatólogos barceloneses realizan infiltraciones con ácido hialurónico?',
        a: 'Sí. Muchos centros de Barcelona (ICATME, Teknon, Dexeus) realizan infiltraciones ecoguiadas con ácido hialurónico para artrosis de rodilla, cadera y hombro. El coste sin seguro oscila entre 250-500 € por infiltración. Algunos seguros la cubren tras autorización.',
      },
      {
        q: '¿Los traumatólogos en Barcelona hacen medicina deportiva y readaptación?',
        a: 'Sí. ICATME (Institut Català de Traumatologia i Medicina de l\'Esport) es la referencia nacional en medicina deportiva. Otros centros como Clínica CIREN, MAP Sports Physiotherapy y varios servicios en Teknon y Dexeus ofrecen consulta especializada en el deportista.',
      },
    ],
  },

  'urologia/barcelona': {
    localIntro: [
      'La urología pública en Cataluña presenta esperas de 60 a 120 días para primera consulta ambulatoria según los últimos datos del CatSalut. Cuestiones frecuentes como la hiperplasia benigna de próstata, los cálculos renales o el screening prostático quedan aplazadas.',
      'Med Connect te ofrece urólogos privados en Barcelona con cita disponible esta semana en centros concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna. La consulta la cubre tu seguro; solo pagas la tarifa de prioridad €4-€19.',
    ],
    hospitalReferences: ['Hospital Clínic de Barcelona', 'Hospital Universitari Dexeus', 'Fundación Puigvert', 'Centro Médico Teknon'],
    localPriceNote: 'Sin seguro, primera consulta urológica privada en Barcelona: 90-140 €. Ecografía prostática 60-100 €, uroflujometría 45-70 €. Con seguro, todo cubierto.',
    cityFaqs: [
      {
        q: '¿La Fundación Puigvert está concertada con las aseguradoras privadas?',
        a: 'La Fundación Puigvert es referencia europea en urología y trabaja con la mayoría de aseguradoras privadas (Sanitas, Adeslas, DKV) para consultas ambulatorias y procedimientos ambulatorios. Med Connect te muestra su disponibilidad si aplica a tu aseguradora.',
      },
      {
        q: '¿Los urólogos en Barcelona tratan la disfunción eréctil con onda de choque?',
        a: 'Sí. La terapia con ondas de choque de baja intensidad (Li-ESWT) para disfunción eréctil vasculogénica está disponible en varios centros urológicos privados de Barcelona (Dexeus, Teknon, Institut d\'Urologia Dr. Arango). El tratamiento consiste en 6 sesiones semanales, no está cubierto por la mayoría de aseguradoras.',
      },
      {
        q: '¿Cuánto cuesta una vasectomía privada en Barcelona?',
        a: 'La vasectomía privada en Barcelona cuesta 700-1200 € sin seguro. Con seguro (Sanitas, Adeslas, DKV), suele estar cubierta tras autorización previa. Med Connect gestiona la consulta prequirúrgica esta semana.',
      },
    ],
  },

  'psicologia/barcelona': {
    localIntro: [
      'La psicología clínica en Barcelona tiene una demanda que se ha triplicado desde 2020, con la salud mental como una de las principales preocupaciones de la ciudadanía. La sanidad pública catalana ofrece un número muy limitado de sesiones y con esperas de 60 a 120 días para primera consulta.',
      'Med Connect te conecta con psicólogos privados en Barcelona con cita esta semana en centros concertados con las principales aseguradoras. La sesión la cubre tu seguro (según póliza y número anual) y tú solo pagas la tarifa de prioridad de €4 a €19.',
    ],
    hospitalReferences: ['Hospital Clínic de Barcelona (Servicio de Psiquiatría)', 'Centro Médico Teknon', 'Hospital Universitari Dexeus'],
    localPriceNote: 'Sesión privada de psicología en Barcelona: 50-90 € por hora sin seguro. Con seguro, la mayoría de aseguradoras (Sanitas, Adeslas, DKV, Asisa) cubren entre 6 y 24 sesiones anuales, según la póliza. Med Connect solo cobra la tarifa de prioridad para conseguirte el hueco esta semana.',
    cityFaqs: [
      {
        q: '¿Cuántas sesiones de psicología cubre mi seguro en Barcelona?',
        a: 'Depende de la póliza: Sanitas Premium cubre hasta 24 sesiones/año, Adeslas 12-20, DKV 20, Asisa 12. Confirma tu número exacto en las condiciones del seguro. Med Connect te da acceso al psicólogo concertado sin lista de espera.',
      },
      {
        q: '¿Los psicólogos en Barcelona ofrecen sesiones online con seguro?',
        a: 'Sí. Desde 2020 la mayoría de aseguradoras aceptan la videoconsulta con psicólogo como equivalente a la presencial. Algunos centros barceloneses ofrecen tanto modalidad presencial (Eixample, Sant Gervasi, Gràcia) como online.',
      },
      {
        q: '¿Qué corrientes de psicología encuentro en la privada barcelonesa?',
        a: 'La terapia cognitivo-conductual (TCC) es la más habitual en la privada barcelonesa por su evidencia científica sólida. También encontrarás psicólogos con formación en EMDR (para trauma), terapia sistémica (para pareja y familia), y terapia de aceptación y compromiso (ACT). Med Connect permite filtrar por especialización.',
      },
    ],
  },

  // ── VALENCIA ───────────────────────────────────────────────────────────────
  'urologia/valencia': {
    localIntro: [
      'La urología en la sanidad pública valenciana tiene una espera media superior a los 60-90 días para primera consulta, con demoras específicas en hospitales como La Fe, Peset o Doctor Peset por la alta demanda. Cuestiones cotidianas como una revisión de próstata anual, un cálculo renal o una infección urinaria recurrente quedan aplazadas.',
      'Med Connect te encuentra hueco con urólogo privado en Valencia esta semana en centros concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna. La consulta la paga tu seguro; tú solo la tarifa de prioridad de €4 a €19.',
    ],
    hospitalReferences: ['Hospital Universitari i Politècnic La Fe', 'Hospital Clínico Universitario', 'Hospital Doctor Peset', 'Hospital IMED Valencia'],
    localPriceNote: 'La consulta urológica privada en Valencia oscila entre 80 y 130 € sin seguro. Ecografía prostática 60-90 €, uroflujometría 45-70 €. Con seguro, cubierto; solo pagas la tarifa Med Connect.',
    cityFaqs: [
      {
        q: '¿Qué hospitales urológicos privados están concertados con las aseguradoras en Valencia?',
        a: 'Hospital IMED Valencia, Hospital 9 de Octubre, Hospital NISA Rey Don Jaime, Clínica Aliaga y Vithas Valencia trabajan con la mayoría de aseguradoras (Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre). Med Connect te muestra el centro con hueco esta semana según tu aseguradora.',
      },
      {
        q: '¿Puedo hacerme un PSA con urgencia en Valencia con mi seguro?',
        a: 'Sí. Las aseguradoras privadas cubren la determinación de PSA (Antígeno Prostático Específico) sin autorización previa. Med Connect gestiona la consulta con urólogo esta semana; la extracción de la muestra se hace en el mismo centro.',
      },
      {
        q: '¿Los urólogos privados en Valencia hacen litotricia extracorpórea para cálculos renales?',
        a: 'Sí. Centros como Hospital IMED Valencia, Hospital 9 de Octubre y Vithas cuentan con litotriptor. El tratamiento es ambulatorio, dura 45-60 minutos y suele estar cubierto por las aseguradoras tras autorización.',
      },
    ],
  },

  'dermatologia/valencia': {
    localIntro: [
      'La dermatología valenciana atiende una demanda alta por revisiones anuales de lunares (la ciudad es una de las mediterráneas con mayor exposición solar) y por acné juvenil. Aun así, en la sanidad pública la espera para primera consulta ambulatoria puede superar los 60 días.',
      'Con Med Connect encuentras dermatólogo privado en Valencia con cita esta semana en centros concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna.',
    ],
    hospitalReferences: ['Hospital IMED Valencia', 'Hospital NISA Rey Don Jaime', 'Vithas Valencia'],
    localPriceNote: 'Sin seguro, consulta dermatológica privada en Valencia: 60-100 €. Dermatoscopia 55-90 €. Extirpación de lunar 130-300 €. Con seguro, todo cubierto.',
    cityFaqs: [
      {
        q: '¿Los dermatólogos privados en Valencia hacen mapa corporal digital?',
        a: 'Sí, varios centros valencianos (Hospital IMED Valencia, Vithas Valencia, Dermitek) ofrecen mapa corporal digital con dermatoscopia. Es la técnica de elección para pacientes con muchos nevus o antecedentes familiares de melanoma.',
      },
      {
        q: '¿Cuándo debo ir al dermatólogo en Valencia por un lunar?',
        a: 'Si observas cambio de tamaño, forma, color, aparición de un lunar nuevo después de los 40 años o sangrado espontáneo. En Med Connect puedes conseguir cita en 24-72 horas para revisión.',
      },
      {
        q: '¿Qué aseguradoras cubren dermatólogos en Valencia con red amplia?',
        a: 'Sanitas y Adeslas son las que concentran mayor red dermatológica en Valencia, seguidas de DKV y AXA. Med Connect filtra por tu aseguradora y muestra directamente los centros con hueco esta semana.',
      },
    ],
  },

  // ── SEVILLA ────────────────────────────────────────────────────────────────
  'cardiologia/sevilla': {
    localIntro: [
      'La cardiología en la sanidad pública sevillana tiene esperas de 60 a 120 días para primera consulta ambulatoria según el Servicio Andaluz de Salud (SAS). En una comunidad con alta prevalencia de hipertensión, diabetes y factores de riesgo cardiovascular, la demanda supera con creces la oferta pública.',
      'Med Connect te ofrece cardiólogos privados en Sevilla con cita esta semana en centros concertados con las principales aseguradoras: Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna. Consulta cubierta por tu seguro; tú solo pagas la tarifa de prioridad de €4 a €19.',
    ],
    hospitalReferences: ['Hospital Universitario Virgen del Rocío', 'Hospital Universitario Virgen Macarena', 'Hospital Viamed Santa Ángela de la Cruz', 'Hospital Quirónsalud Sagrado Corazón'],
    localPriceNote: 'Sin seguro, la consulta cardiológica privada en Sevilla ronda 80-130 €. Electrocardiograma incluido o 30-45 € adicionales. Ecocardiograma 90-150 €. Con seguro, todo cubierto — solo pagas la tarifa Med Connect.',
    cityFaqs: [
      {
        q: '¿Qué centros cardiológicos privados en Sevilla tienen unidad de arritmias?',
        a: 'Hospital Viamed Santa Ángela de la Cruz, Hospital Quirónsalud Sagrado Corazón y Clínica Fremap Sevilla cuentan con servicio de cardiología con capacidad para Holter 24-72h, prueba de esfuerzo con isotopos y estudios electrofisiológicos completos.',
      },
      {
        q: '¿Los cardiólogos en Sevilla hacen ecocardiograma en primera consulta?',
        a: 'Habitualmente el ecocardiograma se programa como segunda visita (48-72h después) porque requiere sala de ecografía dedicada. En Med Connect, si buscas la consulta con ecocardiograma "todo en uno", filtra por centros que lo indiquen (Viamed, Quirónsalud).',
      },
      {
        q: '¿Los seguros médicos cubren prueba de esfuerzo en Sevilla privada?',
        a: 'Sí. Tras la primera consulta, si el cardiólogo indica prueba de esfuerzo o ergometría, las aseguradoras (Sanitas, Adeslas, DKV) la autorizan en 24-48 horas. En Sevilla, la espera para realizar la prueba en privada es de 3-7 días.',
      },
    ],
  },

  'pediatria/sevilla': {
    localIntro: [
      'La pediatría sevillana tiene un doble frente: pediatría de Atención Primaria (con esperas moderadas) y pediatría de especialidades hospitalarias (con esperas superiores a 60 días para primera consulta de subespecialidades). Fiebre en un lactante, revisión de un desarrollo dudoso o valoración por asma infantil son motivos frecuentes de acudir a la privada.',
      'Med Connect te ofrece pediatras privados en Sevilla con cita el mismo día o al día siguiente en centros concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna.',
    ],
    hospitalReferences: ['Hospital Infantil Virgen del Rocío', 'Hospital Viamed Santa Ángela de la Cruz', 'Hospital Quirónsalud Sagrado Corazón'],
    localPriceNote: 'Sin seguro, consulta pediátrica privada en Sevilla: 60-100 €. Revisión del niño sano con vacunación incluida (según calendario andaluz): 90-140 €. Con seguro, todo cubierto.',
    cityFaqs: [
      {
        q: '¿Los pediatras privados en Sevilla siguen el calendario vacunal andaluz?',
        a: 'Sí. Los pediatras privados sevillanos administran las vacunas del calendario andaluz oficial y también las no financiadas (rotavirus, meningococo B, bexero) si los padres lo desean, con precios entre 60-160 € por dosis. Med Connect gestiona la cita con pediatra en 24 horas.',
      },
      {
        q: '¿Puedo llevar a mi hijo con fiebre alta al pediatra privado el mismo día en Sevilla?',
        a: 'Sí. Med Connect ofrece cita el mismo día o al día siguiente en centros como Viamed, Quirónsalud y varias consultas ambulatorias del centro. Si la fiebre en un lactante <3 meses supera 38 °C, acude a urgencias hospitalarias directamente.',
      },
      {
        q: '¿Qué pediatras en Sevilla ofrecen consulta pediátrica de especialidad (alergia, cardiología infantil)?',
        a: 'Hospital Viamed Santa Ángela de la Cruz, Hospital Quirónsalud Sagrado Corazón y Clínica Fremap Sevilla ofrecen pediatría subespecializada en alergología, cardiología infantil, gastroenterología y neurología pediátrica. Med Connect filtra por subespecialidad.',
      },
    ],
  },

  // ── MÁLAGA ─────────────────────────────────────────────────────────────────
  'oftalmologia/malaga': {
    localIntro: [
      'Málaga concentra una demanda alta de oftalmología por su población envejecida en la Costa del Sol y la alta prevalencia de patologías retinianas y cataratas. La sanidad pública andaluza registra esperas superiores a los 90-120 días para primera consulta ambulatoria de oftalmología en muchos centros del área.',
      'Med Connect te ofrece oftalmólogos privados en Málaga con cita esta semana en centros concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna.',
    ],
    hospitalReferences: ['Hospital Regional Universitario', 'Hospital Vithas Málaga', 'Hospital Quirónsalud Málaga', 'Vithas Xanit Internacional'],
    localPriceNote: 'La primera consulta oftalmológica privada en Málaga ronda 60-100 €. Fondo de ojo completo 40-70 €. OCT (Tomografía de Coherencia Óptica) 90-140 €. Cirugía de cataratas 1500-2800 € por ojo. Con seguro, casi todo cubierto.',
    cityFaqs: [
      {
        q: '¿Los oftalmólogos privados en Málaga hacen cirugía de cataratas con seguro?',
        a: 'Sí. Sanitas, Adeslas, DKV y Asisa cubren la cirugía de catarata (facoemulsificación con lente intraocular monofocal) tras autorización previa. Las lentes multifocales o tóricas suelen requerir copago adicional. Med Connect gestiona la consulta prequirúrgica esta semana.',
      },
      {
        q: '¿Qué es la OCT y dónde la puedo hacer en Málaga privada?',
        a: 'La OCT (Tomografía de Coherencia Óptica) es una prueba de imagen que evalúa las capas de la retina y es imprescindible para diagnosticar y controlar la degeneración macular asociada a la edad (DMAE), el glaucoma o el edema macular diabético. En Málaga, Vithas Málaga, Quirónsalud y Vithas Xanit disponen de OCT.',
      },
      {
        q: '¿Los oftalmólogos malagueños hacen cirugía refractiva con láser?',
        a: 'Sí. Varios centros oftalmológicos privados de Málaga realizan LASIK, LASEK, PRK y SMILE. Los precios oscilan entre 1200-2500 € por ojo. La mayoría de aseguradoras no cubren la cirugía refractiva por ser considerada estética-funcional; Med Connect solo cobra la tarifa de la primera consulta valorativa.',
      },
    ],
  },

  // ── BILBAO ─────────────────────────────────────────────────────────────────
  'ginecologia/bilbao': {
    localIntro: [
      'La ginecología en Osakidetza (Servicio Vasco de Salud) mantiene esperas de 60 a 100 días para primera consulta ambulatoria según la última memoria del SVS. Revisiones anuales, seguimiento del embarazo o consultas por sangrados atípicos quedan sin atención rápida.',
      'Con Med Connect encuentras hueco con ginecólogo privado en Bilbao esta semana en centros concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna. Consulta cubierta por tu seguro; tarifa Med Connect de €4-€19 según urgencia.',
    ],
    hospitalReferences: ['Hospital Universitario de Cruces', 'Hospital Universitario Basurto', 'IMQ Zorrotzaurre', 'IMQ Amarantos'],
    localPriceNote: 'Sin seguro, consulta ginecológica privada en Bilbao: 80-130 €. Ecografía transvaginal 50-90 €. Citología 40-60 €. Con seguro, todo cubierto.',
    cityFaqs: [
      {
        q: '¿Qué centros ginecológicos privados están concertados con IMQ en Bilbao?',
        a: 'IMQ Zorrotzaurre, IMQ Amarantos y varios centros ambulatorios del centro trabajan con la mayoría de aseguradoras (Sanitas, Adeslas, DKV, IMQ). Med Connect te muestra el centro con hueco esta semana según tu aseguradora.',
      },
      {
        q: '¿Puedo hacer seguimiento del embarazo completo en Bilbao privada?',
        a: 'Sí. Muchos centros ginecológicos privados de Bilbao ofrecen el seguimiento completo del embarazo, incluidas las ecografías del primer trimestre (11-13 semanas), segundo trimestre (20 semanas) y tercer trimestre (32 semanas), con la Prueba de ADN Fetal opcional. Todo cubierto por la mayoría de seguros.',
      },
      {
        q: '¿Los ginecólogos privados en Bilbao ofrecen colposcopia?',
        a: 'Sí. La colposcopia (visualización del cuello uterino tras una citología alterada) se realiza en la mayoría de centros ginecológicos privados de Bilbao. Es una prueba ambulatoria, dura 15-30 minutos y suele cubrirse por seguro con autorización previa.',
      },
    ],
  },

  // ── CÓRDOBA ────────────────────────────────────────────────────────────────
  'psicologia/cordoba': {
    localIntro: [
      'La psicología clínica en Córdoba tiene una demanda alta pero una red pública muy limitada: la primera consulta con psicólogo del sistema andaluz puede tardar 90-150 días. Ante ansiedad, depresión, trastornos del sueño o crisis vitales, muchos cordobeses buscan la privada.',
      'Med Connect te conecta con psicólogos privados en Córdoba con cita esta semana en centros concertados con las principales aseguradoras. La sesión la cubre tu seguro (según póliza y número anual de sesiones).',
    ],
    hospitalReferences: ['Hospital Universitario Reina Sofía (Salud Mental)', 'Hospital Cruz Roja', 'Hospital Quirónsalud Córdoba'],
    localPriceNote: 'Sesión privada de psicología en Córdoba: 45-75 € sin seguro. Con seguro (Sanitas, Adeslas, DKV, Asisa), suelen cubrirse entre 6 y 20 sesiones anuales.',
    cityFaqs: [
      {
        q: '¿Qué corrientes de psicología encuentro en la privada de Córdoba?',
        a: 'La terapia cognitivo-conductual (TCC) es la más frecuente por su evidencia científica. También encontrarás profesionales con formación en EMDR (trauma), terapia sistémica (familia y pareja) y mindfulness-based therapy. Med Connect permite filtrar por especialización.',
      },
      {
        q: '¿Puedo tener sesiones de psicología online en Córdoba con mi seguro?',
        a: 'Sí. Desde 2020 la mayoría de aseguradoras aceptan la videoconsulta como equivalente a la presencial. Muchos psicólogos de Córdoba ofrecen ambas modalidades.',
      },
      {
        q: '¿Cuántas sesiones cubre mi seguro en Córdoba?',
        a: 'Depende de la póliza: Sanitas Premium hasta 24 sesiones/año, Adeslas 12-20, DKV 20, Asisa 12. Confirma tu número exacto en las condiciones de la póliza.',
      },
    ],
  },

  // ── GRANADA ────────────────────────────────────────────────────────────────
  'psicologia/granada': {
    localIntro: [
      'Granada, con una población universitaria numerosa y una demografía envejecida en el resto de la provincia, tiene una demanda muy alta de psicología clínica. La sanidad pública andaluza registra esperas superiores a los 90-120 días para primera consulta psicológica ambulatoria.',
      'Con Med Connect encuentras psicólogos privados en Granada con cita esta semana en centros concertados con las principales aseguradoras.',
    ],
    hospitalReferences: ['Hospital Universitario Virgen de las Nieves', 'Hospital Universitario San Cecilio', 'Hospital Vithas Granada'],
    localPriceNote: 'Sesión privada de psicología en Granada: 45-75 € sin seguro. Con seguro, cubierto según póliza (6-24 sesiones anuales).',
    cityFaqs: [
      {
        q: '¿Los psicólogos privados en Granada trabajan con estudiantes universitarios?',
        a: 'Sí. Muchos centros psicológicos granadinos tienen amplia experiencia atendiendo a estudiantes universitarios con estrés académico, ansiedad, dificultades de adaptación o crisis vitales. Med Connect ofrece cita esta semana en varios centros del centro de Granada.',
      },
      {
        q: '¿Hay psicólogos especializados en TDAH adulto en Granada?',
        a: 'Sí. Varios centros psicológicos granadinos cuentan con profesionales especializados en trastorno por déficit de atención e hiperactividad (TDAH) en adultos. El diagnóstico incluye evaluación neuropsicológica completa y coordinación con psiquiatra si se considera necesaria medicación.',
      },
      {
        q: '¿La sesión online de psicología en Granada la cubre el seguro?',
        a: 'Sí. Desde 2020 la videoconsulta con psicólogo es equivalente a la presencial para las aseguradoras (Sanitas, Adeslas, DKV, Asisa). Confirma en tu póliza el número de sesiones anuales cubiertas.',
      },
    ],
  },

  'fisioterapia/granada': {
    localIntro: [
      'Granada tiene una demanda alta de fisioterapia por su población deportiva (senderismo, esquí en Sierra Nevada, ciclismo) y su población mayor con patología musculoesquelética. La sanidad pública andaluza cubre un número limitado de sesiones con esperas de 30-60 días.',
      'Med Connect te encuentra hueco con fisioterapeuta privado en Granada esta semana en centros concertados con Sanitas, Adeslas, DKV, Asisa, AXA, Mapfre y Cigna.',
    ],
    hospitalReferences: ['Hospital Universitario Virgen de las Nieves', 'Hospital Vithas Granada', 'Clínica Fremap Granada'],
    localPriceNote: 'Sesión privada de fisioterapia en Granada: 30-55 € sin seguro. Con seguro, cubierto según póliza (habitualmente 10-30 sesiones anuales).',
    cityFaqs: [
      {
        q: '¿Los fisioterapeutas en Granada tratan lesiones deportivas de esquí y montaña?',
        a: 'Sí. Muchos fisioterapeutas granadinos tienen especialización en deporte de invierno y lesiones de montaña (rodilla, tobillo, hombro). En temporada, los centros próximos a Sierra Nevada atienden con frecuencia lesiones agudas.',
      },
      {
        q: '¿Cuántas sesiones de fisioterapia cubre mi seguro en Granada?',
        a: 'Depende de la póliza. Sanitas Premium hasta 30 sesiones/año, Adeslas 20, DKV 20, Asisa 15. Habitualmente por episodio (una lesión concreta). Confirma en tu contrato.',
      },
      {
        q: '¿Hay fisioterapia especializada en suelo pélvico en Granada?',
        a: 'Sí. Varios centros granadinos ofrecen fisioterapia de suelo pélvico especializada para incontinencia urinaria, disfunción sexual, prolapsos y recuperación postparto. La primera valoración cuesta 40-70 € y las sesiones sucesivas 35-55 €.',
      },
    ],
  },

  'psicologia/malaga': {
    localIntro: [
      'Málaga, con una población en constante crecimiento por el turismo residencial y la Costa del Sol, tiene una demanda alta de psicología clínica. La red pública andaluza registra esperas de 90 a 150 días para primera consulta psicológica ambulatoria.',
      'Med Connect te conecta con psicólogos privados en Málaga con cita esta semana en centros concertados con las principales aseguradoras.',
    ],
    hospitalReferences: ['Hospital Regional Universitario', 'Hospital Vithas Málaga', 'Hospital Quirónsalud Málaga'],
    localPriceNote: 'Sesión privada de psicología en Málaga: 45-80 € sin seguro. Con seguro, cubierto según póliza (6-24 sesiones/año).',
    cityFaqs: [
      {
        q: '¿Hay psicólogos que atiendan en inglés en Málaga privada?',
        a: 'Sí. Dado el volumen de residentes extranjeros en la Costa del Sol, varios centros malagueños cuentan con psicólogos que atienden en inglés, francés o alemán. Med Connect permite filtrar por idioma de atención.',
      },
      {
        q: '¿Qué aseguradoras cubren psicología con red amplia en Málaga?',
        a: 'Sanitas, Adeslas, DKV y Asisa son las que concentran mayor red de psicología clínica en Málaga capital y en la Costa del Sol. Med Connect filtra directamente por tu aseguradora.',
      },
      {
        q: '¿Los psicólogos malagueños ofrecen terapia EMDR para trauma?',
        a: 'Sí. Varios centros psicológicos de Málaga cuentan con psicólogos formados en EMDR (Desensibilización y Reprocesamiento por Movimientos Oculares), especialmente indicada para el trastorno de estrés postraumático (TEPT), duelos complicados y experiencias traumáticas.',
      },
    ],
  },
};

/**
 * Get the local content object for a (specialty, city) combination.
 * Returns null when no local content is declared — page.js falls back
 * to the generic template rendering.
 */
export function getLocalContent(specialtySlug, citySlug) {
  const key = `${specialtySlug}/${citySlug}`;
  return LANDING_LOCAL_CONTENT[key] || null;
}
