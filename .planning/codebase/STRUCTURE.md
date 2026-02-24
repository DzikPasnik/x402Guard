# Codebase Structure

**Analysis Date:** 2026-02-24

## Directory Layout

```
x402Guard/
├── proxy/                          # Main proxy application
│   ├── src/
│   │   ├── main.rs                # Entry point, startup logic
│   │   ├── config.rs              # Configuration from environment
│   │   ├── error.rs               # Error types and HTTP mapping
│   │   ├── router.rs              # Route and middleware composition
│   │   ├── handlers/              # HTTP request handlers
│   │   │   ├── mod.rs             # Handler module exports
│   │   │   ├── health.rs          # Health check endpoint
│   │   │   └── proxy.rs           # Main proxy endpoint
│   │   ├── middleware/            # Request/response middleware
│   │   │   ├── mod.rs             # Middleware module exports
│   │   │   ├── x402.rs            # x402 payment verification
│   │   │   ├── eip7702.rs         # EIP-7702 session key validation
│   │   │   ├── guardrails.rs      # Safety rule enforcement
│   │   │   └── rate_limit.rs      # Rate limiting (Redis-backed)
│   │   └── models/                # Domain data types
│   │       ├── mod.rs             # Model module exports
│   │       ├── agent.rs           # Agent registration/metadata
│   │       ├── session_key.rs     # EIP-7702 delegated keys
│   │       └── guardrail.rs       # Safety rules and rule types
│   └── Cargo.toml                 # Package metadata and dependencies
├── Cargo.toml                      # Workspace root
└── .env.example                    # Environment variable template
```

## Directory Purposes

**proxy/:**
- Purpose: Root of the HTTP proxy application package
- Contains: Source code, tests, and Cargo configuration
- Key files: `src/main.rs`, `Cargo.toml`

**proxy/src/:**
- Purpose: All Rust source code for the proxy
- Contains: Entry point, modules for routing, handlers, middleware, models, configuration, and error handling
- Key files: `main.rs` (startup), `router.rs` (route composition)

**proxy/src/handlers/:**
- Purpose: HTTP request handlers that implement endpoint logic
- Contains: Request processing functions and route definitions
- Key files: `health.rs` (liveness probe), `proxy.rs` (main payment forwarding)

**proxy/src/middleware/:**
- Purpose: Middleware implementations for request/response processing
- Contains: Stubs for x402 verification, session key validation, guardrails, rate limiting
- Key files: `x402.rs`, `eip7702.rs`, `guardrails.rs`, `rate_limit.rs`

**proxy/src/models/:**
- Purpose: Domain entity types used throughout the system
- Contains: Serializable data structures for agents, session keys, guardrails
- Key files: `agent.rs` (user model), `session_key.rs` (EIP-7702 key), `guardrail.rs` (rules)

## Key File Locations

**Entry Points:**
- `proxy/src/main.rs`: Application startup, configuration loading, TCP listener binding

**Configuration:**
- `proxy/src/config.rs`: `AppConfig` struct with environment variable parsing and defaults

**Core Logic:**
- `proxy/src/router.rs`: Route definition and middleware layer composition
- `proxy/src/handlers/proxy.rs`: Main proxy endpoint (Phase 1: stub)
- `proxy/src/handlers/health.rs`: Health check endpoint (implemented)

**Error Handling:**
- `proxy/src/error.rs`: `AppError` enum and `IntoResponse` implementation

**Domain Models:**
- `proxy/src/models/agent.rs`: Agent entity with ID, name, owner, status
- `proxy/src/models/session_key.rs`: SessionKey with spend limits and allowed contracts
- `proxy/src/models/guardrail.rs`: GuardrailRule enum with rule variants (MaxSpendPerTx, etc.)

**Middleware (Stubs):**
- `proxy/src/middleware/x402.rs`: Payment header verification (Phase 1)
- `proxy/src/middleware/eip7702.rs`: Session key delegation validation (Phase 2)
- `proxy/src/middleware/guardrails.rs`: Rule enforcement engine (Phase 2)
- `proxy/src/middleware/rate_limit.rs`: Redis-backed sliding window (Phase 1)

**Testing:**
- `proxy/src/handlers/health.rs`: Inline test for health endpoint (lines 31-57)

## Naming Conventions

**Files:**
- Module files use snake_case: `session_key.rs`, `rate_limit.rs`
- Handlers follow their route names: `health.rs`, `proxy.rs`
- Middleware named after their responsibility: `eip7702.rs`, `guardrails.rs`
- Main entry point is always `main.rs`

**Directories:**
- Feature groups use plural nouns: `handlers/`, `middleware/`, `models/`
- No type-based directories (e.g., no `services/`, `utils/`)

**Rust Types:**
- Structs use PascalCase: `Agent`, `SessionKey`, `GuardrailRule`, `AppConfig`
- Enums use PascalCase: `RuleType`, `AppError`
- Enum variants use PascalCase: `MaxSpendPerTx`, `MaxLeverage`, `BadRequest`
- Fields use snake_case: `owner_address`, `max_spend`, `allowed_contracts`

**Constants/Statics:**
- Routes follow kebab-case: `/api/v1/health`, `/api/v1/proxy`
- Environment variables use UPPER_SNAKE_CASE: `PROXY_HOST`, `BASE_SEPOLIA_RPC_URL`

## Where to Add New Code

**New Endpoint/Route:**
1. Create handler in `proxy/src/handlers/[endpoint_name].rs`
2. Implement async handler function
3. Define request/response DTOs in the same file
4. Add `pub fn routes() -> Router<AppConfig>` returning router with endpoint
5. Export in `proxy/src/handlers/mod.rs`
6. Merge route into main router in `proxy/src/router.rs`

**New Middleware:**
1. Create file in `proxy/src/middleware/[concern_name].rs`
2. Implement middleware logic (currently stubs with doc comments)
3. Export in `proxy/src/middleware/mod.rs`
4. Apply to router in `proxy/src/router.rs` using `.layer()`

**New Domain Model:**
1. Create file in `proxy/src/models/[entity_name].rs`
2. Define struct/enum with `#[derive(Debug, Clone, Serialize, Deserialize)]`
3. Include UUID identifiers and timestamps as needed
4. Export in `proxy/src/models/mod.rs`

**New Utility/Helper:**
- Small utilities: Add to relevant handler or middleware file
- Shared utilities: Create dedicated file in `proxy/src/` (e.g., `utils.rs`, `helpers.rs`)
- Never create a `utils/` directory; prefer single focused files

## Special Directories

**proxy/target/:**
- Purpose: Build artifacts (compiled binaries, dependencies)
- Generated: Yes (by Cargo build)
- Committed: No (in .gitignore)

**proxy/.cargo/:**
- Purpose: Cargo configuration and lock data
- Generated: Yes (if using Cargo.lock)
- Committed: Yes (Cargo.lock for deterministic builds)

## Configuration & Environment

**Development:**
- Copy `.env.example` to `.env` in project root
- Set `PROXY_HOST=0.0.0.0`, `PROXY_PORT=3402` for local testing
- Set `RUST_LOG=debug` for verbose tracing output
- RPC URLs default to Sepolia/Mainnet Base public endpoints

**Testing:**
- Unit tests in-file using `#[cfg(test)]` modules
- Test configuration created inline with minimal valid config
- Run with `cargo test` or `cargo test -- --nocapture` for output

---

*Structure analysis: 2026-02-24*
