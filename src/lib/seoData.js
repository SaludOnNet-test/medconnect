/**
 * seoData.js — shared data for SEO specialty/city landing pages
 *
 * All slug ↔ entity mappings live here so page.js and sitemap.js
 * import from a single source of truth.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect.es';

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
        a: 'La consulta de traumatología privada tiene un coste base de entre 45 € y 80 € según el centro. A eso se añade únicamente la tarifa de prioridad de Med Connect: 4,99 € si tu cita es a más de 30 días, 9,99 € entre 15 y 30 días, 19 € entre 7 y 14 días, o 29 € si necesitas cita en menos de 7 días.',
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
};

// ── City map ───────────────────────────────────────────────────────────────
// slug → display name (must match mock.js cities exactly)
export const CITY_MAP = {
  madrid:    'Madrid',
  barcelona: 'Barcelona',
  valencia:  'Valencia',
  sevilla:   'Sevilla',
  malaga:    'Málaga',
};

// ── All slug combinations ──────────────────────────────────────────────────
export function getAllSpecialtyCityCombinations() {
  const combos = [];
  for (const especialidad of Object.keys(SPECIALTY_MAP)) {
    for (const ciudad of Object.keys(CITY_MAP)) {
      combos.push({ especialidad, ciudad });
    }
  }
  return combos; // 8 × 5 = 40
}

// ── Canonical URL builder ──────────────────────────────────────────────────
export function specialtyPageUrl(especialidad, ciudad) {
  return `${BASE_URL}/especialistas/${especialidad}/${ciudad}`;
}
