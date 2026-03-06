# @x402guard/cod3x-adapter

Cod3x ToolChain protocol adapter for [x402Guard](https://github.com/x402Guard/x402Guard) -- guarded DeFi payments for autonomous agents.

## Overview

x402Guard is a non-custodial proxy that enforces guardrails (spend limits, contract whitelists, slippage caps) on agent-initiated payments using the [x402 protocol](https://www.x402.org/).

This adapter wraps the `@x402guard/core` SDK with Cod3x-specific convenience methods, enabling Cod3x ToolChain agents to route DeFi payment operations through x402Guard's guardrail layer.

> **Note:** FR-8.3 is SHOULD priority. This adapter demonstrates the integration pattern. Full Cod3x SDK integration may evolve as Cod3x publishes more documentation.

## Prerequisites

- **Node.js** 20+ (22 recommended)
- **Docker** and Docker Compose (for the x402Guard proxy)
- **npm** or **pnpm**

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/x402Guard/x402Guard.git
cd x402Guard

# 2. Start the x402Guard proxy
docker compose up -d

# 3. Install adapter dependencies
cd examples/cod3x
npm install

# 4. Set environment variables
export X402GUARD_PROXY_URL=http://localhost:3402
export X402GUARD_LOG_LEVEL=info

# 5. Run the demo
npx tsx demo/demo.ts
```

## Architecture

```mermaid
graph LR
  A[Cod3x Agent] --> B[X402GuardCod3xAdapter]
  B --> C[X402GuardClient core]
  C --> D[x402Guard Proxy :3402]
  D --> E[Target API]
  D --> F[(PostgreSQL)]
  D --> G[(Redis)]
  A -.-> H[@cod3x/sdk]
  B -.-> H
```

The adapter sits between your Cod3x agent and the x402Guard proxy:

1. **Cod3x Agent** initiates a payment via the adapter
2. **X402GuardCod3xAdapter** wraps the request with Cod3x-specific fields
3. **X402GuardClient** (from `@x402guard/core`) sends the request to the proxy
4. **x402Guard Proxy** validates the payment against registered guardrails
5. If all rules pass, the proxy forwards the payment to the **Target API**

## Integration Patterns

### Pattern 1: Direct Adapter Usage

Use `guardedExecute()` to route individual payment requests through x402Guard.

```typescript
import { X402GuardCod3xAdapter, GuardrailViolationError } from "@x402guard/cod3x-adapter";

const adapter = new X402GuardCod3xAdapter({
  proxyUrl: "http://localhost:3402",
  agentId: "my-agent-uuid",
});

// Register agent and set guardrails
const agent = await adapter.createAgent("my-cod3x-bot", "0xOwnerAddress");
await adapter.createGuardrail(agent.id, {
  type: "MaxSpendPerTx",
  params: { limit: 1_000_000 }, // 1.00 USDC
});

// Execute guarded payment
try {
  const result = await adapter.guardedExecute({
    targetUrl: "https://api.example.com/pay",
    x402Payment: paymentBase64,
    x402Requirements: requirementsBase64,
    agentId: agent.id,
    cod3xSessionId: "session-123", // Optional Cod3x tracking
  });
  // result.guardedBy === "x402guard"
} catch (error) {
  if (error instanceof GuardrailViolationError) {
    console.error(`Blocked: ${error.ruleType} limit=${error.limit} actual=${error.actual}`);
  }
}
```

### Pattern 2: Cod3x SDK Security Worker

Use `toSecurityWorker()` to integrate with the Cod3x SDK's security worker pattern.

```typescript
import { X402GuardCod3xAdapter } from "@x402guard/cod3x-adapter";
// import { CodexSDK } from "@cod3x/sdk";

const adapter = new X402GuardCod3xAdapter({
  proxyUrl: "http://localhost:3402",
  agentId: "my-agent-uuid",
});

// Get Cod3x-compatible security worker config
const workerConfig = adapter.toSecurityWorker();

// Pass to Cod3x SDK constructor
// const sdk = new CodexSDK({
//   ...workerConfig,
//   baseUrl: "https://api.cod3x.com",
// });

// The security worker injects x402Guard agent ID into every request:
// => { headers: { "X-Agent-Id": "my-agent-uuid" } }
```

## Configuration Reference

| Environment Variable | Description | Default |
|---|---|---|
| `X402GUARD_PROXY_URL` | x402Guard proxy URL | (required) |
| `X402GUARD_AGENT_ID` | Agent UUID for automatic injection | (none) |
| `X402GUARD_LOG_LEVEL` | Log level: fatal, error, warn, info, debug, trace, silent | `info` |

### Adapter Constructor Options

```typescript
interface X402GuardCod3xAdapterConfig {
  proxyUrl?: string;    // Falls back to X402GUARD_PROXY_URL
  agentId?: string;     // Falls back to X402GUARD_AGENT_ID
  logLevel?: string;    // Falls back to X402GUARD_LOG_LEVEL
  maxRetries?: number;  // Default: 3
}
```

## API Reference

### `X402GuardCod3xAdapter`

| Method | Description | Returns |
|---|---|---|
| `healthCheck()` | Check proxy reachability | `Promise<boolean>` |
| `guardedExecute(request)` | Route EVM payment through guardrails | `Promise<Cod3xGuardedResponse>` |
| `guardedSolanaExecute(request)` | Route Solana payment through guardrails | `Promise<SolanaProxyResponse>` |
| `createAgent(name, ownerAddress)` | Register a new agent | `Promise<Agent>` |
| `createGuardrail(agentId, ruleType)` | Add a guardrail rule | `Promise<GuardrailRule>` |
| `revokeAllKeys(agentId, ownerAddress)` | Emergency kill-switch | `Promise<void>` |
| `toSecurityWorker()` | Get Cod3x SDK security worker config | `Cod3xSecurityWorkerConfig` |

### Guardrail Rule Types

| Rule Type | Params | Description |
|---|---|---|
| `MaxSpendPerTx` | `{ limit: number }` | Maximum spend per transaction (in token units) |
| `MaxSpendPerDay` | `{ limit: number }` | Maximum daily aggregate spend |
| `AllowedContracts` | `{ addresses: string[] }` | Whitelist of allowed contract addresses |
| `MaxLeverage` | `{ max: number }` | Maximum leverage multiplier |
| `MaxSlippage` | `{ bps: number }` | Maximum slippage in basis points |

## Error Handling

The adapter throws typed errors from `@x402guard/core`:

```typescript
import {
  GuardrailViolationError,
  ProxyUnreachableError,
  RateLimitedError,
  SessionKeyExpiredError,
} from "@x402guard/cod3x-adapter";

try {
  await adapter.guardedExecute(request);
} catch (error) {
  if (error instanceof GuardrailViolationError) {
    // Payment blocked by a guardrail rule
    // error.ruleType: "MaxSpendPerTx" | "MaxSpendPerDay" | ...
    // error.limit: number | string
    // error.actual: number | string
  } else if (error instanceof ProxyUnreachableError) {
    // Proxy is down -- check docker compose
  } else if (error instanceof RateLimitedError) {
    // Too many requests -- error.retryAfter (seconds)
  } else if (error instanceof SessionKeyExpiredError) {
    // Session key has expired
  }
}
```

## Troubleshooting

### Proxy not reachable

```
ProxyUnreachableError: Proxy unreachable at http://localhost:3402
```

**Fix:** Ensure the x402Guard proxy is running:

```bash
docker compose up -d
curl http://localhost:3402/api/v1/health
```

### Guardrail violation

```
GuardrailViolationError: MaxSpendPerTx exceeded: payment 2000000 > limit 1000000
```

**Fix:** Either increase the guardrail limit or reduce the payment amount.

### Missing proxy URL

```
ZodError: proxyUrl must be a valid URL
```

**Fix:** Set the `X402GUARD_PROXY_URL` environment variable or pass `proxyUrl` in the adapter config.

## Development

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Run tests
npm test

# Build
npm run build

# Run demo (requires proxy running)
npm run demo
```

## License

MIT
