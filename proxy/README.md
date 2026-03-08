# x402Guard Proxy

Rust/Axum reverse proxy that intercepts HTTP 402 payment flows and enforces configurable safety guardrails before forwarding requests to target services.

## Architecture

```
proxy/src/
├── main.rs              # Entry point, server bootstrap
├── config.rs            # Environment-based configuration
├── router.rs            # Axum route definitions
├── state.rs             # Shared application state (PgPool, Redis, config)
├── error.rs             # Unified error types
├── handlers/
│   ├── health.rs        # GET /api/v1/health
│   ├── proxy.rs         # POST /api/v1/proxy — main x402 payment flow
│   ├── agents.rs        # CRUD for agent registration
│   ├── guardrail_rules.rs  # CRUD for guardrail rules
│   ├── session_keys.rs  # CRUD + revocation for EIP-7702 session keys
│   └── solana_vault.rs  # Solana vault operations
├── middleware/
│   ├── x402/            # EIP-3009 TransferWithAuthorization verification
│   ├── guardrails.rs    # Rule engine (MaxSpendPerTx, MaxSpendPerDay, etc.)
│   ├── eip7702.rs       # EIP-7702 session key verification
│   ├── nonce.rs         # Redis-backed replay prevention
│   ├── rate_limit.rs    # Sliding window rate limiter
│   └── api_key.rs       # Management API key authentication (fail-closed)
├── models/              # Domain types (Agent, GuardrailRule, SessionKey, AuditEvent)
├── repo/                # PostgreSQL repositories (agents, guardrails, session_keys, spend_ledger, audit_log)
└── services/            # Business logic (audit_writer, revocation, solana_rpc)
```

## Building

All Rust builds run in Docker (no local toolchain required):

```bash
# From repo root
MSYS_NO_PATHCONV=1 docker run --rm -m 4g \
  -v "$(pwd):/app" -w /app rust:1.85-slim \
  bash -c "apt-get update -qq && apt-get install -y -qq pkg-config libssl-dev > /dev/null 2>&1 && cargo test 2>&1"
```

## Testing

106 unit tests covering:
- EIP-3009 signature verification
- All 5 guardrail rule types (positive + negative cases)
- Atomic daily spend tracking (TOCTOU prevention)
- EIP-7702 session key lifecycle
- Nonce replay prevention
- Rate limiting
- API key authentication (fail-closed)
- Audit log immutability

## API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/proxy` | Route x402 payment through guardrails |

### Management (requires `MANAGEMENT_API_KEY`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/agents` | Register agent |
| GET | `/api/v1/agents/:id` | Get agent |
| POST | `/api/v1/agents/:id/rules` | Create guardrail rule |
| GET | `/api/v1/agents/:id/rules` | List rules |
| PUT | `/api/v1/agents/:id/rules/:rid` | Update rule |
| DELETE | `/api/v1/agents/:id/rules/:rid` | Deactivate rule |
| POST | `/api/v1/agents/:id/session-keys` | Create session key |
| GET | `/api/v1/agents/:id/session-keys` | List session keys |
| DELETE | `/api/v1/agents/:id/session-keys/:kid` | Revoke session key |
| POST | `/api/v1/agents/:id/revoke-all` | Emergency revoke all |

## Configuration

See [../.env.example](../.env.example) for all environment variables. Key settings:

| Variable | Required | Default |
|----------|----------|---------|
| `DATABASE_URL` | yes | — |
| `UPSTASH_REDIS_URL` | yes | — |
| `MANAGEMENT_API_KEY` | yes | — |
| `PROXY_PORT` | no | `3402` |
| `RATE_LIMIT_RPS` | no | `1000` |
| `BASE_SEPOLIA_RPC_URL` | no | `https://sepolia.base.org` |
