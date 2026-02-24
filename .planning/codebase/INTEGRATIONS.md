# External Integrations

**Analysis Date:** 2026-02-24

## APIs & External Services

**Blockchain RPC Nodes:**
- Base Sepolia - Testnet EVM blockchain
  - SDK/Client: Alloy (v0.12)
  - Config: BASE_SEPOLIA_RPC_URL (default: https://sepolia.base.org)
  - Usage: Test environment for x402 and EIP-7702 transactions

- Base Mainnet - Production EVM blockchain
  - SDK/Client: Alloy (v0.12)
  - Config: BASE_MAINNET_RPC_URL (default: https://mainnet.base.org)
  - Usage: Production payment processing via x402 protocol

- Solana RPC (Configured but unused in proxy)
  - Config: SOLANA_RPC_URL (default: https://api.devnet.solana.com)
  - Status: Present in .env.example but not referenced in current codebase

**Payment Protocol:**
- x402 Payment Protocol - Non-custodial payment standard
  - Integration point: `proxy/src/handlers/proxy.rs` (ProxyRequest struct)
  - Request structure: x402_payment JSON payload with target_url
  - Status: Stub implementation - Phase 1 work item
  - Verification middleware: `proxy/src/middleware/x402.rs` (not yet implemented)

## Data Storage

**Databases:**
- PostgreSQL - Relational database for persistence
  - Connection: DATABASE_URL env var
  - Client: Via Alloy + potential tokio-postgres dependency (not yet added)
  - Current usage: Configured but not actively used in proxy codebase
  - Data structures expected: Agents, guardrails, session keys (defined in models)

**Caching:**
- Redis/Upstash - Cache and session storage
  - Connection: UPSTASH_REDIS_URL env var (default: redis://localhost:6379)
  - Client: Not yet integrated in current codebase
  - Expected usage: Rate limiting state, session key revocation lists
  - Middleware stub: `proxy/src/middleware/rate_limit.rs` (not yet implemented)

**File Storage:**
- Not applicable - Stateless proxy service

## Authentication & Identity

**Auth Provider:**
- Supabase - Backend authentication and database
  - Anon Key: SUPABASE_ANON_KEY env var
  - Service Role Key: SUPABASE_SERVICE_ROLE_KEY env var
  - URL: SUPABASE_URL env var
  - Implementation: Not yet integrated in proxy (expected in later phases)

**Session Key Auth:**
- EIP-7702 Session Keys - Delegated authority for agents
  - Implementation: Models defined in `proxy/src/models/session_key.rs`
  - Verification middleware: `proxy/src/middleware/eip7702.rs` (not yet implemented)
  - Features: Time-based expiration, spend limits, contract whitelist, revocation tracking
  - Storage: PostgreSQL (via SessionKey model)

**Agent Authorization:**
- Agent-based access control
  - Model: `proxy/src/models/agent.rs`
  - Relationship: Agents own session keys and guardrail rules
  - Verification: Not yet implemented

## Monitoring & Observability

**Error Tracking:**
- Not configured - Application logs all errors via AppError enum
  - Error types: BadRequest, Unauthorized, Forbidden, NotFound, RateLimited, GuardrailViolation, Internal
  - Location: `proxy/src/error.rs`

**Logs:**
- Structured JSON logging via Tracing + Tracing-Subscriber
  - Output format: JSON with target information
  - Configuration: RUST_LOG env var controls log levels
  - Log points: Server startup, request routing, middleware processing
  - Approach: Application logs to stdout; external systems (cloud providers) consume via standard streams

**Tracing:**
- Tower-HTTP TraceLayer for HTTP request/response tracking
  - Location: `proxy/src/router.rs`
  - Captures: HTTP method, path, status codes, latencies

## CI/CD & Deployment

**Hosting:**
- Not specified - Infrastructure agnostic
- Designed for containerized deployment (Docker-compatible)
- TCP listener on configurable host:port

**CI Pipeline:**
- Not detected in codebase
- Cargo-based testing infrastructure available
- Build command: `cargo build` (workspace)

## Environment Configuration

**Required env vars:**
```
PROXY_HOST=0.0.0.0
PROXY_PORT=3402
RUST_LOG=info,x402_guard_proxy=debug
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_MAINNET_RPC_URL=https://mainnet.base.org
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
UPSTASH_REDIS_URL=redis://localhost:6379
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Optional env vars:**
```
UPSTASH_REDIS_TOKEN=  (currently unused)
SOLANA_RPC_URL=https://api.devnet.solana.com  (configured but unused)
```

**Secrets location:**
- Environment variables via .env file (local)
- Docker secrets or cloud provider secret management (production)
- `.env` file excluded from git (see .gitignore)

## Webhooks & Callbacks

**Incoming:**
- POST /api/v1/proxy - Proxy request endpoint
  - Request: ProxyRequest (target_url, x402_payment, session_key_id)
  - Response: ProxyResponse (success, tx_hash, message)
  - Location: `proxy/src/handlers/proxy.rs`
  - Status: Stub implementation

**Outgoing:**
- Target URL forwarding (not yet implemented)
  - Purpose: Forward validated x402 payment requests to external services
  - Mechanism: Will use Reqwest HTTP client
  - Status: Phase 1 implementation

**Health Check:**
- GET /api/v1/health - Server health endpoint
  - Location: `proxy/src/handlers/health.rs`
  - Status: Likely basic liveness probe

## Guardrails System

**Guardrail Enforcement:**
- Rules system defined in `proxy/src/models/guardrail.rs`
- Rule types supported (not yet enforced):
  - MaxSpendPerTx - Single transaction limit
  - MaxSpendPerDay - 24-hour rolling window limit
  - AllowedContracts - Contract whitelist
  - MaxLeverage - Leverage multiplier cap
  - MaxSlippage - Slippage tolerance in basis points
- Verification middleware: `proxy/src/middleware/guardrails.rs` (not yet implemented)
- Database storage: Rules attached to agents and session keys

---

*Integration audit: 2026-02-24*
