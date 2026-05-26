import { getPool, DB_AVAILABLE } from '@/lib/db';

// Reads Azure SQL's own self-reporting view. Available on all tiers.
// `sys.dm_db_resource_stats` retains the last hour of samples (15-second
// granularity); we average over the latest 4 samples to smooth out spikes.
//
// Returns the worst metric (highest %) as the headline `percentage` so the
// semáforo refleja "any axis is saturated, not just CPU".
export async function checkAzureSql() {
  if (!DB_AVAILABLE) {
    return { provider: 'azureSql', ok: false, error: 'env not configured' };
  }
  try {
    const pool = await getPool();
    const res = await pool.request().query(`
      SELECT TOP 4
        avg_cpu_percent,
        avg_data_io_percent,
        avg_log_write_percent,
        max_worker_percent,
        max_session_percent
      FROM sys.dm_db_resource_stats
      ORDER BY end_time DESC
    `);
    const rows = res.recordset;
    if (rows.length === 0) {
      return { provider: 'azureSql', ok: true, note: 'no samples available yet' };
    }
    const avg = (key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / rows.length;
    const cpu = avg('avg_cpu_percent');
    const io = avg('avg_data_io_percent');
    const log = avg('avg_log_write_percent');
    const workers = avg('max_worker_percent');
    const sessions = avg('max_session_percent');
    const percentage = Math.round(Math.max(cpu, io, log, workers, sessions));

    return {
      provider: 'azureSql',
      ok: true,
      used: null,
      limit: null,
      percentage,
      status: classify(percentage),
      detail: {
        cpu: Math.round(cpu),
        io: Math.round(io),
        log: Math.round(log),
        workers: Math.round(workers),
        sessions: Math.round(sessions),
      },
      note: `Pico últimos ~60s: CPU ${Math.round(cpu)}% · IO ${Math.round(io)}% · sesiones ${Math.round(sessions)}%`,
    };
  } catch (err) {
    return { provider: 'azureSql', ok: false, error: err.message };
  }
}

function classify(p) {
  if (p >= 90) return 'critical';
  if (p >= 80) return 'warn';
  return 'ok';
}
