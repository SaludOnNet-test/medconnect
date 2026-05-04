import sql from 'mssql';

// ---------------------------------------------------------------------------
// Connection configuration
// ---------------------------------------------------------------------------
const config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  // Both timeouts default to 15 s in tedious; keeping them explicit so a
  // hung Azure SQL doesn't pin a Vercel Lambda for the full 45 s ceiling.
  connectionTimeout: 15_000,
  requestTimeout: 20_000,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
  pool: {
    // Each Lambda instance keeps its own pool. Azure SQL's per-database
    // connection cap depends on the tier — verify before raising further.
    // 25 × N concurrent Lambdas should comfortably fit S2/S3.
    max: Number(process.env.MSSQL_POOL_MAX) || 25,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 15000,
  },
};

// True when all four env vars are present (local dev + production)
export const DB_AVAILABLE = !!(
  process.env.AZURE_SQL_SERVER &&
  process.env.AZURE_SQL_DATABASE &&
  process.env.AZURE_SQL_USER &&
  process.env.AZURE_SQL_PASSWORD
);

// Module-level singleton — reused across requests in the same process
let poolPromise = null;

export function getPool() {
  if (!DB_AVAILABLE) {
    throw new Error('Azure SQL env vars not configured');
  }
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((err) => {
      poolPromise = null; // reset so next call retries
      throw err;
    });
  }
  return poolPromise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a parameterized query.
 *
 * params format:
 *   { name: { type: sql.NVarChar(255), value: 'hello' } }
 */
export async function query(queryString, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  for (const [name, { type, value }] of Object.entries(params)) {
    request.input(name, type, value);
  }
  return request.query(queryString);
}

export { sql };
