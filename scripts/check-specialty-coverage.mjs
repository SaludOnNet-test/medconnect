/**
 * check-specialty-coverage.mjs
 * Queries Azure SQL and prints a coverage matrix: specialty × city → clinic count
 * Run: node scripts/check-specialty-coverage.mjs
 */
import sql from 'mssql';

// Load env: node --env-file=.env.local scripts/check-specialty-coverage.mjs
const config = {
  server:   process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user:     process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false },
  connectionTimeout: 30000,
  requestTimeout: 20000,
};

const pool = await sql.connect(config);

const result = await pool.request().query(`
  SELECT
    cs.specialty_slug,
    cs.specialty_name,
    c.city,
    COUNT(DISTINCT c.id) AS provider_count
  FROM clinics c
  INNER JOIN clinic_specialties cs ON c.id = cs.clinic_id
  WHERE c.city IS NOT NULL AND c.city <> ''
    AND cs.specialty_slug IS NOT NULL AND cs.specialty_slug <> ''
  GROUP BY cs.specialty_slug, cs.specialty_name, c.city
  HAVING COUNT(DISTINCT c.id) >= 2
  ORDER BY cs.specialty_slug, provider_count DESC
`);

// Summary by specialty
const bySpecialty = {};
for (const row of result.recordset) {
  if (!bySpecialty[row.specialty_slug]) {
    bySpecialty[row.specialty_slug] = { name: row.specialty_name, cities: [] };
  }
  bySpecialty[row.specialty_slug].cities.push(`${row.city}(${row.provider_count})`);
}

console.log('\n=== Specialties with >=2 providers per city ===\n');
for (const [slug, data] of Object.entries(bySpecialty)) {
  console.log(`${slug.padEnd(35)} | ${data.name.padEnd(30)} | ${data.cities.join(', ')}`);
}

await pool.close();
