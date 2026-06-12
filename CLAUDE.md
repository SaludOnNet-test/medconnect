@AGENTS.md

---

# medconnect (prioritamed) — Optimization Setup

## Automation Enabled

Global rules from `~/.claude/CLAUDE.md` apply here:
- ✅ Silent `/optimize` on every prompt
- ✅ Auto-detection of complex tasks (3+ steps)
- ✅ Suggested `/lean` routing in reasoning

## Stack

- **Frontend**: Next.js 14+ (App Router)
- **Backend**: API routes + external integrations
- **Database**: Azure SQL (saludonai.database.windows.net)
- **Auth**: Clerk (live keys configured)
- **Observability**: Sentry + Upstash Redis
- **Deploy**: Vercel (medconnect team under saludonnet-tests-projects)

## Key Files

| Type | Path |
|------|------|
| Config | `next.config.js`, `.env.local` |
| Types | `src/types/` |
| Components | `src/components/` (React) |
| API | `src/app/api/` |
| Utilities | `src/lib/` |

## Commands

**Dev server**:
```bash
npm run dev
```

**Build**:
```bash
npm run build
```

**Tests** (if applicable):
```bash
npm test
```

## Standards

- All code identifiers in **English** (no Spanish in code)
- CSS: SCSS with BEMIT methodology
- Components: TypeScript + React best practices
- Commit messages: Descriptive + co-authored

## Build & Test Rule

**MANDATORY**: After every coding task:
1. Commit + push
2. Wait ~15 minutes for Jenkins (UAT2_10_CleanAndBuild + UAT2_12_UnitTests)
3. Verify both jobs are green before marking task done

**No exceptions** — all code must compile + all tests pass.

## Skills to Use

| Task | Skill |
|------|-------|
| Vague request | `/optimize <request>` |
| 3+ step refactor | `/lean <description>` |
| Code quality | `/code-review` or `/simplify` |
| Architecture | `/plan` (Plan mode) |
