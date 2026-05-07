// Server-side guardrails for the security agent's auto-actions.
//
// The model can PROPOSE anything — these checks decide whether a proposed
// auto-action runs without human approval, or gets demoted to "needs
// approval" and a Telegram message.
//
// Every check returns a `{ ok, reason? }` object. Callers gate on `ok`.

const PROTECTED_PATH_PATTERNS = [
  /(^|\/)auth(\/|$|\.)/i,
  /(^|\/)payments(\/|$|\.)/i,
  /(^|\/)stripe(\/|$|\.)/i,
  /(^|\/)clerk(\/|$|\.)/i,
  /(^|\/)webhook(\/|$|\.)/i,
  /(^|\/)admin(\/|$|\.)/i,
  /\.sql$/i,
  /^vercel\.json$/i,
  /^package(-lock)?\.json$/i,
  /^next\.config\./i,
  /^src\/middleware\./i,
  /^src\/lib\/sentry\./i,
  /^src\/lib\/db\./i,
  /^src\/lib\/captcha\./i,
];

const ALLOWED_AUTO_PATH_PREFIX = /^src\/(app|lib|components)\//;

/**
 * Is the proposed file path safe for auto-merge? Auto-merge is only allowed
 * inside `src/app/`, `src/lib/`, `src/components/` AND none of the protected
 * patterns match.
 */
export function isPathAutoMergeable(path) {
  if (!path || typeof path !== 'string') return { ok: false, reason: 'no path' };
  if (!ALLOWED_AUTO_PATH_PREFIX.test(path)) {
    return { ok: false, reason: `path ${path} outside auto-merge prefix` };
  }
  for (const re of PROTECTED_PATH_PATTERNS) {
    if (re.test(path)) {
      return { ok: false, reason: `path ${path} matches protected pattern ${re}` };
    }
  }
  return { ok: true };
}

/**
 * All-or-nothing whitelist for a multi-file PR. If even one file fails the
 * path test, the whole PR demotes to "needs approval".
 */
export function arePathsAutoMergeable(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return { ok: false, reason: 'no paths' };
  for (const p of paths) {
    const r = isPathAutoMergeable(p);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/**
 * Cap on the diff size we'll auto-merge. Reads `max_diff_lines` from
 * agent_config (passed in to keep this module pure).
 */
export function isDiffSizeAcceptable({ totalLinesChanged, maxLines }) {
  const max = Number(maxLines) || 30;
  if (!Number.isFinite(totalLinesChanged)) {
    return { ok: false, reason: 'unknown diff size' };
  }
  if (totalLinesChanged > max) {
    return { ok: false, reason: `${totalLinesChanged} lines > ${max} limit` };
  }
  return { ok: true };
}

/**
 * For auto-rollback to fire, the deploy must be inside the post-deploy guard
 * window AND the error rate must exceed the multiplier for the configured
 * sustained window.
 */
export function shouldAutoRollback({
  deployAgeMinutes,
  errorRate,
  baselineErrorRate,
  sustainedMinutes,
  config,
}) {
  if (config.auto_rollback_enabled !== 'true') {
    return { ok: false, reason: 'auto_rollback_enabled=false' };
  }
  const guardMinutes = Number(config.post_deploy_guard_minutes) || 10;
  if (!(deployAgeMinutes >= 0 && deployAgeMinutes <= guardMinutes)) {
    return { ok: false, reason: `outside ${guardMinutes}-min guard window (age ${deployAgeMinutes})` };
  }
  const multiplier = Number(config.error_rate_multiplier) || 3;
  const minSustained = Number(config.error_rate_min_window_minutes) || 5;
  if (!(baselineErrorRate >= 0 && errorRate > baselineErrorRate * multiplier)) {
    return { ok: false, reason: `error rate ${errorRate} not > ${multiplier}× baseline ${baselineErrorRate}` };
  }
  if (sustainedMinutes < minSustained) {
    return { ok: false, reason: `sustained ${sustainedMinutes}m < required ${minSustained}m` };
  }
  return { ok: true };
}

/**
 * Combined check for auto-merging a hotfix PR. Caller still has to verify
 * that CI checks are green before flipping the merge button — that is
 * out-of-band and not modeled here.
 */
export function canAutoMergeHotfix({
  paths,
  totalLinesChanged,
  isRegression,
  ciGreen,
  config,
}) {
  if (config.auto_merge_enabled !== 'true') {
    return { ok: false, reason: 'auto_merge_enabled=false' };
  }
  if (!isRegression) return { ok: false, reason: 'not flagged as regression' };
  if (!ciGreen) return { ok: false, reason: 'CI not green' };
  const pathOk = arePathsAutoMergeable(paths);
  if (!pathOk.ok) return pathOk;
  const sizeOk = isDiffSizeAcceptable({
    totalLinesChanged,
    maxLines: config.max_diff_lines,
  });
  if (!sizeOk.ok) return sizeOk;
  return { ok: true };
}

/**
 * Filter Sentry webhook events before invoking the model. Cheap rejection
 * of triviality keeps token spend down.
 */
export function shouldProcessSentryEvent({ level, timesSeen, config }) {
  const minLevel = (config.sentry_min_level || 'error').toLowerCase();
  const levelRank = { fatal: 4, error: 3, warning: 2, info: 1, debug: 0 };
  const incoming = levelRank[String(level || '').toLowerCase()] ?? 0;
  const minRank = levelRank[minLevel] ?? 3;
  if (incoming < minRank) return { ok: false, reason: `level ${level} < ${minLevel}` };
  const minTimes = Number(config.sentry_min_times_seen) || 5;
  if (Number(timesSeen || 0) < minTimes) {
    return { ok: false, reason: `times_seen ${timesSeen} < ${minTimes}` };
  }
  return { ok: true };
}
