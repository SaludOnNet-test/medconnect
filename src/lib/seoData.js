/**
 * seoData.js — shared data for SEO specialty/city landing pages
 *
 * All slug ↔ entity mappings live here so page.js and sitemap.js
 * import from a single source of truth.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';

// ── Specialty map ──────────────────────────────────────────────────────────
// slug  → { id, name, plural, prep, shortDesc, faqs }
// id    matches specialties[] in mock.js
// prep  = "en" or "de" for grammar ("especialistas EN cardiología")
// plural= how to refer to practitioners in this specialty

export const SPECIALTY_MAP = {
  traumatologia: {
    id: 1,
    name: 'Traumatología',
    plural: 'Traumatólogos',
    prep: 'en',
    articleName: 'traumatología',
    shortDesc: (city) =>
      `Reserva cita con traumatólogo privado en ${city} hoy mismo. Diagnóstico de lesiones musculoesqueléticas, articulares y óseas. Sin lista de espera pública.`,
    faqs: [
      {
        q: '¿Qué trata un traumatólogo?',
        a: 'El traumatólogo se especializa en lesiones del aparato locomotor: fracturas, esguinces, tendinitis, artrosis, hernias discales y lesiones deportivas. También realiza cirugía ortopédica cuando es necesario.',
      },
      {
        q: '¿Necesito volante de mi médico para la consulta privada?',
        a: 'No. En Med Connect puedes reservar directamente tu cita de traumatología privada sin necesitar derivación previa ni volante del médico de cabecera.',
      },
      {
        q: '¿Cuánto cuesta una consulta de traumatología privada?',
        a: 'La consulta de traumatología privada tiene un coste base de entre 45 € y 80 € según el centro. A eso se añade únicamente la tarifa de prioridad de Med Connect: 5 € si tu cita es a más de 30 días, 10 € entre 15 y 30 días, 19 € entre 7 y 14 días, o 29 € si necesitas cita en menos de 7 días.',
      },
    ],
  },

  dermatologia: {
    id: 2,
    name: 'Dermatología',
    plural: 'Dermatólogos',
    prep: 'en',
    articleName: 'dermatología',
    shortDesc: (city) =>
      `Cita con dermatólogo privado en ${city} sin esperar meses. Revisión de lunares, acné, psoriasis, dermatitis y más. Centros privados verificados.`,
    faqs: [
      {
        q: '¿Qué enfermedades trata el dermatólogo?',
        a: 'El dermatólogo trata enfermedades de la piel, cabello y uñas: acné, eccemas, psoriasis, dermatitis, rosácea, alopecia, y también realiza extirpación de verrugas, quistes y revisión de lunares.',
      },
      {
        q: '¿Con qué urgencia debo acudir al dermatólogo?',
        a: 'Si observas un lunar que cambia de forma, color o tamaño, o una lesión que no cicatriza en varias semanas, debes acudir cuanto antes. Med Connect puede darte cita en 24-48 horas.',
      },
      {
        q: '¿La dermatoscopia está incluida en la consulta?',
        a: 'Depende del centro y del protocolo. Habitualmente la dermatoscopia es un servicio adicional (desde 65€ base). Puedes seleccionarlo específicamente en el buscador de Med Connect.',
      },
    ],
  },

  ginecologia: {
    id: 3,
    name: 'Ginecología',
    plural: 'Ginecólogos',
    prep: 'en',
    articleName: 'ginecología',
    shortDesc: (city) =>
      `Ginecólogos privados en ${city} con cita disponible esta semana. Revisiones, ecografías, anticoncepción y seguimiento del embarazo. Sin esperas.`,
    faqs: [
      {
        q: '¿Cada cuánto debo hacerme una revisión ginecológica?',
        a: 'Se recomienda una revisión anual a partir de los 25 años, o antes si has tenido actividad sexual. La citología se realiza cada 3 años si los resultados son normales.',
      },
      {
        q: '¿Se puede pedir cita con ginecólogo sin seguro médico?',
        a: 'Sí. Med Connect conecta con centros privados que atienden tanto a pacientes con seguro como sin él. Si no tienes seguro, el coste se divide entre la consulta base del centro y la tarifa de gestión de Med Connect.',
      },
      {
        q: '¿Puedo hacer el seguimiento de embarazo de forma privada?',
        a: 'Sí. Muchos de los centros de nuestra red ofrecen seguimiento de embarazo completo, incluyendo ecografías del primer, segundo y tercer trimestre.',
      },
    ],
  },

  oftalmologia: {
    id: 4,
    name: 'Oftalmología',
    plural: 'Oftalmólogos',
    prep: 'en',
    articleName: 'oftalmología',
    shortDesc: (city) =>
      `Oftalmólogos privados en ${city}: revisión de vista, fondo de ojo, cataratas, glaucoma y cirugía refractiva. Cita en 24-48 h sin esperas.`,
    faqs: [
      {
        q: '¿Qué incluye una revisión oftalmológica completa?',
        a: 'Una revisión completa incluye agudeza visual, tonometría (presión ocular), fondo de ojo y exploración con lámpara de hendidura. Dura aproximadamente 30-45 minutos.',
      },
      {
        q: '¿Cada cuánto debo revisar la vista con un oftalmólogo?',
        a: 'Los adultos sin problemas visuales deben hacerse una revisión cada 2 años. Si usas gafas, lentillas o tienes antecedentes familiares de glaucoma o cataratas, la revisión anual es recomendable.',
      },
      {
        q: '¿Qué diferencia hay entre un óptico y un oftalmólogo?',
        a: 'El óptico puede medir la graduación y dispensar gafas, pero no puede diagnosticar ni tratar enfermedades oculares. El oftalmólogo es médico especialista y puede diagnosticar patologías, prescribir tratamientos y realizar cirugías.',
      },
    ],
  },

  cardiologia: {
    id: 5,
    name: 'Cardiología',
    plural: 'Cardiólogos',
    prep: 'en',
    articleName: 'cardiología',
    shortDesc: (city) =>
      `Cardiólogos privados en ${city} con cita urgente disponible. Electrocardiograma, ecocardiograma y consulta de riesgo cardiovascular. Sin lista de espera.`,
    faqs: [
      {
        q: '¿Qué síntomas deben llevarme al cardiólogo?',
        a: 'Dolor o presión en el pecho, palpitaciones irregulares, dificultad para respirar con el esfuerzo, mareos frecuentes o antecedentes familiares de enfermedad coronaria son motivos para consultar con un cardiólogo.',
      },
      {
        q: '¿Qué pruebas hace un cardiólogo en la primera consulta?',
        a: 'Habitualmente realizará un electrocardiograma (ECG) en reposo, medición de la presión arterial y una historia clínica detallada. Puede solicitar una analítica o un ecocardiograma según la valoración.',
      },
      {
        q: '¿Cuánto cuesta una consulta de cardiología privada?',
        a: 'La consulta base de cardiología privada oscila entre 55€ y 100€. El electrocardiograma suele incluirse o tener un coste adicional de 40€ aproximadamente. Med Connect añade únicamente su tarifa de gestión prioritaria.',
      },
    ],
  },

  urologia: {
    id: 6,
    name: 'Urología',
    plural: 'Urólogos',
    prep: 'en',
    articleName: 'urología',
    shortDesc: (city) =>
      `Urólogos privados en ${city}: infecciones, cálculos renales, próstata, incontinencia. Cita disponible esta semana sin lista de espera pública.`,
    faqs: [
      {
        q: '¿Qué trata la urología?',
        a: 'La urología abarca enfermedades del tracto urinario (riñones, vejiga, uretra) y del aparato reproductor masculino: infecciones urinarias, cálculos renales, hiperplasia de próstata, incontinencia y disfunción eréctil.',
      },
      {
        q: '¿A qué edad debo hacerme la revisión de próstata?',
        a: 'A partir de los 50 años se recomienda una revisión anual de próstata. Si hay antecedentes familiares de cáncer de próstata, la revisión debe adelantarse a los 40-45 años.',
      },
      {
        q: '¿Cuánto tiempo dura la espera en la sanidad pública para ver al urólogo?',
        a: 'La espera media para urología en la sanidad pública española supera los 3-6 meses. Con Med Connect obtienes cita privada prioritaria en 24-72 horas.',
      },
    ],
  },

  otorrinolaringologia: {
    id: 7,
    name: 'Otorrinolaringología',
    plural: 'Otorrinolaringólogos',
    prep: 'en',
    articleName: 'otorrinolaringología (ORL)',
    shortDesc: (city) =>
      `Especialistas en ORL en ${city}: oídos, nariz y garganta. Cita privada disponible sin esperas. Audiometría, amígdalas, sinusitis y más.`,
    faqs: [
      {
        q: '¿Qué enfermedades trata el otorrinolaringólogo?',
        a: 'El ORL trata patologías del oído (sordera, otitis, acúfenos, vértigo), nariz (sinusitis, rinitis, desviación de tabique) y garganta (amigdalitis, disfonía, ronquidos, apnea del sueño).',
      },
      {
        q: '¿Cuándo debo ir al ORL y no esperar al médico de cabecera?',
        a: 'Ante pérdida brusca de audición, vértigo intenso, sangrado nasal recurrente o dificultad para tragar persistente, es recomendable acudir directamente al otorrinolaringólogo sin demora.',
      },
      {
        q: '¿La audiometría se puede hacer en la primera visita?',
        a: 'Sí. La mayoría de los centros ORL de nuestra red disponen de cabina audiométrica propia, por lo que la audiometría puede realizarse en la misma visita.',
      },
    ],
  },

  digestivo: {
    id: 8,
    name: 'Digestivo',
    plural: 'Especialistas en Digestivo',
    prep: 'en',
    articleName: 'aparato digestivo',
    shortDesc: (city) =>
      `Especialistas en aparato digestivo en ${city}: gastritis, colon irritable, colonoscopia, reflujo y enfermedad inflamatoria intestinal. Cita urgente privada.`,
    faqs: [
      {
        q: '¿Qué enfermedades trata el especialista en digestivo?',
        a: 'El especialista en aparato digestivo atiende: reflujo gastroesofágico, gastritis, úlcera gástrica, síndrome de colon irritable, enfermedad de Crohn, colitis ulcerosa, hígado graso y realiza endoscopias y colonoscopias.',
      },
      {
        q: '¿A partir de qué edad debo hacerme una colonoscopia?',
        a: 'Se recomienda colonoscopia de cribado a partir de los 50 años, o antes si hay antecedentes familiares de cáncer de colon, sangre en heces o cambios persistentes en el ritmo intestinal.',
      },
      {
        q: '¿Cuánto cuesta una colonoscopia privada?',
        a: 'El coste de una colonoscopia privada oscila entre 300€ y 500€ según el centro y si incluye anestesia. Med Connect añade únicamente la tarifa de gestión prioritaria para reservar la prueba.',
      },
    ],
  },

  // ── Wave 2 specialties (June 2026) ────────────────────────────────────────
  // All verified against Azure SQL: ≥2 providers in Madrid, Barcelona,
  // Valencia, Sevilla. Auto-noindex handles thin city pages (<3 clinics).

  psicologia: {
    id: 9,
    name: 'Psicología',
    plural: 'Psicólogos',
    prep: 'en',
    articleName: 'psicología',
    shortDesc: (city) =>
      `Psicólogos privados en ${city} con cita esta semana. Ansiedad, depresión, terapia cognitivo-conductual y apoyo emocional. Sin lista de espera.`,
    faqs: [
      {
        q: '¿Cuándo debo consultar con un psicólogo?',
        a: 'Cuando el malestar emocional (ansiedad, tristeza persistente, estrés, insomnio) interfiere con tu vida diaria durante más de dos semanas, o ante situaciones de duelo, ruptura, burnout o crisis de identidad.',
      },
      {
        q: '¿Cuántas sesiones de psicología suelen necesitarse?',
        a: 'Depende del motivo de consulta. Para problemas específicos (fobias, ansiedad situacional) pueden bastar 8-12 sesiones de terapia cognitivo-conductual. Procesos más complejos requieren mayor duración.',
      },
      {
        q: '¿La psicología privada está cubierta por el seguro?',
        a: 'Algunos seguros cubren un número limitado de sesiones (6-12 al año). Con Med Connect accedes a psicólogos en la red de tu aseguradora con plaza prioritaria esta semana.',
      },
    ],
  },

  neurologia: {
    id: 10,
    name: 'Neurología',
    plural: 'Neurólogos',
    prep: 'en',
    articleName: 'neurología',
    shortDesc: (city) =>
      `Neurólogos privados en ${city}: migraña, epilepsia, vértigo, neuropatías y cefaleas. Cita esta semana sin esperar meses en la pública.`,
    faqs: [
      {
        q: '¿Qué enfermedades trata el neurólogo?',
        a: 'El neurólogo trata enfermedades del sistema nervioso: migraña crónica, epilepsia, esclerosis múltiple, Parkinson, demencias, neuropatías periféricas, vértigo de origen central y cefaleas de repetición.',
      },
      {
        q: '¿Cuándo debo ir urgentemente al neurólogo?',
        a: 'Ante pérdida brusca de fuerza o sensibilidad en un lado del cuerpo, dificultad para hablar o entender, visión doble de inicio súbito o cefalea "la peor de mi vida": acude a urgencias. Para el resto de síntomas neurológicos crónicos, pide cita prioritaria.',
      },
      {
        q: '¿Cuánto espera media hay para neurología en la sanidad pública?',
        a: 'La espera para neurología supera los 60-90 días en muchas comunidades. Con Med Connect obtienes cita neurológica privada esta semana.',
      },
    ],
  },

  endocrinologia: {
    id: 11,
    name: 'Endocrinología',
    plural: 'Endocrinólogos',
    prep: 'en',
    articleName: 'endocrinología',
    shortDesc: (city) =>
      `Endocrinólogos privados en ${city}: diabetes, tiroides, obesidad, hormonal. Diagnóstico y control con cita disponible esta semana.`,
    faqs: [
      {
        q: '¿Qué trata el endocrinólogo?',
        a: 'El endocrinólogo se ocupa de las glándulas y las hormonas: diabetes tipo 1 y 2, hipotiroidismo, hipertiroidismo, nódulos tiroideos, obesidad, síndrome metabólico, síndrome de ovario poliquístico (SOP) y osteoporosis.',
      },
      {
        q: '¿Cuándo debo ir al endocrinólogo por la tiroides?',
        a: 'Si tu analítica muestra TSH alterada, tienes un nódulo tiroideo en la ecografía, o presentas síntomas de hipo o hipertiroidismo (fatiga, frío, taquicardia, cambio de peso sin causa), debes consultar con el endocrinólogo.',
      },
      {
        q: '¿El endocrinólogo puede ayudarme a perder peso?',
        a: 'Sí, cuando el sobrepeso tiene un componente metabólico u hormonal. El endocrinólogo diseña un plan médico que puede incluir dieta, ejercicio, fármacos o cirugía bariátrica según el caso.',
      },
    ],
  },

  neumologia: {
    id: 12,
    name: 'Neumología',
    plural: 'Neumólogos',
    prep: 'en',
    articleName: 'neumología',
    shortDesc: (city) =>
      `Neumólogos privados en ${city}: asma, EPOC, apnea del sueño y enfermedades respiratorias. Cita urgente sin espera con tu seguro.`,
    faqs: [
      {
        q: '¿Qué enfermedades trata el neumólogo?',
        a: 'El neumólogo trata enfermedades del sistema respiratorio: asma, EPOC, bronquitis crónica, neumonía, apnea del sueño, fibrosis pulmonar, tos crónica y nódulos pulmonares.',
      },
      {
        q: '¿Cuándo debo consultar con un neumólogo?',
        a: 'Tos que dura más de 3 semanas, dificultad para respirar que limita tu actividad diaria, ronquidos intensos con pausas en la respiración nocturna, o diagnóstico previo de asma o EPOC que no se controla bien.',
      },
      {
        q: '¿Qué es la espirometría y cuándo se hace?',
        a: 'La espirometría mide la capacidad pulmonar y el flujo de aire. Es la prueba clave para diagnosticar y controlar el asma y la EPOC. Se realiza en la consulta, dura 15-20 minutos y no es dolorosa.',
      },
    ],
  },

  reumatologia: {
    id: 13,
    name: 'Reumatología',
    plural: 'Reumatólogos',
    prep: 'en',
    articleName: 'reumatología',
    shortDesc: (city) =>
      `Reumatólogos privados en ${city}: artritis, lupus, fibromialgia, gota. Diagnóstico y tratamiento biológico. Cita esta semana sin esperas.`,
    faqs: [
      {
        q: '¿Qué trata la reumatología?',
        a: 'La reumatología trata enfermedades autoinmunes y del aparato locomotor: artritis reumatoide, lupus eritematoso sistémico, espondilitis anquilosante, gota, fibromialgia, Sjögren y otras enfermedades del tejido conectivo.',
      },
      {
        q: '¿Cuándo debo ir al reumatólogo?',
        a: 'Si tienes articulaciones hinchadas, dolorosas y rígidas durante más de 6 semanas, especialmente por las mañanas; si te diagnosticaron una enfermedad autoinmune; o si los análisis muestran factor reumatoide o ANA positivos.',
      },
      {
        q: '¿La espera para reumatología es larga en la pública?',
        a: 'Sí, es una de las especialidades con mayor espera en España: entre 60 y 120 días según comunidad. En enfermedades autoinmunes activas, esa espera puede empeorar el pronóstico. Med Connect te da cita esta semana.',
      },
    ],
  },

  alergologia: {
    id: 14,
    name: 'Alergología',
    plural: 'Alergólogos',
    prep: 'en',
    articleName: 'alergología',
    shortDesc: (city) =>
      `Alergólogos privados en ${city}: pruebas de alergia, inmunoterapia, alergia al polen, alimentos y medicamentos. Cita disponible esta semana.`,
    faqs: [
      {
        q: '¿Qué trata el alergólogo?',
        a: 'El alergólogo diagnostica y trata alergias respiratorias (rinitis, asma alérgica), alergias a alimentos, medicamentos, insectos, látex y materiales de contacto. También gestiona la inmunoterapia (vacuna de la alergia).',
      },
      {
        q: '¿Cómo son las pruebas de alergia?',
        a: 'Las pruebas cutáneas (prick test) se realizan en el antebrazo con pequeñas picaduras indoloras. En 20 minutos se obtiene el resultado. También se pueden hacer análisis de sangre (IgE específica) para confirmar el diagnóstico.',
      },
      {
        q: '¿La inmunoterapia cura la alergia?',
        a: 'La inmunoterapia (vacuna de alergia) reduce significativamente los síntomas y puede producir tolerancia duradera. El tratamiento dura 3-5 años, pero la mejoría se nota desde el primer año.',
      },
    ],
  },

  pediatria: {
    id: 15,
    name: 'Pediatría',
    plural: 'Pediatras',
    prep: 'en',
    articleName: 'pediatría',
    shortDesc: (city) =>
      `Pediatras privados en ${city}: revisiones del niño, vacunación, fiebre, infecciones y desarrollo. Cita este mismo día con tu seguro.`,
    faqs: [
      {
        q: '¿Hasta qué edad atiende el pediatra?',
        a: 'El pediatra atiende a pacientes desde el nacimiento hasta los 14-16 años (según comunidad autónoma en la pública). En medicina privada muchos pediatras aceptan hasta los 18 años.',
      },
      {
        q: '¿Con qué urgencia debo llevar a mi hijo al pediatra?',
        a: 'Ante fiebre superior a 39°C en menores de 3 meses, dificultad para respirar, manchas en la piel de aparición súbita, vómitos intensos repetidos, o cualquier síntoma que te preocupe mucho: busca cita ese mismo día.',
      },
      {
        q: '¿Las revisiones del niño sano se pueden hacer en privado?',
        a: 'Sí. Las revisiones del Programa de Salud Infantil (a los 1, 2, 4, 6, 9, 12, 15, 18 meses y 2, 3, 4, 6, 8, 10, 12, 14 años) se pueden hacer con pediatra privado. Incluyen peso, talla, desarrollo psicomotor y vacunas según calendario.',
      },
    ],
  },

  rehabilitacion: {
    id: 16,
    name: 'Rehabilitación',
    plural: 'Especialistas en Rehabilitación',
    prep: 'en',
    articleName: 'rehabilitación',
    shortDesc: (city) =>
      `Especialistas en rehabilitación en ${city}: fisioterapia médica, recuperación de lesiones, ictus y cirugías. Cita prioritaria con tu seguro.`,
    faqs: [
      {
        q: '¿Qué diferencia hay entre rehabilitación y fisioterapia?',
        a: 'La rehabilitación es una especialidad médica: el médico rehabilitador diagnostica, diseña el plan de recuperación y lo supervisa. La fisioterapia es la aplicación práctica del tratamiento. Ambos trabajan juntos en el proceso de recuperación.',
      },
      {
        q: '¿Cuándo necesito un médico rehabilitador?',
        a: 'Tras una fractura, cirugía articular, ictus, lesión medular, o cuando el dolor musculoesquelético crónico no mejora con tratamiento convencional. El rehabilitador coordina la fisioterapia, infiltraciones y otras terapias.',
      },
      {
        q: '¿El seguro cubre las sesiones de rehabilitación?',
        a: 'La mayoría de seguros privados cubren un número de sesiones de rehabilitación al año (habitualmente 20-30). Med Connect facilita el acceso prioritario al especialista que prescriba el plan.',
      },
    ],
  },

  psiquiatria: {
    id: 17,
    name: 'Psiquiatría',
    plural: 'Psiquiatras',
    prep: 'en',
    articleName: 'psiquiatría',
    shortDesc: (city) =>
      `Psiquiatras privados en ${city}: depresión, ansiedad severa, trastorno bipolar, TDAH adulto y tratamiento farmacológico. Sin espera.`,
    faqs: [
      {
        q: '¿Cuál es la diferencia entre psicólogo y psiquiatra?',
        a: 'El psiquiatra es médico especialista y puede prescribir medicación. El psicólogo realiza psicoterapia sin prescripción. Para trastornos que requieren tratamiento farmacológico (depresión mayor, bipolar, psicosis, TDAH), el psiquiatra es imprescindible.',
      },
      {
        q: '¿Cuándo debo ver a un psiquiatra y no solo a un psicólogo?',
        a: 'Cuando los síntomas son intensos y limitan significativamente tu vida, cuando la psicoterapia sola no está siendo suficiente, o cuando hay riesgo para ti o para otros. El psiquiatra puede combinar medicación y psicoterapia.',
      },
      {
        q: '¿La espera para psiquiatría en la pública es larga?',
        a: 'Sí, es de las más largas: 60-120 días en muchas comunidades para primera consulta. En crisis de salud mental, esa espera es inasumible. Med Connect ofrece cita esta semana con psiquiatra privado.',
      },
    ],
  },

  fisioterapia: {
    id: 18,
    name: 'Fisioterapia',
    plural: 'Fisioterapeutas',
    prep: 'en',
    articleName: 'fisioterapia',
    shortDesc: (city) =>
      `Fisioterapeutas privados en ${city}: cervicales, lumbares, lesiones deportivas, recuperación post-cirugía. Cita disponible esta semana.`,
    faqs: [
      {
        q: '¿Necesito receta médica para ir al fisioterapeuta?',
        a: 'En medicina privada, no. Puedes acudir directamente al fisioterapeuta sin derivación médica. Si es para una lesión específica o post-quirúrgica, el informe del médico ayuda a orientar el tratamiento.',
      },
      {
        q: '¿Cuántas sesiones de fisioterapia necesitaré?',
        a: 'Depende de la lesión. Una contractura muscular puede resolverse en 3-5 sesiones. Una rehabilitación post-operatoria puede requerir 20-40 sesiones. El fisioterapeuta te dará una estimación tras la primera valoración.',
      },
      {
        q: '¿Mi seguro cubre las sesiones de fisioterapia?',
        a: 'La mayoría de seguros privados cubren fisioterapia con un límite anual de sesiones (10-30 según la póliza). Med Connect te da acceso prioritario al fisioterapeuta concertado esta semana.',
      },
    ],
  },
};

// ── City map ───────────────────────────────────────────────────────────────
// slug → display name (must match mock.js cities exactly)
export const CITY_MAP = {
  madrid:    'Madrid',
  barcelona: 'Barcelona',
  valencia:  'Valencia',
  sevilla:   'Sevilla',
  malaga:    'Málaga',
  // Second wave (2026-04-29). All six confirmed to exist verbatim in
  // clinics.city in the DB — verified via /api/clinics/filters before
  // adding so the SEO page actually has providers to render. Alicante
  // and Pamplona are intentionally excluded for now because they live
  // in the DB under bilingual names ("Alicante/Alacant", "Pamplona/Iruña")
  // and would need a fuzzy match in the search query — follow-up.
  bilbao:    'Bilbao',
  zaragoza:  'Zaragoza',
  granada:   'Granada',
  murcia:    'Murcia',
  vigo:      'Vigo',
  cordoba:   'Córdoba',
};

// ── All slug combinations ──────────────────────────────────────────────────
export function getAllSpecialtyCityCombinations() {
  const combos = [];
  for (const especialidad of Object.keys(SPECIALTY_MAP)) {
    for (const ciudad of Object.keys(CITY_MAP)) {
      combos.push({ especialidad, ciudad });
    }
  }
  return combos; // 18 specialties × 11 cities = 198 (wave 2 added 2026-06-24)
}

// ── Canonical URL builder ──────────────────────────────────────────────────
export function specialtyPageUrl(especialidad, ciudad) {
  return `${BASE_URL}/especialistas/${especialidad}/${ciudad}`;
}
