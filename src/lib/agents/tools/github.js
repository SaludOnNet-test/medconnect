// GitHub REST API tools.
//
// Used by the security agent to:
//   1. Read source files at a specific ref (so the model can see the code
//      causing the Sentry error).
//   2. Open a hotfix PR with one or more file changes (a "branch + commit
//      + PR" sequence).
//   3. Auto-merge a PR once CI is green AND the guardrails approve.
//
// Auth: `GITHUB_TOKEN` (PAT or fine-grained app token) with `contents:write`
// + `pull_requests:write`. `GITHUB_REPO` in `owner/repo` form. `GITHUB_BASE_BRANCH`
// defaults to `main`.

import { fetchWithTimeout } from '@/lib/http';

const GH_BASE = 'https://api.github.com';
const TIMEOUT_MS = 10_000;
const UA = 'medconnect-agents/1.0';

function authHeader() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': UA,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
function repo()       { return process.env.GITHUB_REPO || ''; }
function baseBranch() { return process.env.GITHUB_BASE_BRANCH || 'main'; }

async function ghJson(method, path, body) {
  const res = await fetchWithTimeout(GH_BASE + path, {
    method,
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { __error: `github ${res.status}: ${errText.slice(0, 300)}` };
  }
  // Some endpoints (DELETE, MERGE) return 204 with no body.
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) return { ok: true };
  return res.json();
}

// ---------------------------------------------------------------------------
// Read-only tool: get_file_from_github
// ---------------------------------------------------------------------------

export async function getFileFromGithub({ path, ref } = {}) {
  if (!path) return { error: 'path required' };
  if (!repo()) return { error: 'GITHUB_REPO not configured' };
  const refQ = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const r = await ghJson(
    'GET',
    `/repos/${repo()}/contents/${path.split('/').map(encodeURIComponent).join('/')}${refQ}`
  );
  if (r.__error) return { error: r.__error };
  if (Array.isArray(r)) return { error: 'path resolves to a directory' };
  let content = null;
  try {
    content = Buffer.from(r.content || '', 'base64').toString('utf8');
  } catch {/* leave null */}
  return {
    path: r.path,
    sha: r.sha,
    size: r.size,
    encoding: r.encoding,
    truncated: !content,
    content: content?.slice(0, 30_000), // safety cap
  };
}

export const GET_FILE_SCHEMA = {
  name: 'get_file_from_github',
  description: 'Lee un fichero del repo en un ref dado (default rama base). Devuelve hasta 30 KB de texto.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Ruta relativa al root del repo. Ej: "src/app/api/bookings/route.js".' },
      ref: { type: 'string', description: 'Branch, tag o SHA. Default: rama base.' },
    },
    required: ['path'],
  },
};

// ---------------------------------------------------------------------------
// Write tool: propose_hotfix_pr (branch + commits + PR — never merges)
// ---------------------------------------------------------------------------

export async function proposeHotfixPr({ branch, files, title, body } = {}) {
  if (!branch || !Array.isArray(files) || files.length === 0 || !title) {
    return { error: 'branch, files[] and title are required' };
  }
  if (!repo()) return { error: 'GITHUB_REPO not configured' };
  const base = baseBranch();

  // 1. Get the SHA of the base branch HEAD.
  const baseRef = await ghJson('GET', `/repos/${repo()}/git/refs/heads/${encodeURIComponent(base)}`);
  if (baseRef.__error) return { error: baseRef.__error };
  const baseSha = baseRef.object?.sha;
  if (!baseSha) return { error: 'failed to resolve base SHA' };

  // 2. Create the hotfix branch.
  const refRes = await ghJson('POST', `/repos/${repo()}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });
  if (refRes.__error && !/already exists/i.test(refRes.__error)) {
    return { error: refRes.__error };
  }

  // 3. Commit each file via the contents API. PUT either creates or
  // updates a file; we look up the existing SHA per file to update if it
  // exists. This avoids needing the lower-level git/blobs+trees API.
  let totalLinesChanged = 0;
  const committed = [];
  for (const file of files) {
    if (!file?.path || file.content == null) {
      return { error: `file entry missing path/content: ${JSON.stringify(file).slice(0, 200)}` };
    }
    const before = await getFileFromGithub({ path: file.path, ref: branch });
    const exists = before && !before.error && before.sha;
    const newContent = String(file.content);
    // Approximate lines changed by counting line differences (good enough
    // for the diff-size guardrail; precise diffstat is the responsibility
    // of CI/PR view).
    const beforeLines = exists ? String(before.content || '').split('\n').length : 0;
    const afterLines = newContent.split('\n').length;
    const linesChanged = Math.abs(afterLines - beforeLines) +
      // Penalty term: also count differing lines up to the smaller length.
      Math.max(beforeLines, afterLines) - Math.min(beforeLines, afterLines);
    totalLinesChanged += linesChanged;

    const put = await ghJson(
      'PUT',
      `/repos/${repo()}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}`,
      {
        message: file.message || `[agent] ${file.path}`,
        content: Buffer.from(newContent, 'utf8').toString('base64'),
        branch,
        ...(exists ? { sha: before.sha } : {}),
      }
    );
    if (put.__error) return { error: put.__error };
    committed.push({ path: file.path, sha: put.commit?.sha, linesChanged });
  }

  // 4. Open the PR.
  const pr = await ghJson('POST', `/repos/${repo()}/pulls`, {
    title: title.slice(0, 255),
    head: branch,
    base,
    body: body || '',
    draft: false,
  });
  if (pr.__error) return { error: pr.__error };
  return {
    ok: true,
    prNumber: pr.number,
    prUrl: pr.html_url,
    branch,
    base,
    committed,
    totalLinesChanged,
  };
}

export const PROPOSE_HOTFIX_PR_SCHEMA = {
  name: 'propose_hotfix_pr',
  description:
    'Crea una rama nueva, comitea uno o varios cambios de fichero, y abre un PR contra la rama base. NO mergea. Devuelve { prNumber, prUrl, totalLinesChanged }.',
  input_schema: {
    type: 'object',
    properties: {
      branch: { type: 'string', description: 'Nombre de la rama nueva. Convenir prefijo "agent/hotfix-...".' },
      files: {
        type: 'array',
        description: 'Lista de cambios. Cada entrada: { path, content, message? }.',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            message: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
      title: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['branch', 'files', 'title'],
  },
};

// ---------------------------------------------------------------------------
// Auto-merge tool — gated behind guardrails server-side.
// ---------------------------------------------------------------------------

export async function getPrStatus({ prNumber } = {}) {
  if (!prNumber) return { error: 'prNumber required' };
  if (!repo()) return { error: 'GITHUB_REPO not configured' };
  const pr = await ghJson('GET', `/repos/${repo()}/pulls/${encodeURIComponent(prNumber)}`);
  if (pr.__error) return { error: pr.__error };
  // Combined CI state.
  const checks = await ghJson(
    'GET',
    `/repos/${repo()}/commits/${pr.head.sha}/check-runs`
  );
  const checkRuns = checks?.check_runs || [];
  const ciGreen = checkRuns.length > 0 &&
    checkRuns.every((c) => c.status === 'completed' && (c.conclusion === 'success' || c.conclusion === 'skipped' || c.conclusion === 'neutral'));
  return {
    prNumber: pr.number,
    state: pr.state,
    merged: pr.merged,
    mergeable: pr.mergeable,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    title: pr.title,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    ciCheckCount: checkRuns.length,
    ciGreen,
  };
}

export async function mergePr({ prNumber, mergeMethod = 'squash' } = {}) {
  if (!prNumber) return { error: 'prNumber required' };
  if (!repo()) return { error: 'GITHUB_REPO not configured' };
  const r = await ghJson('PUT', `/repos/${repo()}/pulls/${encodeURIComponent(prNumber)}/merge`, {
    merge_method: ['merge', 'squash', 'rebase'].includes(mergeMethod) ? mergeMethod : 'squash',
  });
  if (r.__error) return { error: r.__error };
  return { ok: true, prNumber, sha: r.sha, merged: r.merged };
}

export const GET_PR_STATUS_SCHEMA = {
  name: 'get_pr_status',
  description: 'Devuelve el estado de un PR: state, mergeable, additions/deletions/changedFiles y resumen del check-suite.',
  input_schema: {
    type: 'object',
    properties: {
      prNumber: { type: 'integer' },
    },
    required: ['prNumber'],
  },
};

export const MERGE_PR_SCHEMA = {
  name: 'merge_pr',
  description:
    'Mergea un PR. SOLO se ejecuta tras pasar los guardrails server-side (canAutoMergeHotfix). En cualquier otro caso el orquestador transforma esta llamada en una propuesta para aprobación.',
  input_schema: {
    type: 'object',
    properties: {
      prNumber: { type: 'integer' },
      mergeMethod: { type: 'string', enum: ['merge', 'squash', 'rebase'] },
    },
    required: ['prNumber'],
  },
};
