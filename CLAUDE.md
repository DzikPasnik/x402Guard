# x402Guard — Project Rules

## What This Is
Non-custodial x402 safety proxy for autonomous DeFi agents on Base (EVM) and Solana.
Security paranoia level: 10. This code handles real money.

## Memory & Notes
Persistent project memory lives in `~/.claude/projects/D--x402Guard/memory/`:
- `MEMORY.md` — project state, build env, key paths, user preferences
- `workflow.md` — orchestration rules, self-improvement loop, task management

Read these at session start. Update after every PR or correction.

## Build Rules
- **Rust builds**: ALWAYS use Docker. No local MSVC/gcc available.
  ```bash
  MSYS_NO_PATHCONV=1 docker run --rm -m 4g -v "D:/x402Guard:/app" -w /app rust:1.85-slim \
    bash -c "apt-get update -qq && apt-get install -y -qq pkg-config libssl-dev > /dev/null 2>&1 && CARGO_BUILD_JOBS=2 cargo test 2>&1"
  ```
- **serde**: pinned to `=1.0.219` (serde_core split breaks alloy-consensus)
- **alloy features**: `["sol-types", "signers", "signer-local"]` — no "full" (avoids blst C dep)
- **Dashboard**: Next.js 16 in `dashboard/` — `npm run build` for verification
- **CI**: Node 22 LTS, `rm -f package-lock.json && npm install` (cross-platform lock file issue)
- **Solana**: Separate Anchor workspace in `solana/` (not part of root Cargo workspace)

## Security Rules (DeFi-Critical)
- NEVER hardcode secrets, private keys, or API keys
- NEVER use `as i64`/`as u64` — always checked casts
- NEVER mutate financial state without reserve-then-forward pattern (TOCTOU prevention)
- ALWAYS validate at system boundaries (user input, API responses)
- ALWAYS fail-closed on errors (deny by default)
- ALWAYS wrap errors with context
- Cross-agent authorization required on ALL mutations (rule_id AND agent_id)
- Immutable audit log: no UPDATE/DELETE functions + DB trigger defense

## Code Style
- Immutability: create new objects, never mutate existing ones
- Many small files > few large files (200-400 lines typical, 800 max)
- Functions < 50 lines, no deep nesting (> 4 levels)
- No `console.log`/`print` in production — use structured logging
- TypeScript: Zod for validation, spread for immutable updates
- Python: frozen dataclasses, type hints everywhere, stdlib logging
- Rust: `fmt::Errorf`-style error wrapping, accept interfaces return structs

## Workflow
- Plan mode for 3+ step tasks. Stop and re-plan if things go sideways.
- Use subagents liberally — one task per subagent, parallel where possible.
- TDD: write tests first (RED), implement (GREEN), refactor (IMPROVE).
- After ANY correction: update this CLAUDE.md so the mistake doesn't repeat.
- Never mark complete without proving it works (run tests, check build).

## Learned Lessons
- **npm cross-platform lock files**: Lock files contain platform-specific optional deps (lightningcss, swc). Dev on Windows = win32 binaries in lock. CI on Linux needs linux binaries. Solution: CI deletes lock and runs `npm install` fresh. NEVER use `npm ci` when developing cross-platform.
- `package-lock.json` from npm 11 (Node 24) has lockfileVersion incompatible with npm 10 (Node 20/22). Keep CI on Node 22+.
- Next.js 16: `params` is Promise (must `await`), `useActionState` from 'react' (NOT react-dom).
- shadcn/ui v3 uses unified `radix-ui` package (not old `@radix-ui/react-*` split).
- Write tool requires reading file first if it already exists.
- GSD plan naming: `XX-YY-PLAN.md` format expected by GSD tools.
- Docker pipe may not be ready immediately after Docker Desktop starts — retry once.
- **PostgreSQL SUM(BIGINT) → NUMERIC**: Always cast: `COALESCE(SUM(col), 0)::BIGINT`. sqlx expects i64 but gets NUMERIC without cast.
- **Railway build queue stalls**: If "Waiting for build" >5 min, check Build Logs (may be building). If stuck, remove deploy + push new commit.
- **AppError::Internal swallows errors**: Every `.map_err(AppError::Internal)?` MUST be preceded by `tracing::error!` for debuggability.

## Key Paths
- Proxy: `proxy/src/` (handlers, middleware, models, services)
- Dashboard: `dashboard/src/` (Next.js App Router)
- Solana: `solana/programs/x402_guard/`
- Planning: `.planning/` (STATE.md, ROADMAP.md, REQUIREMENTS.md)
- Phase plans: `.planning/phases/XX-name/`
- CI: `.github/workflows/ci.yml`
