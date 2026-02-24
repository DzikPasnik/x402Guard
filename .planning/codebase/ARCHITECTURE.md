# Architecture

**Analysis Date:** 2026-02-24

## Pattern Overview

**Overall:** Layered request-response proxy architecture with middleware composition pattern.

**Key Characteristics:**
- Axum web framework with tower middleware stack
- Modular middleware pipeline for security and payment verification
- Type-safe Rust with error handling via custom `AppError` enum
- Configuration-driven setup with environment variable support
- Async/await concurrency model with Tokio runtime

## Layers

**Request Handler Layer:**
- Purpose: Process incoming HTTP requests and return responses
- Location: `proxy/src/handlers/`
- Contains: Endpoint handlers for proxy requests and health checks
- Depends on: Models, error types, middleware validation results
- Used by: Axum router for HTTP routing

**Middleware Layer:**
- Purpose: Intercept and validate requests before handlers process them
- Location: `proxy/src/middleware/`
- Contains: x402 payment verification, EIP-7702 session key validation, guardrails enforcement, rate limiting
- Depends on: Models, configuration
- Used by: Tower middleware stack in router

**Model Layer:**
- Purpose: Define domain entities and types for agents, session keys, guardrails
- Location: `proxy/src/models/`
- Contains: `Agent`, `SessionKey`, `GuardrailRule`, `RuleType`
- Depends on: Serde for serialization, chrono for timestamps
- Used by: Handlers, middleware, configuration

**Configuration Layer:**
- Purpose: Load and expose application configuration from environment
- Location: `proxy/src/config.rs`
- Contains: `AppConfig` struct with host, port, RPC URLs, database, Redis configuration
- Depends on: Environment variables with defaults for local development
- Used by: Main function and router as application state

**Error Handling Layer:**
- Purpose: Unified error type and HTTP response mapping
- Location: `proxy/src/error.rs`
- Contains: `AppError` enum with variants for different failure modes
- Depends on: Axum HTTP types and Serde
- Used by: All handlers to return `Result<T, AppError>`

## Data Flow

**Incoming Payment Request:**

1. HTTP POST to `/api/v1/proxy` with `ProxyRequest` payload
2. Request passes through middleware stack (rate limit → x402 verification → EIP-7702 validation → guardrails)
3. Handler receives `ProxyRequest` containing target URL, x402 payment header, optional session key ID
4. Handler validates and forwards request to target service (Phase 1)
5. Handler returns `ProxyResponse` with success status, optional tx hash, and message
6. Middleware (on the way out) may inject additional headers or validation

**Error Flow:**

1. Any middleware or handler error returns `AppError`
2. `AppError::IntoResponse` trait maps error to HTTP status code and JSON error body
3. Returns appropriate HTTP status (400, 401, 403, 404, 429, 500) with error message

**State Management:**
- Configuration state passed through Axum router via `Router::with_state(config)`
- Configuration is immutable and shared across all handlers
- Session key and guardrail state managed via external systems (database, Redis)
- No shared mutable state in handlers (immutable patterns)

## Key Abstractions

**Agent:**
- Purpose: Represents a registered user/application using x402Guard
- Examples: `proxy/src/models/agent.rs`
- Pattern: Plain data struct with UUID identifier, metadata, and active status

**SessionKey:**
- Purpose: EIP-7702 delegated key with scoped spend limits and contract whitelist
- Examples: `proxy/src/models/session_key.rs`
- Pattern: Encapsulates cryptographic public key, spending allowance, and expiration

**GuardrailRule:**
- Purpose: Configurable safety rule enforced on transactions
- Examples: `proxy/src/models/guardrail.rs`
- Pattern: Tagged enum allowing different rule types (MaxSpendPerTx, MaxLeverage, etc.)

**ProxyRequest/ProxyResponse:**
- Purpose: DTO for proxy endpoint contract
- Examples: `proxy/src/handlers/proxy.rs`
- Pattern: Serializable structs with clear request/response separation

## Entry Points

**Main:**
- Location: `proxy/src/main.rs`
- Triggers: Binary execution via `cargo run` or deployment
- Responsibilities: Parse CLI/environment, initialize logging, load configuration, create router, start TCP listener

**Router Creation:**
- Location: `proxy/src/router.rs`
- Triggers: Called from main during startup
- Responsibilities: Compose handler routes, apply middleware layers (CORS, tracing), attach configuration state

**Health Endpoint:**
- Location: `proxy/src/handlers/health.rs`
- Route: `GET /api/v1/health`
- Responsibilities: Return service status, version, and name for liveness checks

**Proxy Endpoint:**
- Location: `proxy/src/handlers/proxy.rs`
- Route: `POST /api/v1/proxy`
- Responsibilities: Forward x402 payment requests, coordinate middleware checks, return transaction results

## Error Handling

**Strategy:** Explicit error type with comprehensive variant coverage and HTTP mapping.

**Patterns:**
- Use `Result<T, AppError>` for all fallible operations
- Use `anyhow::Context` for internal error context wrapping (converted to `AppError::Internal`)
- Middleware returns HTTP status codes (401, 403, 429) for specific security/rate limit violations
- Handler returns 200 on success, 4xx/5xx on error with structured JSON error body
- Never expose internal error details in production responses (mapped to generic "internal server error")

## Cross-Cutting Concerns

**Logging:**
- Framework: tracing crate with structured JSON output
- Setup: `tracing_subscriber::fmt().with_env_filter().json()`
- Configured via `RUST_LOG` environment variable (defaults to info level)
- Used in main startup sequence and handler traces

**Validation:**
- Input validation happens in handler via deserialization (Serde)
- Middleware performs additional semantic validation (payment signature, guardrail bounds)
- Session key expiration and revocation checked in EIP-7702 middleware
- All validation failures return appropriate HTTP error status

**Authentication:**
- Handled via x402 payment header verification (Phase 1)
- EIP-7702 session key delegation validates transaction authorship (Phase 2)
- No traditional bearer token authentication; payment itself proves authorization

---

*Architecture analysis: 2026-02-24*
