# Coding Conventions

**Analysis Date:** 2026-02-24

## Naming Patterns

**Files:**
- Snake case: `guardrail.rs`, `session_key.rs`, `eip7702.rs`
- Module files use `mod.rs` for file organization (e.g., `src/handlers/mod.rs`, `src/middleware/mod.rs`)
- Single responsibility per file (e.g., `guardrail.rs` contains guardrail models only)

**Functions:**
- Snake case for all functions: `from_env()`, `forward_request()`, `health_check()`
- Public handler functions are async and use clear action verbs: `forward_request()`, `health_check()`
- Private helper functions when needed

**Variables:**
- Snake case throughout: `target_url`, `base_sepolia_rpc_url`, `database_url`, `session_key_id`
- Descriptive names: `max_spend`, `allowed_contracts`, `is_revoked`, `expires_at`
- Boolean fields prefixed with `is_` or use full word: `is_active`, `is_revoked`

**Types:**
- Struct names use PascalCase: `AppConfig`, `ProxyRequest`, `ProxyResponse`, `GuardrailRule`, `SessionKey`, `Agent`, `HealthResponse`, `ErrorBody`
- Enum names use PascalCase: `RuleType`, `AppError`
- Enum variants use PascalCase: `BadRequest`, `Unauthorized`, `MaxSpendPerTx`, `AllowedContracts`

## Code Style

**Formatting:**
- Enforced by `rustfmt` (Rust's standard formatter)
- All code follows standard Rust formatting conventions
- Edition: `2021` (specified in `Cargo.toml`)

**Linting:**
- Implicit enforcement via Rust compiler
- Uses standard Rust clippy linting rules (not explicitly configured)
- No custom linting configuration files detected

## Import Organization

**Order:**
1. Standard library imports (e.g., `use std::net::SocketAddr`)
2. External crate imports (e.g., `use axum::...`, `use serde::...`, `use tokio::...`)
3. Internal crate imports (e.g., `use crate::config::AppConfig`, `use crate::error::AppError`)

**Path Aliases:**
- Crate-relative imports: `use crate::{handlers, middleware, models, router, config, error}`
- Module-relative imports in nested modules
- No path aliases configured; uses standard Rust module system

**Example from `src/router.rs`:**
```rust
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::config::AppConfig;
use crate::handlers;
```

## Error Handling

**Patterns:**
- Unified error type `AppError` defined in `src/error.rs` implementing `thiserror::Error`
- All HTTP handlers return `Result<Json<T>, AppError>`
- `AppError` implements `IntoResponse` for automatic HTTP error conversion
- Uses context wrapping with `anyhow::Context` trait for detailed error messages

**Error Variants:**
```rust
pub enum AppError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    RateLimited,
    GuardrailViolation(String),
    Internal(#[from] anyhow::Error),
}
```

**Example from `src/main.rs`:**
```rust
let config = config::AppConfig::from_env().context("failed to load configuration")?;
let listener = TcpListener::bind(addr)
    .await
    .context("failed to bind TCP listener")?;
```

**Error Response Format:**
```json
{
  "error": "error message here",
  "code": 400
}
```

## Logging

**Framework:** `tracing` with `tracing-subscriber`

**Configuration (from `src/main.rs`):**
- Initialized with `EnvFilter` for environment-based control
- JSON structured logging enabled: `.json()`
- Target metadata included: `.with_target(true)`
- Controlled by `RUST_LOG` environment variable

**Patterns:**
- Use `tracing::info!()`, `tracing::warn!()`, `tracing::error!()` for structured logging
- Include relevant context: `tracing::info!(target_url = %req.target_url, "proxy request received")`
- Use `%` for Display trait values, bare identifiers for Debug
- Do NOT use `println!()` or `eprintln!()` (none found in codebase)

## Comments

**When to Comment:**
- Module-level documentation comments (`//!`) for middleware and feature descriptions
- Inline comments for non-obvious logic or RuleType variants explaining business rules

**JSDoc/Rust Doc:**
- Use `///` for documenting public items (structs, functions, fields)
- Include purpose and notable constraints

**Example from `src/error.rs`:**
```rust
/// Unified error type for the proxy.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
```

**Example from `src/models/guardrail.rs`:**
```rust
/// A guardrail rule attached to an agent or session key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardrailRule {
```

## Function Design

**Size:** Functions are concise and focused, typically 10-50 lines max

**Parameters:**
- Use structured types for request/response: `Json<ProxyRequest>` extractor pattern
- Leverage Axum extractors: `Json(req): Json<ProxyRequest>`

**Return Values:**
- Async handlers return `Result<Json<T>, AppError>` or `impl IntoResponse`
- Use `Option<T>` for nullable values: `pub tx_hash: Option<String>`
- Configuration builders use `anyhow::Result<Self>` for fallible initialization

**Example from `src/handlers/proxy.rs`:**
```rust
async fn forward_request(
    Json(req): Json<ProxyRequest>,
) -> Result<Json<ProxyResponse>, AppError> {
    tracing::info!(target_url = %req.target_url, "proxy request received");
    Ok(Json(ProxyResponse {
        success: true,
        tx_hash: None,
        message: "proxy endpoint stub – implementation coming in phase 1".into(),
    }))
}
```

## Module Design

**Exports:**
- Each module explicitly declares public items with `pub`
- Clear public API surface defined at module level
- Related types grouped logically: handlers, middleware, models

**Barrel Files:**
- `src/handlers/mod.rs` aggregates handler routes
- `src/middleware/mod.rs` declares middleware modules
- `src/models/mod.rs` for data models
- Minimal re-exports; consumers typically use `crate::handlers::proxy` style imports

**Example from `src/main.rs` module declarations:**
```rust
mod config;
mod error;
mod handlers;
mod middleware;
mod models;
mod router;
```

## Derive Macros

**Common Derives:**
- `#[derive(Debug, Clone)]` on data structures for debugging
- `#[derive(Debug, thiserror::Error)]` for error types
- `#[derive(Serialize, Deserialize)]` from serde for JSON serialization
- Models use full derive chain: `#[derive(Debug, Clone, Serialize, Deserialize)]`

**Example:**
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardrailRule {
    pub id: Uuid,
    pub agent_id: Uuid,
    // ...
}
```

## Async/Await Patterns

**Async Runtime:**
- `#[tokio::main]` macro for application entry point
- `#[tokio::test]` for async test functions
- All I/O operations (network, database) are async

**Pattern:**
```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // async operations with ? operator
}

#[tokio::test]
async fn test_health_returns_ok() {
    // async test logic
}
```

---

*Convention analysis: 2026-02-24*
