// One-shot recovery script — run after rotating SESSION_SECRET locks out
// every admin (because adminAuth.js uses SESSION_SECRET as the scrypt
// salt, so old hashes no longer verify under the new secret).
//
// Usage:
//   node scripts/_recover_admin_passwords.js
//
// Computes new scrypt hashes with the CURRENT SESSION_SECRET (from
// .env.local) and UPDATEs admin_users for both admins.
//
// Pre-computed plaintexts (also embedded as scrypt hashes, so this
// script doesn't actually depend on the SESSION_SECRET being correct
// in your .env.local — it just needs DB access):
//   mc_bfd923         → WvsVB0GbBR0FBmwQ6MOt
//   mc_admin_87ef3b   → 9rI3_540y4V!1sf9YVM7
//
// DELETE THIS FILE AFTER USE — it embeds production hashes.

// Parse .env.local manually — the Next.js app uses Next's built-in
// loader (no `dotenv` dependency in package.json), so we replicate the
// minimal subset we need: KEY=VALUE per line, no interpolation, support
// for surrounding quotes.
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[m[1]] = val;
}

const sql = require('mssql');

const HASH_MC_BFD923 = 'scrypt:5dfb9e5382695fc7af313542e3a036904c7e4516254237809585461936a78bfd';
const HASH_MC_ADMIN_87EF3B = 'scrypt:b3a935790de7e27944479df50673d23848277a0a0e4cd47aacbe9529eb38f588';

const config = {
  server: process.env.AZURE_SQL_SERVER,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  database: process.env.AZURE_SQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

async function main() {
  console.log('Connecting to', config.server, 'as', config.user, '...');
  const pool = await sql.connect(config);

  // 1. PRE-state
  let r = await pool.request().query(
    "SELECT username, role, is_active, LEFT(password_hash, 40) AS prefix " +
    "FROM admin_users WHERE username IN ('mc_bfd923','mc_admin_87ef3b')"
  );
  console.log('PRE-UPDATE:');
  for (const row of r.recordset) console.log(' ', row);

  // 2. UPDATE both
  const u1 = await pool.request()
    .input('hash', sql.NVarChar(255), HASH_MC_BFD923)
    .query("UPDATE admin_users SET password_hash = @hash WHERE LOWER(username) = 'mc_bfd923'");
  console.log('mc_bfd923 rows affected:', u1.rowsAffected[0]);

  const u2 = await pool.request()
    .input('hash', sql.NVarChar(255), HASH_MC_ADMIN_87EF3B)
    .query("UPDATE admin_users SET password_hash = @hash WHERE LOWER(username) = 'mc_admin_87ef3b'");
  console.log('mc_admin_87ef3b rows affected:', u2.rowsAffected[0]);

  // 3. POST-state
  r = await pool.request().query(
    "SELECT username, role, is_active, LEFT(password_hash, 40) AS prefix " +
    "FROM admin_users WHERE username IN ('mc_bfd923','mc_admin_87ef3b')"
  );
  console.log('POST-UPDATE:');
  for (const row of r.recordset) console.log(' ', row);

  await pool.close();
  console.log('DONE — login passwords:');
  console.log('  mc_bfd923         → WvsVB0GbBR0FBmwQ6MOt');
  console.log('  mc_admin_87ef3b   → 9rI3_540y4V!1sf9YVM7');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
