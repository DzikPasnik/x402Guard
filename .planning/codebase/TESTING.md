# Testing Patterns

**Analysis Date:** 2026-02-24

## Test Framework

**Runner:**
- Rust built-in `cargo test` command
- No external test framework (using standard `#[test]` and `#[tokio::test]`)
- Config: Tests configured via `Cargo.toml` with tokio runtime support

**Assertion Library:**
- Standard Rust assertions: `assert!()`, `assert_eq!()`, `assert_ne!()`
- Status code assertions: `assert_eq!(response.status(), StatusCode::OK)`

**Run Commands:**
```bash
cargo test                    # Run all tests
cargo test -- --test-threads=1  # Run tests sequentially
cargo test -- --nocapture    # Show println/tracing output
cargo test --release          # Run with optimizations
```

**Dev Dependencies:**
- `tokio-test = "0.4"` - Async test utilities
- No explicit coverage tool configured in `Cargo.toml`

## Test File Organization

**Location:**
- Co-located with source code using `#[cfg(test)]` modules
- Tests appear at the bottom of source files they test

**Naming:**
- Test functions use pattern: `test_<function_name>_<scenario>`
- Example: `test_health_returns_ok`

**Structure:**
```
src/
├── handlers/
│   └── health.rs          # Contains test module at bottom
├── config.rs              # Configuration (no tests present)
└── error.rs               # Error definitions (no tests present)
```

## Test Structure

**Suite Organization (from `src/handlers/health.rs`):**
```rust
#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    use super::*;

    #[tokio::test]
    async fn test_health_returns_ok() {
        // Test implementation
    }
}
```

**Patterns:**
- **Setup:** Create router with test config state
- **Execution:** Send HTTP request using `oneshot()` from Tower's `ServiceExt`
- **Assertion:** Assert on response status code
- **Teardown:** Implicit (no cleanup needed for current tests)

**Detailed Example from `src/handlers/health.rs`:**
```rust
#[tokio::test]
async fn test_health_returns_ok() {
    // Setup: Create router with test configuration
    let app = routes().with_state(crate::config::AppConfig {
        host: "127.0.0.1".parse().unwrap(),
        port: 3402,
        base_sepolia_rpc_url: String::new(),
        base_mainnet_rpc_url: String::new(),
        database_url: String::new(),
        redis_url: String::new(),
    });

    // Execution: Send request
    let response = app
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    // Assertion: Verify status
    assert_eq!(response.status(), StatusCode::OK);
}
```

## Async Testing

**Framework:** `#[tokio::test]` macro for async test functions

**Pattern:**
```rust
#[tokio::test]
async fn test_async_operation() {
    let result = some_async_function().await;
    assert_eq!(result, expected);
}
```

**Tower/Axum Testing:**
- Use `ServiceExt::oneshot()` to execute router in tests
- Build Request objects with `Request::builder().uri(...).body(...)`
- Extract Body with `Body::empty()` for no payload

**Example Setup:**
```rust
let app = routes().with_state(config);
let response = app
    .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
    .await
    .unwrap();
```

## Error Testing

**Pattern:**
No explicit error testing implemented yet. When added, follow these guidelines:

- Test error paths by creating request conditions that trigger errors
- Assert on HTTP status codes returned by error handlers
- Verify error response JSON structure contains `error` and `code` fields

**Example structure for future error tests:**
```rust
#[tokio::test]
async fn test_bad_request_returns_400() {
    let app = routes().with_state(test_config());

    let response = app
        .oneshot(Request::builder()
            .uri("/endpoint")
            .method("POST")
            .body(Body::from("invalid json"))
            .unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
```

## Mocking

**Framework:** Not explicitly used in current tests

**When Mocking is Needed:**
- Mock external services (RPC endpoints, Redis, database connections)
- Mock HTTP responses from upstream services
- Create fake configuration for testing

**Crate Recommendations (not yet added):**
- `mockito` for HTTP mocking
- `tokio-util` for async testing utilities
- `wiremock` for HTTP mock servers

**What to Mock:**
- External API calls (RPC endpoints)
- Database connections
- Redis operations
- HTTP requests to upstream services

**What NOT to Mock:**
- Internal business logic (guardrails, validation)
- Handler functions (test via actual HTTP requests)
- Serialization/deserialization logic

## Fixtures and Factories

**Test Data:**
Current approach: Inline test configuration creation

**Example from `src/handlers/health.rs`:**
```rust
let app = routes().with_state(crate::config::AppConfig {
    host: "127.0.0.1".parse().unwrap(),
    port: 3402,
    base_sepolia_rpc_url: String::new(),
    base_mainnet_rpc_url: String::new(),
    database_url: String::new(),
    redis_url: String::new(),
});
```

**Recommended Future Pattern:**
Create helper function or factory for test config:
```rust
fn test_config() -> AppConfig {
    AppConfig {
        host: "127.0.0.1".parse().unwrap(),
        port: 3402,
        base_sepolia_rpc_url: "http://localhost:8545".into(),
        base_mainnet_rpc_url: "http://localhost:8546".into(),
        database_url: "sqlite:///:memory:".into(),
        redis_url: "redis://localhost:6379".into(),
    }
}
```

**Location:**
- Keep test utilities in the same `#[cfg(test)]` module as tests
- For shared fixtures across multiple test files, create `tests/` directory

## Coverage

**Requirements:** Not explicitly enforced in configuration

**Recommended Approach:**
```bash
cargo tarpaulin --out Html --output-dir coverage
```

**Target:** Aim for 80%+ coverage on critical paths (authentication, guardrails, error handling)

## Test Types

**Unit Tests:**
- Scope: Individual functions and types
- Approach: Test in isolation using `#[test]` or `#[tokio::test]`
- Current example: Health check endpoint returns correct status

**Integration Tests:**
- Scope: Full HTTP request/response cycle, middleware chains
- Approach: Use `ServiceExt` from Tower, send full requests through router
- Current example: `test_health_returns_ok` tests health endpoint integration

**E2E Tests:**
- Framework: Not currently implemented
- Recommended: Use `tokio::test` with containerized services (Docker) or test harness that spawns server
- Example scope: Full proxy request flow with guardrails, session keys, and RPC calls

**Future E2E Pattern:**
```rust
#[tokio::test]
async fn test_full_proxy_request_flow() {
    // Start test server
    let config = test_config();
    let app = create_router(config);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    // Spawn server
    tokio::spawn(async move {
        axum::serve(listener, app).await
    });

    // Make request
    let client = reqwest::Client::new();
    let response = client
        .post(format!("http://{}/api/v1/proxy", addr))
        .json(&proxy_request)
        .send()
        .await
        .unwrap();

    // Assert
    assert_eq!(response.status(), StatusCode::OK);
}
```

## Current Test Coverage

**Files with Tests:**
- `src/handlers/health.rs` - 1 test function

**Files without Tests:**
- `src/handlers/proxy.rs` - Needs tests for proxy request handling
- `src/config.rs` - Needs tests for configuration loading
- `src/error.rs` - Needs tests for error response formatting
- `src/router.rs` - Needs tests for router setup
- `src/middleware/*` - Placeholders, no implementation yet
- `src/models/*` - Data structures, may need validation tests

**Gaps:**
- No proxy request forwarding tests (Phase 1 feature)
- No guardrail enforcement tests (Phase 2 feature)
- No session key validation tests (Phase 2 feature)
- No rate limiting tests (Not yet implemented)
- No error handling tests
- No middleware tests

## Testing Best Practices

**Before Adding Tests:**
1. Run `cargo test` to verify tests build and pass
2. Verify async operations use `#[tokio::test]` not `#[test]`
3. Use `assert_eq!()` for clear assertion messages

**Test Isolation:**
- Each test should be independent
- Use `tokio::test` to get isolated runtime per test
- Avoid shared state in tests

**Running Tests:**
```bash
# Run all tests
cargo test

# Run specific test file
cargo test --lib handlers::health

# Run with output
cargo test -- --nocapture

# Run single test
cargo test test_health_returns_ok
```

---

*Testing analysis: 2026-02-24*
