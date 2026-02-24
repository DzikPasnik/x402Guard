# Technology Stack

**Analysis Date:** 2026-02-24

## Languages

**Primary:**
- Rust 2021 Edition - Core proxy service and all backend logic

## Runtime

**Environment:**
- Tokio async runtime (v1) - Handles async execution and concurrency

**Build System:**
- Cargo - Package manager and build tool
- Workspace configuration with multiple members (`proxy`)

## Frameworks

**Core:**
- Axum (v0.8) - Web framework for HTTP routing and request handling
  - Features: macros for route definitions
  - Location: `proxy/src/router.rs`, `proxy/src/handlers/`

**HTTP & Networking:**
- Tower (v0.5) - Middleware and service composition framework
- Tower-HTTP (v0.6) - HTTP-specific middleware
  - Features: CORS layer, request tracing, request-id generation
  - Used in: `proxy/src/router.rs`

**Logging & Tracing:**
- Tracing (v0.1) - Structured logging and diagnostics
- Tracing-Subscriber (v0.3) - Log subscriber with JSON output
  - Features: env-filter for log level control, JSON formatting
  - Configuration: `RUST_LOG` env var
  - Entry point: `proxy/src/main.rs`

**Testing:**
- Tokio-test (v0.4) - Utilities for testing async code

## Key Dependencies

**Critical:**
- Alloy (v0.12) - Ethereum/EVM interaction library with full features
  - Purpose: EIP-7702 session key handling, blockchain integration
  - Used for: Session key verification, RPC interactions

- Reqwest (v0.12) - Async HTTP client
  - Features: JSON support, rustls-tls (non-default TLS)
  - Purpose: External API calls and blockchain RPC requests

**Serialization:**
- Serde (v1) - Serialization/deserialization framework
  - Features: derive macros
  - Used throughout for JSON marshaling

- Serde_json (v1) - JSON serialization

**Time & Utilities:**
- Chrono (v0.4) - Date/time handling with serde support
  - Used in: Session key expiration tracking (`proxy/src/models/session_key.rs`)

- UUID (v1) - UUID generation and serialization
  - Features: v4 generation, serde support
  - Used in: Agent and guardrail IDs

**Error Handling:**
- Thiserror (v2) - Error type derivation macros
  - Used in: `proxy/src/error.rs` for AppError enum

- Anyhow (v1) - Flexible error handling
  - Used for: Context wrapping and error propagation in main

**Configuration:**
- Dotenvy (v0.15) - .env file loading
  - Usage: `proxy/src/main.rs` - loads environment variables at startup

## Configuration

**Environment:**
- Configuration via environment variables loaded through `dotenvy`
- Structure defined in `proxy/src/config.rs` (AppConfig struct)
- Fallback defaults for local development:
  - PROXY_HOST: 0.0.0.0
  - PROXY_PORT: 3402
  - BASE_SEPOLIA_RPC_URL: https://sepolia.base.org
  - BASE_MAINNET_RPC_URL: https://mainnet.base.org
  - DATABASE_URL: postgresql://postgres:postgres@localhost:54322/postgres
  - UPSTASH_REDIS_URL: redis://localhost:6379

**Key Configs Required:**
- PROXY_HOST, PROXY_PORT - Server binding configuration
- BASE_SEPOLIA_RPC_URL, BASE_MAINNET_RPC_URL - Blockchain RPC endpoints
- DATABASE_URL - PostgreSQL connection string
- UPSTASH_REDIS_URL - Redis/Upstash connection
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY - Backend services
- RUST_LOG - Logging configuration

**Build:**
- Cargo.lock present (deterministic builds)
- Workspace dependencies defined in root `Cargo.toml`

## Platform Requirements

**Development:**
- Rust toolchain (1.70+)
- Cargo for building and testing

**Production:**
- Linux-compatible environment (cloud deployment target)
- TCP listener on configured host:port
- PostgreSQL database connectivity
- Redis/Upstash connectivity
- Blockchain RPC endpoints for Base (Sepolia & Mainnet)
- Supabase backend services

**Deployment Target:**
- Container-ready (no platform-specific code)
- Environment variable configuration
- TCP-based networking

---

*Stack analysis: 2026-02-24*
