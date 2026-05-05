import sql from 'mssql';

// ---------------------------------------------------------------------------
// Connection configuration
// ---------------------------------------------------------------------------
const config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  // 30 s connection timeout — Azure SQL on the lower tiers can take
  // 20-30 s to wake from idle; 15 s was firing Sentry alerts (release
  // caf12a7, 2026-05-05). Vercel Pro functions run up to 60 s, so we
  // can safely afford this without pinning a Lambda's full budget.
  // requestTimeout stays at 20 s — once the connection is up, queries
  // are fast and a 20 s wait already signals a runaway query.
  connectionTimeout: 30_000,
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
    // Aligned with connectionTimeout — when the DB is waking up, the
    // pool should wait long enough to acquire instead of racing ahead.
    acquireTimeoutMillis: 30000,
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
    poolPromise = connectWithRetry().catch((err) => {
      poolPromise = null; // reset so next request retries from scratch
      throw err;
    });
  }
  return poolPromise;
}

// Cold-start retry — Azure SQL on the lower tiers auto-pauses after idle
// and takes 20-30 s to wake. The first connect call frequently times out
// at exactly the wake-up boundary; pausing 1 s and retrying once catches
// the now-warm DB without round-tripping the user. Sentry alerted on
// this in production (release caf12a7, 2026-05-05).
async function connectWithRetry() {
  try {
    return await new sql.ConnectionPool(config).connect();
  } catch (err) {
    if (!isRetryableConnectionError(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return new sql.ConnectionPool(config).connect();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Tedious / mssql throws a `ConnectionError` (name === 'ConnectionError')
// or codes like ETIMEOUT / ESOCKET / ECONNCLOSED when the TCP/TLS handshake
// to Azure SQL fails or stalls. These are the cases worth a single retry —
// almost always Azure SQL waking up from auto-pause. Genuine logical errors
// (bad SQL, constraint violations, auth failures) come with different
// shapes and are NOT retried.
function isRetryableConnectionError(err) {
  if (!err) return false;
  if (err.name === 'ConnectionError') return true;
  const code = err.code || err?.originalError?.code;
  if (code === 'ETIMEOUT' || code === 'ESOCKET' || code === 'ECONNCLOSED' || code === 'ECONNRESET') {
    return true;
  }
  const msg = String(err.message || '');
  return msg.includes('Failed to connect') || msg.includes('Connection lost');
}

/**
 * Run a parameterized query.
 *
 * params format:
 *   { name: { type: sql.NVarChar(255), value: 'hello' } }
 *
 * Cold-start retries are handled inside `getPool()` (`connectWithRetry`),
 * so by the time we reach `request.query` here the connection is either
 * healthy or has already failed twice — no further retry needed.
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
