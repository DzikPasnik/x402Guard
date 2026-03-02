# Phase 5: Integration Examples - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Working SDK plugins/adapters for three agent frameworks (ElizaOS, Virtuals Protocol, Cod3x) showing how to integrate x402Guard proxy. Each example demonstrates the full lifecycle: agent registration, guardrail configuration, guarded payment (Base EVM + Solana), and guardrail violation handling. Examples live in this repo, include tests, and are polished to SDK-release quality.

</domain>

<decisions>
## Implementation Decisions

### Plugin Interface Design
- Typed SDK with helpers: exported types, helper functions (createGuardrail, revokeKeys), typed error classes
- Configuration: constructor args take priority, missing values fall back to env vars (X402GUARD_PROXY_URL, X402GUARD_AGENT_ID, etc.)
- Python plugin (Virtuals): Pythonic with frozen dataclasses for types, context managers for client lifecycle, full type hints
- TypeScript plugins (ElizaOS, Cod3x): whether to share a common core package is Claude's discretion

### Demo Script Scope
- Demos connect to real running proxy (docker compose up required)
- Full flow demo: register agent -> set guardrail rules -> make guarded payment -> trigger guardrail violation
- Off-chain only: proxy validates signatures and guardrails without broadcasting to testnet (no testnet ETH needed)
- Both chains: demos show Base (EVM) x402 flow AND Solana vault flow

### Example Depth & Polish
- Polished SDK quality: proper package.json/pyproject.toml, exports, JSDoc/docstrings, ready to publish
- Subdirectories in this repo: examples/elizaos/, examples/virtuals/, examples/cod3x/
- Comprehensive READMEs: prerequisites, step-by-step setup, config reference, API docs, architecture diagram (mermaid), troubleshooting
- Automated tests: unit tests for SDK functions + integration tests against running proxy, CI runs them

### Error Handling & DX
- Typed exception hierarchy: GuardrailViolationError with rule_type, limit, actual values. Language-specific subtypes per violation
- Built-in retry with exponential backoff: auto-retry on 429 (uses Retry-After header) and network errors, configurable max retries
- Structured logging: DEBUG/INFO/WARN/ERROR levels. TS: pino or debug. Python: stdlib logging. Configurable verbosity. No console.log/print
- Connection check + helpful errors: client.healthCheck() on init, clear actionable messages like "Proxy unreachable at http://... -- is docker compose up running?"

### Claude's Discretion
- Whether ElizaOS and Cod3x share a @x402guard/core TypeScript package or are fully independent
- Exact logging library choice per framework
- Internal SDK architecture (class-based vs functional)
- Test framework choice per example (vitest/jest for TS, pytest for Python)

</decisions>

<specifics>
## Specific Ideas

- ElizaOS plugin wraps WalletProvider (as specified in roadmap)
- Virtuals Protocol GAME plugin wraps DeFi function calls (as specified in roadmap)
- Cod3x uses protocol adapter pattern (as specified in roadmap)
- Demo should clearly show the guardrail violation with readable error output so it's obvious what happened
- Each demo should be runnable with a single command after docker compose up (e.g., npm run demo, python demo.py)

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 05-integration-examples*
*Context gathered: 2026-03-02*
