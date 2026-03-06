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
- **CI**: Node 22 LTS (not 20 — npm lock compatibility with local npm 11)
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
- `package-lock.json` from npm 11 (Node 24) breaks `npm ci` on Node 20. Keep CI on Node 22+.
- Next.js 16: `params` is Promise (must `await`), `useActionState` from 'react' (NOT react-dom).
- shadcn/ui v3 uses unified `radix-ui` package (not old `@radix-ui/react-*` split).
- Write tool requires reading file first if it already exists.
- GSD plan naming: `XX-YY-PLAN.md` format expected by GSD tools.
- Docker pipe may not be ready immediately after Docker Desktop starts — retry once.

## Key Paths
- Proxy: `proxy/src/` (handlers, middleware, models, services)
- Dashboard: `dashboard/src/` (Next.js App Router)
- Solana: `solana/programs/x402_guard/`
- Planning: `.planning/` (STATE.md, ROADMAP.md, REQUIREMENTS.md)
- Phase plans: `.planning/phases/XX-name/`
- CI: `.github/workflows/ci.yml`
