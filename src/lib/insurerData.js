/**
 * insurerData.js — Insurer metadata for /aseguradoras/[aseguradora]/[especialidad] pages
 *
 * slug must match the value used in clinics.accepted_insurance (comma-separated field)
 * so that the search API can filter correctly.
 */

export const INSURER_MAP = {
  sanitas: {
    name: 'Sanitas',
    fullName: 'Sanitas Seguros',
    dbName: 'Sanitas',   // value stored in clinics.accepted_insurance
    description: 'uno de los seguros médicos privados más grandes de España, con red propia y concertada en todo el territorio nacional',
    copyagLine: 'Tienes Sanitas pero la espera es de semanas.',
    coverageNote: 'Sanitas tiene una de las redes concertadas más amplias de España. Sin embargo, para especialidades de alta demanda como cardiología o dermatología, la primera cita disponible en tu zona puede demorarse 3-6 semanas.',
  },
  adeslas: {
    name: 'Adeslas',
    fullName: 'Adeslas SegurCaixa',
    dbName: 'Adeslas',
    description: 'el seguro médico privado con mayor número de clínicas concertadas en España, presente en todas las provincias',
    copyagLine: 'Tienes Adeslas pero esperas semanas para el especialista.',
    coverageNote: 'Adeslas cuenta con la red concertada más extensa de España. Aun así, la demanda supera la oferta en especialidades como neurología, reumatología y dermatología, donde las agendas se llenan con semanas de antelación.',
  },
  asisa: {
    name: 'Asisa',
    fullName: 'Asisa Salud',
    dbName: 'Asisa',
    description: 'un seguro médico mutualista con amplia red de clínicas propias y concertadas en las principales ciudades españolas',
    copyagLine: 'Tienes Asisa pero el primer hueco es dentro de un mes.',
    coverageNote: 'Asisa combina clínicas propias y centros concertados. En especialidades de alta rotación como pediatría, ginecología o cardiología, la disponibilidad en las semanas próximas suele ser limitada en las ciudades más grandes.',
  },
  axa: {
    name: 'AXA',
    fullName: 'AXA Salud',
    dbName: 'AXA',
    description: 'un seguro de salud privado del grupo AXA con cobertura en las principales ciudades de España',
    copyagLine: 'Tienes AXA Salud pero las esperas no te cuadran.',
    coverageNote: 'AXA Salud ofrece acceso a una red de especialistas privados, aunque el tamaño del cuadro médico varía significativamente por ciudad. En ciudades medianas o para especialidades concretas, la espera puede superar el mes.',
  },
  mapfre: {
    name: 'Mapfre',
    fullName: 'Mapfre Salud',
    dbName: 'Mapfre',
    description: 'el seguro de salud de uno de los mayores grupos aseguradores de España, con red propia y concertada',
    copyagLine: 'Tu Mapfre Salud no te da cita cuando la necesitas.',
    coverageNote: 'Mapfre Salud tiene presencia en las principales provincias. Como en otros seguros generalistas, la disponibilidad en especialidades de alta demanda puede ser limitada, especialmente fuera de las capitales.',
  },
  dkv: {
    name: 'DKV',
    fullName: 'DKV Seguros',
    dbName: 'DKV',
    description: 'un seguro médico con fuerte presencia en Cataluña, Aragón y la Comunidad Valenciana, con crecimiento nacional',
    copyagLine: 'Tienes DKV pero la cita que necesitas no está disponible pronto.',
    coverageNote: 'DKV tiene una red sólida en su área de influencia tradicional. Para especialidades menos representadas en su cuadro o en ciudades fuera de su núcleo de cobertura, las esperas pueden ser considerables.',
  },
  cigna: {
    name: 'Cigna',
    fullName: 'Cigna Salud',
    dbName: 'Cigna',
    description: 'un seguro médico internacional con presencia en España, especialmente orientado al mercado corporativo',
    copyagLine: 'Tu seguro Cigna no te ofrece cita inmediata.',
    coverageNote: 'Cigna cuenta con una red más selectiva en España. Para ciertas especialidades o en ciudades fuera de los grandes núcleos, la disponibilidad de su cuadro puede ser más limitada que la de aseguradoras con mayor implantación local.',
  },
  caser: {
    name: 'Caser',
    fullName: 'Caser Seguros',
    dbName: 'Caser',
    description: 'un grupo asegurador español con producto de salud en crecimiento, especialmente en Madrid y ciudades medianas',
    copyagLine: 'Tienes Caser Salud pero las esperas son largas.',
    coverageNote: 'Caser está expandiendo su red de salud, pero en algunas especialidades y ciudades la oferta de su cuadro puede ser más reducida que la de aseguradoras de mayor tamaño.',
  },
};

export function getAllInsurerSpecialtyCombinations(specialtyMap) {
  const combos = [];
  for (const aseguradora of Object.keys(INSURER_MAP)) {
    for (const especialidad of Object.keys(specialtyMap)) {
      combos.push({ aseguradora, especialidad });
    }
  }
  return combos;
}

export function insurerSpecialtyPageUrl(aseguradora, especialidad) {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';
  return `${BASE_URL}/aseguradoras/${aseguradora}/${especialidad}`;
}
