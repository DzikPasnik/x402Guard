# Phase 5: Integration Examples - Research

**Researched:** 2026-03-02
**Domain:** TypeScript SDK authoring (ElizaOS plugin, Cod3x adapter) + Python SDK authoring (Virtuals GAME plugin) + x402Guard proxy API integration
**Confidence:** MEDIUM (ElizaOS/GAME interfaces verified via official docs; Cod3x adapter pattern inferred from limited public SDK docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Plugin Interface Design**
- Typed SDK with helpers: exported types, helper functions (`createGuardrail`, `revokeKeys`), typed error classes
- Configuration: constructor args take priority, missing values fall back to env vars (`X402GUARD_PROXY_URL`, `X402GUARD_AGENT_ID`, etc.)
- Python plugin (Virtuals): Pythonic with frozen dataclasses for types, context managers for client lifecycle, full type hints
- TypeScript plugins (ElizaOS, Cod3x): whether to share a common core package is Claude's discretion

**Demo Script Scope**
- Demos connect to real running proxy (`docker compose up` required)
- Full flow demo: register agent -> set guardrail rules -> make guarded payment -> trigger guardrail violation
- Off-chain only: proxy validates signatures and guardrails without broadcasting to testnet (no testnet ETH needed)
- Both chains: demos show Base (EVM) x402 flow AND Solana vault flow

**Example Depth & Polish**
- Polished SDK quality: proper `package.json`/`pyproject.toml`, exports, JSDoc/docstrings, ready to publish
- Subdirectories in this repo: `examples/elizaos/`, `examples/virtuals/`, `examples/cod3x/`
- Comprehensive READMEs: prerequisites, step-by-step setup, config reference, API docs, architecture diagram (mermaid), troubleshooting
- Automated tests: unit tests for SDK functions + integration tests against running proxy, CI runs them

**Error Handling & DX**
- Typed exception hierarchy: `GuardrailViolationError` with `rule_type`, `limit`, `actual` values; language-specific subtypes per violation
- Built-in retry with exponential backoff: auto-retry on 429 (uses `Retry-After` header) and network errors, configurable max retries
- Structured logging: DEBUG/INFO/WARN/ERROR levels. TS: pino or debug. Python: stdlib logging. Configurable verbosity. No console.log/print
- Connection check + helpful errors: `client.healthCheck()` on init, clear actionable messages like "Proxy unreachable at http://... -- is docker compose up running?"

### Claude's Discretion
- Whether ElizaOS and Cod3x share a `@x402guard/core` TypeScript package or are fully independent
- Exact logging library choice per framework
- Internal SDK architecture (class-based vs functional)
- Test framework choice per example (vitest/jest for TS, pytest for Python)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FR-8.1 | ElizaOS plugin example (`@elizaos/plugin-x402guard`) | ElizaOS Plugin/Action/Provider interfaces verified via official docs; WalletProvider wrapping pattern confirmed |
| FR-8.2 | Virtuals Protocol GAME plugin example | GameFunction/GameWorker/Agent constructor signatures verified from GitHub example; game_sdk pip package confirmed |
| FR-8.3 | Cod3x adapter example | Cod3x ToolChain-SDK confirmed as `@cod3x/sdk`; protocol adapter pattern defined via security worker pattern and `@cod3x/ethers` |
| FR-8.4 | Each example includes README with setup instructions | README structure and mermaid diagram conventions researched |
</phase_requirements>

---

## Summary

This phase builds three polished SDK integration examples that wrap the x402Guard proxy API. The core technical challenge is translating x402Guard's REST API (Rust proxy at port 3402) into idiomatic TypeScript and Python SDK layers that fit each framework's conventions.

The x402Guard proxy already exposes all required endpoints: agent CRUD, guardrail CRUD, session key CRUD, revoke-all, EVM proxy (`POST /api/v1/proxy`), Solana proxy (`POST /api/v1/proxy/solana`), and vault status. The SDK layer is a thin client wrapper over these endpoints — it handles authentication header prep, base64url encoding/decoding of x402 payment payloads, typed error classes, retry logic, and structured logging. No crypto signing happens in the SDK (the proxy is non-custodial and only verifies signatures the agent wallet already produced).

The ElizaOS plugin is the most complex because it must conform to the `@elizaos/core` Plugin/Action/Provider interfaces (verified from official docs). The GAME Python plugin is structurally simpler — it wraps proxy calls as `GameFunction` executables registered in a `WorkerConfig`. The Cod3x adapter follows a TypeScript protocol adapter pattern over the `@cod3x/sdk` ethers provider pattern.

**Primary recommendation:** Build a shared `@x402guard/core` TypeScript package (Claude's discretion) consumed by both ElizaOS and Cod3x. This avoids duplicating the HTTP client, retry logic, error hierarchy, and type definitions across two packages. The Python Virtuals plugin is fully independent (different language).

---

## Standard Stack

### TypeScript (ElizaOS + Cod3x + optional core)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@elizaos/core` | latest | ElizaOS Plugin/Action/Provider interfaces | Required by ElizaOS framework |
| `pino` | 10.x | Structured JSON logging | Fast, ESM-native, configurable levels; fits TS SDK pattern |
| `tsup` | 8.x | Build tool (wraps esbuild) | Standard for TypeScript SDK publishing; produces CJS+ESM dual output |
| `typescript` | 5.x | Type checking | Project-wide standard |
| `vitest` | 3.x | Unit + integration tests | Configured in root conventions; faster than jest, native ESM |
| `@types/node` | 22.x | Node type definitions | Required for fetch, Buffer, etc. |
| `zod` | 3.x | Input validation (SDK config parsing) | Project standard (ts-coding-style.md) |

### Python (Virtuals GAME plugin)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `game_sdk` | latest | Virtuals GAME framework base | Required; `pip install game_sdk` |
| `httpx` | 0.28.x | Async HTTP client | Modern async-first, better than requests for SDK use |
| `pytest` | 8.x | Test framework | Project standard (py-testing.md) |
| `pytest-asyncio` | 0.24.x | Async test support | Required for httpx async client tests |
| `pytest-httpx` | 0.35.x | Mock HTTPX requests in tests | Best practice for HTTP API mocking with httpx |
| `hatchling` | 1.x | Build backend for pyproject.toml | Modern standard, simpler than setuptools |
| `mypy` | 1.x | Type checking | Project standard (py-hooks.md) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@cod3x/sdk` | latest | Cod3x ToolChain ethers provider | Only in Cod3x adapter |
| `@cod3x/ethers` | latest | Ethers.js provider/signer from Cod3x | Only in Cod3x adapter; bridges Cod3x to ethers |
| `viem` | 2.x | EIP-712 signing in TS demos | For demo scripts that need to construct signed EIP-3009 payloads |
| `dataclasses` | stdlib | Frozen dataclasses for Python types | Standard pattern (py-coding-style.md) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pino` | `debug` package | `debug` is lighter but not structured JSON; pino better for SDK with configurable levels |
| `vitest` | `jest` | vitest is faster, native ESM; jest requires more config for ESM |
| `httpx` | `aiohttp` | httpx is sync+async, has simpler API, pytest-httpx mocking support |
| `hatchling` | `setuptools` | hatchling is simpler for pure Python packages; setuptools needed only for C extensions |

### Installation

```bash
# TypeScript core + ElizaOS
npm install @elizaos/core pino tsup typescript zod vitest @types/node

# Cod3x adapter
npm install @cod3x/sdk @cod3x/ethers viem

# Python Virtuals plugin
pip install game_sdk httpx pytest pytest-asyncio pytest-httpx mypy hatchling
```

---

## Architecture Patterns

### Recommended Project Structure

```
examples/
├── elizaos/                        # @elizaos/plugin-x402guard
│   ├── src/
│   │   ├── index.ts                # Plugin export
│   │   ├── actions/
│   │   │   └── guardedPayment.ts   # Action: make guarded x402 payment
│   │   ├── providers/
│   │   │   └── x402guard.ts        # Provider: inject proxy status into context
│   │   ├── client/
│   │   │   └── X402GuardClient.ts  # HTTP client wrapper over proxy API
│   │   ├── errors.ts               # GuardrailViolationError hierarchy
│   │   └── types.ts                # Exported TypeScript types
│   ├── demo/
│   │   └── demo.ts                 # Full flow: register -> rules -> pay -> violate
│   ├── tests/
│   │   ├── unit/
│   │   │   └── client.test.ts      # X402GuardClient unit tests (mock fetch)
│   │   └── integration/
│   │       └── proxy.test.ts       # Integration tests against running proxy
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   └── README.md
│
├── virtuals/                        # x402guard-game-plugin (Python)
│   ├── src/
│   │   └── x402guard_game/
│   │       ├── __init__.py          # Public exports
│   │       ├── client.py            # X402GuardClient (httpx-based)
│   │       ├── functions.py         # GameFunction factories
│   │       ├── types.py             # Frozen dataclasses for all types
│   │       └── errors.py            # GuardrailViolationError hierarchy
│   ├── demo/
│   │   └── demo.py                 # Full flow demo
│   ├── tests/
│   │   ├── unit/
│   │   │   └── test_client.py
│   │   └── integration/
│   │       └── test_proxy.py
│   ├── pyproject.toml
│   └── README.md
│
└── cod3x/                           # @x402guard/cod3x-adapter
    ├── src/
    │   ├── index.ts                 # Adapter export
    │   ├── X402GuardAdapter.ts      # Protocol adapter wrapping @cod3x/sdk
    │   ├── errors.ts
    │   └── types.ts
    ├── demo/
    │   └── demo.ts
    ├── tests/
    │   └── adapter.test.ts
    ├── package.json
    ├── tsconfig.json
    ├── tsup.config.ts
    └── README.md
```

**Decision on shared core (Claude's discretion):** Recommend creating `examples/core/` as a `@x402guard/core` internal package (not published) containing:
- `X402GuardClient` class (HTTP client, retry, base64url utils)
- `GuardrailViolationError` and error hierarchy
- All shared TypeScript types (`Agent`, `GuardrailRule`, `SessionKey`, `ProxyRequest`, `ProxyResponse`)

Both `elizaos/` and `cod3x/` depend on `@x402guard/core` via npm workspace links. This halves the duplicated code.

### Pattern 1: ElizaOS Plugin Conformance

**What:** Implement `Plugin` interface from `@elizaos/core`. Register a `guardedPaymentAction` (Action) and an `x402guardProvider` (Provider).

**When to use:** When the agent runtime is ElizaOS and wants guarded x402 payments as agent actions.

**Verified interfaces (source: https://docs.elizaos.ai/plugins/reference):**

```typescript
// Source: docs.elizaos.ai/plugins/reference
import type { Plugin, Action, Provider, IAgentRuntime, Memory, State } from '@elizaos/core';

// Action interface (verified)
const guardedPaymentAction: Action = {
  name: 'GUARDED_PAYMENT',
  description: 'Make an x402 payment guarded by x402Guard rules',
  similes: ['PAY', 'TRANSFER', 'SEND_PAYMENT'],
  examples: [],
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> => {
    // Check proxy URL is configured
    return !!runtime.getSetting('X402GUARD_PROXY_URL');
  },
  handler: async (runtime, message, state, options, callback) => {
    const client = new X402GuardClient({
      proxyUrl: runtime.getSetting('X402GUARD_PROXY_URL')!,
      agentId: runtime.getSetting('X402GUARD_AGENT_ID'),
    });
    // ... make guarded payment
    return { success: true };
  },
};

// Provider interface (verified)
const x402guardProvider: Provider = {
  name: 'X402GUARD_STATUS',
  description: 'Provides x402Guard proxy connection status to agent context',
  get: async (runtime, message, state) => {
    const healthy = await client.healthCheck();
    return {
      text: healthy ? 'x402Guard proxy is reachable' : 'x402Guard proxy is unreachable',
      data: { healthy },
    };
  },
};

// Plugin export (verified)
export const x402guardPlugin: Plugin = {
  name: '@elizaos/plugin-x402guard',
  description: 'x402Guard guardrail proxy for ElizaOS agents',
  config: {
    X402GUARD_PROXY_URL: process.env.X402GUARD_PROXY_URL ?? '',
    X402GUARD_AGENT_ID: process.env.X402GUARD_AGENT_ID ?? '',
  },
  init: async (config, runtime) => {
    const client = new X402GuardClient(config);
    await client.healthCheck(); // Fail fast with helpful message
  },
  actions: [guardedPaymentAction],
  providers: [x402guardProvider],
};
```

### Pattern 2: Virtuals GAME Plugin (Python)

**What:** Wrap proxy API calls as `GameFunction` executables registered in a `WorkerConfig`. The GAME framework calls these functions when the agent decides to make a DeFi payment.

**Verified constructor signatures (source: github.com/game-by-virtuals/game-python examples):**

```python
# Source: game-by-virtuals/game-python/examples/game/test_agent.py (verified)
from game_sdk.game.agent import Agent, WorkerConfig
from game_sdk.game.custom_types import Function, Argument, FunctionResult, FunctionResultStatus
from typing import Tuple

# Function definition pattern
def make_guarded_payment(target_url: str, amount: int, agent_id: str) -> Tuple[FunctionResultStatus, str, dict]:
    """Call x402Guard proxy to make a guarded EVM payment."""
    try:
        client = X402GuardClient.from_env()
        response = client.proxy_payment(target_url=target_url, amount=amount, agent_id=agent_id)
        return FunctionResultStatus.DONE, f"Payment successful: {response.message}", {"tx": response.data}
    except GuardrailViolationError as e:
        return FunctionResultStatus.FAILED, f"Guardrail blocked: {e.rule_type} limit={e.limit} actual={e.actual}", {}

# Wrap in GameFunction
guarded_payment_fn = Function(
    fn_name="make_guarded_payment",
    fn_description="Make an x402 payment guarded by x402Guard rules. Use when DeFi transaction is needed.",
    args=[
        Argument(name="target_url", description="Target API URL requiring x402 payment"),
        Argument(name="amount", description="Amount in USDC minor units (1 USDC = 1000000)"),
        Argument(name="agent_id", description="x402Guard agent ID"),
    ],
    executable=make_guarded_payment,
)

# WorkerConfig
defi_worker = WorkerConfig(
    id="x402guard_defi_worker",
    worker_description="Handles guarded DeFi payments via x402Guard proxy",
    get_state_fn=lambda fn_name, fn_args: {"proxy_url": os.getenv("X402GUARD_PROXY_URL")},
    action_space=[guarded_payment_fn],
)

# Agent (requires VIRTUALS_API_KEY)
agent = Agent(
    api_key=os.environ["VIRTUALS_API_KEY"],
    name="DeFiGuardAgent",
    agent_goal="Execute guarded DeFi payments within configured limits",
    agent_description="An agent that uses x402Guard to safely make payments",
    get_agent_state_fn=lambda fn_name, fn_args: {},
    workers=[defi_worker],
)
```

### Pattern 3: Cod3x Protocol Adapter

**What:** Wrap x402Guard HTTP client as a protocol adapter that sits between `@cod3x/sdk` operations and the x402Guard proxy.

**Known from Cod3x SDK (source: github.com/Cod3x-Labs/ToolChain-SDK):**
- SDK exposes `CodexSDK` class with `getAccountsSDK()`, `signTransaction()`
- `@cod3x/ethers` provides ethers.js provider/signer integration
- Security worker pattern: `securityWorker: async (securityData) => { headers: { Authorization: ... } }`

```typescript
// Cod3x adapter: intercepts Cod3x transaction calls, routes through x402Guard
export class X402GuardCod3xAdapter {
  private readonly guard: X402GuardClient;
  private readonly cod3x: CodexSDK;

  constructor(config: X402GuardCod3xAdapterConfig) {
    this.guard = new X402GuardClient({
      proxyUrl: config.proxyUrl ?? process.env.X402GUARD_PROXY_URL!,
      agentId: config.agentId ?? process.env.X402GUARD_AGENT_ID,
    });
    this.cod3x = new CodexSDK({ /* Cod3x config */ });
  }

  async guardedExecute(targetUrl: string, payment: PaymentPayload): Promise<ProxyResponse> {
    return this.guard.proxyPayment({ targetUrl, payment });
  }
}
```

### Pattern 4: HTTP Client Core

**What:** Shared `X402GuardClient` class used by all three examples. Handles base URL, retry, error parsing, logging.

```typescript
// @x402guard/core / X402GuardClient.ts
import pino from 'pino';

export class X402GuardClient {
  private readonly baseUrl: string;
  private readonly logger: pino.Logger;

  constructor(config: X402GuardConfig) {
    this.baseUrl = config.proxyUrl ?? process.env.X402GUARD_PROXY_URL ?? '';
    this.logger = pino({ level: config.logLevel ?? 'info', name: 'x402guard' });
    if (!this.baseUrl) throw new Error('X402GUARD_PROXY_URL is required');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetchWithRetry('/health');
      return res.ok;
    } catch {
      throw new Error(`Proxy unreachable at ${this.baseUrl} -- is docker compose up running?`);
    }
  }

  async proxyPayment(req: ProxyRequest): Promise<ProxyResponse> {
    const res = await this.fetchWithRetry('/api/v1/proxy', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    const data = await res.json() as ApiResponse<ProxyResponse>;
    if (!data.success) {
      // Parse guardrail violations from 403 responses
      throw GuardrailViolationError.fromApiResponse(data);
    }
    return data.data!;
  }

  private async fetchWithRetry(path: string, init?: RequestInit, attempt = 0): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10);
      await sleep(retryAfter * 1000 * Math.pow(2, attempt));
      return this.fetchWithRetry(path, init, attempt + 1);
    }
    return res;
  }
}
```

### Pattern 5: Error Hierarchy

```typescript
// TypeScript
export class X402GuardError extends Error {
  constructor(message: string, readonly statusCode?: number) { super(message); }
}
export class GuardrailViolationError extends X402GuardError {
  constructor(
    message: string,
    readonly ruleType: string,
    readonly limit: number | string,
    readonly actual: number | string,
  ) { super(message, 403); }

  static fromApiResponse(data: ApiResponse<unknown>): GuardrailViolationError {
    // Parse structured 403 from proxy
    return new GuardrailViolationError(data.error!, /* parse ruleType, limit, actual */);
  }
}
export class ProxyUnreachableError extends X402GuardError {}
export class SessionKeyExpiredError extends X402GuardError {}
```

```python
# Python
from dataclasses import dataclass

@dataclass(frozen=True)
class GuardrailViolationError(Exception):
    message: str
    rule_type: str
    limit: int | str
    actual: int | str

class ProxyUnreachableError(Exception): ...
class SessionKeyExpiredError(Exception): ...
```

### Pattern 6: Demo Script Flow

Every demo follows the exact same 5-step flow, making output readable:

```
Step 1: Health check (verify proxy is up)
Step 2: Register agent (POST /api/v1/agents)
Step 3: Set guardrail rules (POST /api/v1/agents/:id/rules)
Step 4: Make guarded payment (POST /api/v1/proxy) -- should SUCCEED
Step 5: Trigger guardrail violation (exceed MaxSpendPerTx limit) -- should FAIL with GuardrailViolationError
```

Demo must show readable output for step 5:
```
[BLOCKED] GuardrailViolationError: MaxSpendPerTx limit=1000000 actual=2000000
  rule_type: MaxSpendPerTx
  limit:     1,000,000 (1.00 USDC)
  actual:    2,000,000 (2.00 USDC)
```

### Anti-Patterns to Avoid

- **Hardcoded secrets:** Never hardcode proxy URL or agent credentials in demo scripts. Always env vars.
- **console.log in production code:** Project rule (ts-hooks.md). Use pino logger in all non-demo TS code.
- **print() in production code:** Project rule (py-hooks.md). Use stdlib logging in all non-demo Python code.
- **Mutable config objects:** Follow ts-coding-style.md immutability pattern — constructor args produce immutable client config.
- **Silent error swallowing:** Wrap every HTTP call with explicit error handling; never swallow network errors.
- **Signing in the SDK:** x402Guard is non-custodial. The demo shows pre-constructed payment payloads. The SDK NEVER holds private keys.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry with exponential backoff | Custom retry loop | Built into `X402GuardClient.fetchWithRetry` | Edge cases in jitter, 429 header parsing |
| Base64url encoding | `Buffer.from(x).toString('base64')` | Use `base64url` npm or `Buffer` with explicit `base64url` flag | Standard lib variant handles padding correctly |
| Structured logging | `console.log` with JSON.stringify | `pino` (TS) / `logging` stdlib (Python) | Level filtering, serialization performance |
| HTTP mock in tests | Manual fetch mock | `vitest` mock + `vi.spyOn(global, 'fetch')` for TS; `pytest-httpx` for Python | Correct teardown, scoping, async handling |
| Python package build | `setup.py` | `pyproject.toml` with `hatchling` | Modern standard; setup.py deprecated |
| TypeScript package build | Custom webpack/rollup config | `tsup` | Standard for TS SDK publishing |

**Key insight:** The SDK is thin on purpose — the proxy already handles all crypto. Don't replicate EIP-712 signing logic in the SDK examples.

---

## x402Guard Proxy API Reference (for SDK implementors)

This section documents the actual endpoints the SDK wraps, derived from reading the Rust codebase.

### Endpoints

| Method | Path | Purpose | Request shape |
|--------|------|---------|--------------|
| GET | `/health` | Liveness check | — |
| POST | `/api/v1/agents` | Register agent | `{ name, owner_address }` |
| GET | `/api/v1/agents/:id` | Get agent | — |
| POST | `/api/v1/agents/:id/rules` | Create guardrail rule | `{ rule_type: { type, params } }` |
| GET | `/api/v1/agents/:id/rules` | List agent rules | — |
| PUT | `/api/v1/agents/:id/rules/:rule_id` | Update rule | `{ rule_type, is_active }` |
| DELETE | `/api/v1/agents/:id/rules/:rule_id` | Deactivate rule | — |
| POST | `/api/v1/agents/:id/session-keys` | Create session key | `{ public_key, max_spend, allowed_contracts, expires_at }` |
| POST | `/api/v1/agents/:id/revoke-all` | Revoke all session keys | `{ owner_address, chain_id?, eoa_nonce_hint? }` |
| POST | `/api/v1/proxy` | EVM guarded payment | `{ targetUrl, x402Payment, x402Requirements, agentId?, sessionKeyId? }` |
| POST | `/api/v1/proxy/solana` | Solana guarded payment | `{ targetUrl, network, vaultOwner, amount, destinationProgram?, x402Payment }` |
| GET | `/api/v1/solana/vault/:owner` | Vault status | — |

### GuardrailRule type discriminant

```json
// MaxSpendPerTx
{ "type": "MaxSpendPerTx", "params": { "limit": 1000000 } }
// MaxSpendPerDay
{ "type": "MaxSpendPerDay", "params": { "limit": 5000000 } }
// AllowedContracts
{ "type": "AllowedContracts", "params": { "addresses": ["0x..."] } }
// MaxLeverage
{ "type": "MaxLeverage", "params": { "max": 3 } }
// MaxSlippage
{ "type": "MaxSlippage", "params": { "bps": 50 } }
```

### ProxyRequest for EVM (camelCase, all required except agent/session fields)

```json
{
  "targetUrl": "https://api.example.com/data",
  "x402Payment": "<base64url of PaymentPayload JSON>",
  "x402Requirements": "<base64url of PaymentRequirements JSON>",
  "agentId": "uuid",
  "sessionKeyId": "uuid"
}
```

### PaymentPayload structure (for demo construction)

```json
{
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0xAgentWallet",
      "to": "0xServicePayTo",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1800000000",
      "nonce": "0x<random bytes32>"
    }
  }
}
```

The demo script constructs valid PaymentPayload objects using `viem` (TS) for the EIP-712 signature or can use pre-signed test fixtures. Since the proxy is off-chain only (not broadcasting), signatures must pass EIP-3009 verification but don't need real USDC approval on-chain.

---

## Common Pitfalls

### Pitfall 1: base64url vs base64

**What goes wrong:** Using standard base64 (`btoa`, `Buffer.toString('base64')`) for x402 header encoding produces `+` and `/` characters that break URL-safe headers. The proxy uses `URL_SAFE_NO_PAD` (no padding, `-` and `_` chars).
**Why it happens:** The proxy spec follows Coinbase x402 reference which uses base64url without padding.
**How to avoid:** Always use `Buffer.from(json).toString('base64url')` in Node.js (built-in) or the `base64-url` package.
**Warning signs:** Proxy returns 400 "invalid base64url in X-Payment".

### Pitfall 2: GuardrailRule type tag format

**What goes wrong:** Sending `{ "type": "max_spend_per_tx", "limit": 1000000 }` instead of the correct discriminant format.
**Why it happens:** Rust serde tagged enum uses `#[serde(tag = "type", content = "params")]` — so the wire format is `{ "type": "MaxSpendPerTx", "params": { "limit": 1000000 } }`, not flat.
**How to avoid:** SDK types must mirror the Rust enum exactly. Use PascalCase for type discriminants.
**Warning signs:** Proxy returns 400 or 422 on rule creation.

### Pitfall 3: ElizaOS plugin config not reaching runtime.getSetting

**What goes wrong:** Setting `process.env.X402GUARD_PROXY_URL` works in tests but `runtime.getSetting('X402GUARD_PROXY_URL')` returns undefined in the agent.
**Why it happens:** ElizaOS reads plugin config from the agent's character JSON `settings` block and maps it to `runtime.getSetting()`. The `config` object in the plugin definition only declares the expected keys.
**How to avoid:** Document that the agent's character JSON must include `"settings": { "X402GUARD_PROXY_URL": "...", "X402GUARD_AGENT_ID": "..." }`. Plugin `init` validates presence and throws with actionable message if missing.
**Warning signs:** `runtime.getSetting('X402GUARD_PROXY_URL')` returns undefined; plugin silently fails.

### Pitfall 4: GAME SDK requires a live Virtuals API key

**What goes wrong:** Running the Virtuals demo without a `VIRTUALS_API_KEY` env var causes the GAME framework to fail at `Agent` construction.
**Why it happens:** `Agent(api_key=...)` is required by the GAME framework for the LLM planner. This is Virtuals' hosted inference, not optional.
**How to avoid:** README must clearly state that a Virtuals API key (from game.virtuals.io console) is required for the full demo. Unit tests mock the `Agent` class entirely — they only test the `X402GuardClient` and `GameFunction` wrappers in isolation.
**Warning signs:** `Agent` raises an error about invalid/missing API key before any x402Guard calls happen.

### Pitfall 5: Proxy returns 403 for guardrail violations, not 4xx with structured body

**What goes wrong:** SDK treats all non-2xx as generic errors, swallowing the structured violation details in the 403 response body.
**Why it happens:** Guardrail 403s contain `{ success: false, error: "..." }` with violation details. Without parsing, callers see only "Forbidden" with no rule context.
**How to avoid:** `X402GuardClient` must check for `res.status === 403` and parse `GuardrailViolationError` from the body. Tests verify this path explicitly.

### Pitfall 6: CORS headers on proxy in integration tests

**What goes wrong:** Integration tests from a Node.js test runner work fine, but a browser-based demo hits CORS errors.
**Why it happens:** Proxy's `ALLOWED_ORIGINS` defaults to `http://localhost:3000`. If test runner or demo runs on a different port, CORS blocks.
**How to avoid:** docker-compose.yml or `.env.test` should set `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001` or the demo documents the env var explicitly.

---

## Code Examples

### ElizaOS package.json (verified pattern)

```json
{
  "name": "@elizaos/plugin-x402guard",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "test:integration": "vitest run tests/integration"
  },
  "peerDependencies": {
    "@elizaos/core": "*"
  },
  "dependencies": {
    "pino": "^10.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsup": "^8.0.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0",
    "@elizaos/core": "latest"
  }
}
```

### tsup.config.ts (standard)

```typescript
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

### Python pyproject.toml (hatchling pattern)

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "x402guard-game-plugin"
version = "0.1.0"
description = "x402Guard guardrail proxy plugin for Virtuals Protocol GAME SDK"
requires-python = ">=3.11"
dependencies = [
    "game_sdk",
    "httpx>=0.28",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "pytest-httpx>=0.35",
    "mypy>=1.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.mypy]
strict = true
python_version = "3.11"
```

### Integration test pattern (vitest)

```typescript
// tests/integration/proxy.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { X402GuardClient } from '../../src/client/X402GuardClient';

const PROXY_URL = process.env.X402GUARD_PROXY_URL ?? 'http://localhost:3402';

describe('X402Guard proxy integration', () => {
  let client: X402GuardClient;

  beforeAll(async () => {
    client = new X402GuardClient({ proxyUrl: PROXY_URL });
    const healthy = await client.healthCheck();
    if (!healthy) throw new Error(`Proxy not running at ${PROXY_URL}. Run: docker compose up`);
  });

  it('registers agent and creates guardrail rule', async () => {
    const agent = await client.createAgent({ name: 'test-agent', ownerAddress: '0xdeadbeef' });
    expect(agent.id).toBeTruthy();
    const rule = await client.createRule(agent.id, {
      type: 'MaxSpendPerTx', params: { limit: 1_000_000 }
    });
    expect(rule.id).toBeTruthy();
  });
});
```

### Unit test pattern (vitest + fetch mock)

```typescript
// tests/unit/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { X402GuardClient } from '../../src/client/X402GuardClient';
import { GuardrailViolationError } from '../../src/errors';

describe('X402GuardClient', () => {
  beforeEach(() => vi.resetAllMocks());

  it('throws GuardrailViolationError on 403', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ success: false, error: 'MaxSpendPerTx: limit=1000000 actual=2000000' }),
      { status: 403 }
    ));
    const client = new X402GuardClient({ proxyUrl: 'http://localhost:3402' });
    await expect(client.proxyPayment({ targetUrl: 'https://x.com', /* ... */ }))
      .rejects.toBeInstanceOf(GuardrailViolationError);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setup.py` for Python packages | `pyproject.toml` with hatchling/setuptools | PEP 517 (2017), mainstream 2023+ | Simpler, standard, no more `python setup.py install` |
| jest for TS testing | vitest | 2022, mainstream 2024+ | Faster, native ESM support, no babel config |
| axios for HTTP client | `fetch` (native) + retry wrapper | Node.js 18+ built-in fetch | Zero dependency; native in modern Node |
| ElizaOS V1 (`ai16z/eliza`) | ElizaOS V2 (`elizaOS/eliza`) | 2025 | Different Plugin interface — use `@elizaos/core` from V2 |
| `virtuals_sdk` (deprecated) | `game_sdk` from `game-by-virtuals/game-python` | 2025 | Repository migrated; old package no longer maintained |

**Deprecated/outdated:**
- `virtuals_sdk` PyPI package: Deprecated, migrated to `game_sdk`. Do NOT use.
- ElizaOS V1 plugin interface: Different from V2. Current examples must use V2 `@elizaos/core`.
- `setup.py` for Python packages: Use `pyproject.toml`.

---

## Open Questions

1. **EIP-3009 signature construction in demo scripts**
   - What we know: The proxy verifies EIP-3009 signatures using EIP-712. Demos need valid signatures to pass verification (off-chain only — no testnet broadcast needed).
   - What's unclear: Should demo scripts construct real EIP-712 signatures (using `viem` + a test private key) or use pre-signed fixture bytes? Pre-signed fixtures are simpler but the proxy's nonce deduplication means they can only be used once.
   - Recommendation: Use `viem` with a deterministic test private key. Generate a new random nonce per demo run. Document the test key in the README with a warning ("never use with real funds").

2. **Cod3x ToolChain-SDK integration depth**
   - What we know: Cod3x exposes `CodexSDK`, `@cod3x/ethers` for ethers.js integration, and a security worker adapter pattern.
   - What's unclear: Whether the Cod3x SDK has a payment/settlement flow that maps naturally to x402Guard, or whether the adapter is purely "call x402Guard instead of calling Cod3x's settlement path."
   - Recommendation: FR-8.3 is SHOULD priority. Build the Cod3x adapter as a thin wrapper: `X402GuardCod3xAdapter` implements the same interface as a Cod3x payment worker but routes through x402Guard. The README explains the integration pattern. Focus implementation effort on ElizaOS (MUST) and Virtuals (MUST) first.

3. **CI integration test environment**
   - What we know: Integration tests require `docker compose up` (proxy + postgres + redis running). CI runs on GitHub Actions.
   - What's unclear: Whether the existing `.github/workflows/` already has service containers configured for integration tests.
   - Recommendation: Add a `docker-compose.test.yml` or use GitHub Actions `services:` block for postgres and redis. Build the Rust proxy image in CI before running integration tests. Or skip integration tests in CI and only run unit tests (integration tests are for local dev).

4. **GAME SDK agent vs worker demo mode**
   - What we know: Running a `GameAgent` with `agent.run()` starts an agentic loop that calls Virtuals' hosted LLM. This requires a real VIRTUALS_API_KEY.
   - What's unclear: Can we demo the GAME plugin without a live Virtuals API key by calling `GameWorker` directly (bypassing the agent planner)?
   - Recommendation: Provide two demo modes: (1) `demo_worker.py` — calls `GameFunction` executables directly without LLM planner (no API key needed); (2) `demo_agent.py` — full agentic loop requiring `VIRTUALS_API_KEY`. README documents both.

---

## Validation Architecture

`nyquist_validation` is not in config.json (field absent). Skipping formal Validation Architecture section. Test commands are documented inline in the Standard Stack and Code Examples sections.

**Test run commands per example:**

```bash
# TypeScript examples (unit tests, no proxy needed)
cd examples/elizaos && npm test
cd examples/cod3x && npm test

# TypeScript integration tests (proxy must be running)
docker compose up -d
cd examples/elizaos && npm run test:integration
cd examples/cod3x && npm run test:integration

# Python example (unit tests, no proxy needed)
cd examples/virtuals && pytest tests/unit/

# Python integration tests (proxy must be running)
docker compose up -d
cd examples/virtuals && pytest tests/integration/
```

---

## Sources

### Primary (HIGH confidence)
- `docs.elizaos.ai/plugins/reference` — Verified Plugin, Action, Provider, IAgentRuntime TypeScript interfaces
- `docs.elizaos.ai/plugins/development` — Plugin file structure, package.json requirements, registration pattern
- `github.com/game-by-virtuals/game-python` (examples/game/test_agent.py) — Verified GameFunction, WorkerConfig, Agent constructor signatures and usage
- Rust proxy source in `D:/x402Guard/proxy/src/` — Definitive API endpoint shapes, request/response types, error codes

### Secondary (MEDIUM confidence)
- `github.com/Cod3x-Labs/ToolChain-SDK` — Cod3x SDK package structure and security worker adapter pattern (limited docs)
- `github.com/coinbase/x402` — x402 protocol structure: PaymentPayload, PaymentRequirements, facilitator flow
- `vitest.dev/guide` — Vitest setup and configuration patterns
- `packaging.python.org` — pyproject.toml with hatchling build backend

### Tertiary (LOW confidence)
- `game-by-virtuals/game-python` README — GAME SDK description; example file paths inferred from README, not directly verified
- Cod3x adapter protocol pattern — Inferred from security worker pattern in SDK docs; actual Cod3x x402 integration path unverified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via official docs and npm/PyPI packages
- ElizaOS interfaces: HIGH — verified from official plugin reference docs
- GAME SDK Python API: MEDIUM — constructor signatures from example file; some uncertainty on exact import paths
- Cod3x adapter: LOW — limited public documentation; FR-8.3 is SHOULD priority
- x402Guard API surface: HIGH — read directly from Rust source

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (ElizaOS and GAME SDKs move fast; re-verify interfaces before implementation)
