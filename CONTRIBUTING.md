# Contributing to x402Guard

x402Guard is a non-custodial x402 safety proxy for autonomous DeFi agents. This code handles real money on live networks. Every contribution is held to a high standard of correctness, security, and testability.

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) — required for all Rust builds (no local toolchain needed)
- [Rust stable](https://rustup.rs/) — optional for IDE tooling; all compilation runs in Docker
- [Node.js 22 LTS](https://nodejs.org/) and npm
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) — only if working on the Solana program

### Clone and Install

```bash
git clone https://github.com/your-org/x402Guard.git
cd x402Guard

# Install dashboard dependencies
cd dashboard
npm install
cd ..

# Install example dependencies
cd examples
npm install
cd ..
```

### Environment Setup

Copy the example env file and fill in values:

```bash
cp dashboard/.env.example dashboard/.env.local
```

Required variables are documented in `dashboard/.env.example`. Never commit secrets to source control.

### Verify the Build

Proxy (runs in Docker):

```bash
MSYS_NO_PATHCONV=1 docker run --rm -m 4g \
  -v "$(pwd):/app" -w /app rust:1.85-slim \
  bash -c "apt-get update -qq && apt-get install -y -qq pkg-config libssl-dev > /dev/null 2>&1 && cargo test 2>&1"
```

Dashboard:

```bash
cd dashboard && npm run build
```

---

## Development Workflow

### Branches

- Branch off `main` for every change.
- Use descriptive branch names: `feat/guardrail-cooldowns`, `fix/toctou-spend-race`.
- Open pull requests against `main`.

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

<optional body explaining why, not just what>
```

Accepted types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Examples:

```
feat: add cooldown period to guardrail rules
fix: prevent TOCTOU race in daily spend tracking
test: add unit tests for EIP-3009 nonce validation
```

### Pull Requests

- Keep PRs focused. One logical change per PR.
- Fill in the PR template fully, including the test plan.
- All CI checks must pass before merge.
- At least one maintainer review is required.

---

## Code Standards

### Immutability

Never mutate existing objects. Always return a new value.

```typescript
// Wrong
function applyLimit(rule, limit) {
  rule.limit = limit
  return rule
}

// Correct
function applyLimit(rule, limit) {
  return { ...rule, limit }
}
```

In Rust, prefer owned values and constructors over in-place mutation.

### File and Function Size

- Files: 200-400 lines typical, 800 lines hard maximum.
- Functions: fewer than 50 lines.
- No nesting deeper than 4 levels.
- If a file is growing large, extract cohesive units into separate modules.

### Logging

No `console.log`, `println!`, or `print()` in production paths. Use structured logging:

- Rust: `tracing` crate (`tracing::info!`, `tracing::error!`)
- TypeScript/Next.js: `pino` or the project logger utility
- Python: stdlib `logging` module

### Rust-Specific

Always wrap errors with context:

```rust
let record = repo.find(id).await
    .map_err(|e| anyhow::anyhow!("failed to load agent {id}: {e}"))?;
```

Never use unchecked casts on financial values:

```rust
// Wrong — silently truncates on overflow
let amount = value as u64;

// Correct — fails explicitly
let amount = u64::try_from(value)
    .map_err(|_| Error::ArithmeticOverflow)?;
```

### TypeScript-Specific

Use Zod for all external input validation:

```typescript
import { z } from 'zod'

const schema = z.object({
  agentId: z.string().uuid(),
  limitUsd: z.number().positive().max(1_000_000),
})

const validated = schema.parse(input)
```

Use spread for all object updates — never mutate:

```typescript
const updated = { ...existing, status: 'revoked' }
```

### Secrets

Never hardcode secrets, private keys, API keys, or any credential. Always read from environment variables and validate at startup:

```typescript
const apiKey = process.env.API_KEY
if (!apiKey) throw new Error('API_KEY environment variable is required')
```

---

## Testing Requirements

### Coverage Target

80% line coverage is the minimum for all packages. PRs that reduce coverage below this threshold will not be merged.

### Test-Driven Development

The preferred workflow is TDD:

1. Write a failing test that describes the desired behavior (RED).
2. Write the minimal implementation to make it pass (GREEN).
3. Refactor for clarity and correctness (IMPROVE).
4. Verify coverage has not regressed.

### Running Tests

Proxy (Rust, via Docker):

```bash
MSYS_NO_PATHCONV=1 docker run --rm -m 4g \
  -v "$(pwd):/app" -w /app rust:1.85-slim \
  bash -c "apt-get update -qq && apt-get install -y -qq pkg-config libssl-dev > /dev/null 2>&1 && cargo test 2>&1"
```

TypeScript examples:

```bash
cd examples && npx vitest run
```

Python (if applicable):

```bash
pytest --cov=src --cov-report=term-missing
```

Dashboard unit tests:

```bash
cd dashboard && npx vitest run
```

Dashboard E2E tests (Playwright):

```bash
cd dashboard && npx playwright test
```

---

## Security Rules

x402Guard operates on live networks with real funds. The following rules are non-negotiable.

### Secrets and Credentials

- Never hardcode secrets, private keys, RPC URLs with embedded keys, or API tokens.
- Never log secrets, even at debug level.
- If you suspect a secret was accidentally committed, rotate it immediately and notify maintainers.

### Arithmetic in Financial Code

- Never use unchecked arithmetic (`as i64`, `as u64`, `+` without overflow checks) on values that represent money, balances, or limits.
- Use checked or saturating arithmetic. Prefer `u64::try_from`, `checked_add`, `checked_sub`.

### Input Validation

- Validate all input at system boundaries: API handlers, webhook receivers, database reads, environment configuration.
- Fail fast with a clear error. Never silently accept unexpected input.

### Fail-Closed

- On any error, ambiguity, or missing authorization: deny the operation.
- Never default to allowing a transaction when the authorization check cannot be completed.

### Cross-Agent Authorization

- All mutations to guardrail rules, spending limits, or session keys require both `rule_id` and `agent_id` to be validated.
- Ownership must be asserted server-side. Never trust client-supplied ownership claims.

### Security Review

Before opening a PR that touches authorization logic, payment flows, guardrail enforcement, or cryptographic verification, run a manual security review against the checklist below and note any findings in the PR description.

---

## PR Checklist

Before requesting review, verify all of the following:

- [ ] All existing tests pass
- [ ] New code has test coverage (unit and/or integration)
- [ ] Coverage has not dropped below 80%
- [ ] No secrets, private keys, or API tokens in any file
- [ ] No `console.log`, `println!`, or bare `print()` in production paths
- [ ] No unchecked arithmetic on financial values (`as i64`, `as u64`)
- [ ] No mutation of existing objects (immutable update patterns used)
- [ ] All external inputs are validated at the boundary
- [ ] Errors are handled explicitly and wrapped with context
- [ ] Failure paths deny by default (fail-closed)
- [ ] All mutations verify both `agent_id` and ownership server-side
- [ ] Commit messages follow Conventional Commits format
- [ ] PR description includes a summary of changes and a test plan

---

## Questions and Discussions

Open a GitHub Discussion for design questions or proposals before writing code. For security vulnerabilities, do not open a public issue — follow the responsible disclosure process described in `SECURITY.md`.
