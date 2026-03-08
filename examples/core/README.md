# @x402guard/core

TypeScript SDK for x402Guard proxy — types, HTTP client, errors, retry.

## Installation

```bash
npm install @x402guard/core
```

Requires Node.js 22+.

## Quick Start

```typescript
import {
  X402GuardClient,
  GuardrailViolationError,
  ProxyUnreachableError,
} from "@x402guard/core";

const client = new X402GuardClient({
  proxyUrl: "http://localhost:3001",
  agentId: "my-agent-uuid",
});

// Check proxy connectivity
const alive = await client.healthCheck();

// Register an agent
const agent = await client.createAgent({
  name: "trading-bot",
  owner_address: "0xYourEoaAddress",
});

// Add a guardrail rule — cap each payment at 1 USDC (6 decimals)
await client.createRule(agent.id, {
  rule_type: {
    type: "MaxSpendPerTx",
    params: { limit: 1_000_000 },
  },
});

// Route a payment through the proxy
try {
  const result = await client.proxyPayment({
    targetUrl: "https://api.example.com/service",
    x402Payment: "<signed-payment-header>",
    x402Requirements: "<requirements-header>",
    agentId: agent.id,
  });
  console.log("tx:", result.txHash);
} catch (err) {
  if (err instanceof GuardrailViolationError) {
    // ruleType, limit, actual are parsed from the proxy response
    console.error(`Blocked by ${err.ruleType}: actual=${err.actual} limit=${err.limit}`);
  } else if (err instanceof ProxyUnreachableError) {
    console.error("Proxy is down");
  }
}
```

## API Reference

### X402GuardClient

All methods are async and return typed values.

| Method | Signature | Description |
|--------|-----------|-------------|
| `healthCheck` | `() => Promise<boolean>` | Returns true if proxy returns 200 on GET /health |
| `createAgent` | `(req: CreateAgentRequest) => Promise<Agent>` | Register a new agent |
| `getAgent` | `(id: string) => Promise<Agent>` | Fetch an agent by ID |
| `createRule` | `(agentId, rule: CreateRuleRequest) => Promise<GuardrailRule>` | Add a guardrail rule |
| `listRules` | `(agentId: string) => Promise<readonly GuardrailRule[]>` | List rules for an agent |
| `createSessionKey` | `(agentId, req: CreateSessionKeyRequest) => Promise<SessionKey>` | Issue a session key (EIP-7702) |
| `listSessionKeys` | `(agentId: string) => Promise<readonly SessionKey[]>` | List session keys |
| `getSessionKey` | `(agentId, keyId: string) => Promise<SessionKey>` | Fetch a single session key |
| `revokeSessionKey` | `(agentId, keyId: string) => Promise<void>` | Revoke a session key |
| `revokeAll` | `(agentId, req: RevokeAllRequest) => Promise<RevokeAllResponse>` | Revoke all keys and deactivate agent |
| `proxyPayment` | `(req: ProxyRequest) => Promise<ProxyResponse>` | Route an EVM x402 payment |
| `proxySolanaPayment` | `(req: SolanaProxyRequest) => Promise<SolanaProxyResponse>` | Route a Solana x402 payment |

### Errors

| Class | HTTP status | When thrown |
|-------|-------------|-------------|
| `X402GuardError` | any | Base class for all SDK errors |
| `GuardrailViolationError` | 403 | A guardrail rule blocked the payment. Has `ruleType`, `limit`, `actual` fields. |
| `ProxyUnreachableError` | — | Network failure reaching the proxy |
| `RateLimitedError` | 429 | Too many requests. Has `retryAfter` (seconds). |
| `SessionKeyExpiredError` | 403 | The referenced session key has expired |

### Types (main exports)

| Type | Description |
|------|-------------|
| `Agent` | Registered agent record |
| `GuardrailRule` | A single guardrail rule with discriminated `RuleType` |
| `RuleType` | Union: `MaxSpendPerTx`, `MaxSpendPerDay`, `AllowedContracts`, `MaxLeverage`, `MaxSlippage` |
| `SessionKey` | EIP-7702 session key record |
| `ProxyRequest` / `ProxyResponse` | EVM payment proxy payload |
| `SolanaProxyRequest` / `SolanaProxyResponse` | Solana payment proxy payload |
| `X402GuardConfig` | Client configuration (validated via Zod) |
| `ApiResponse<T>` / `ApiListResponse<T>` | Response envelope types |

### Utilities

| Export | Description |
|--------|-------------|
| `fetchWithRetry` | Fetch wrapper with exponential back-off on 429/network errors |
| `createLogger` | Create a pino logger scoped to a component name |
| `x402GuardConfigSchema` | Zod schema for `X402GuardConfig` |

## Configuration

The client accepts a partial `X402GuardConfig` object. Missing fields fall back to environment variables:

| Option | Env var | Default | Description |
|--------|---------|---------|-------------|
| `proxyUrl` | `X402GUARD_PROXY_URL` | required | Base URL of the x402Guard proxy |
| `agentId` | `X402GUARD_AGENT_ID` | — | Default agent ID for requests |
| `logLevel` | — | `"info"` | Pino log level |
| `maxRetries` | — | `3` | Retry attempts on 429/network errors |
| `retryBaseMs` | — | `1000` | Base delay (ms) for exponential back-off |

```typescript
// Via constructor options
const client = new X402GuardClient({ proxyUrl: "http://localhost:3001" });

// Via environment variables
// X402GUARD_PROXY_URL=http://localhost:3001
const client = new X402GuardClient();
```

## Development

```bash
npm install
npm test          # vitest (unit tests)
npm run typecheck # tsc --noEmit
npm run build     # tsup -> dist/
```

## License

MIT
