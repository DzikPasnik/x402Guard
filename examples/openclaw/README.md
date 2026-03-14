# x402Guard OpenClaw Plugin

OpenClaw plugin for the [x402Guard](https://x402guard.dev) non-custodial DeFi safety proxy.

Gives your OpenClaw AI agent 11 tools to manage guardrails and make safe, audited payments on **Base (EVM)** and **Solana**.

## Quick Start

### 1. Install the plugin

```bash
# From npm (when published)
openclaw plugins install @x402guard/openclaw-plugin

# Or link locally for development
openclaw plugins install -l ./examples/openclaw
```

### 2. Configure in `openclaw.json`

```json5
{
  plugins: {
    entries: {
      "x402guard": {
        enabled: true,
        config: {
          proxyUrl: "https://x402guard-production.up.railway.app",
          agentId: "your-agent-uuid",   // optional default
          apiKey: "your-api-key"        // optional
        }
      }
    }
  }
}
```

Or via environment variables:

```bash
export X402GUARD_PROXY_URL="https://x402guard-production.up.railway.app"
export X402GUARD_AGENT_ID="your-agent-uuid"
```

### 3. Use naturally

Once configured, your OpenClaw agent can use x402Guard tools in conversation:

> **You:** Check if our DeFi safety proxy is online
> **Agent:** *(calls x402guard_health_check)* The x402Guard proxy is online and ready.

> **You:** Set a $5 per-transaction spend limit for our agent
> **Agent:** *(calls x402guard_create_rule with MaxSpendPerTx: 5000000)* Created guardrail rule. Your agent is now limited to $5 per transaction.

> **You:** Show me all active guardrail rules
> **Agent:** *(calls x402guard_list_rules)* You have 2 active rules: MaxSpendPerTx ($5) and AllowedContracts (3 addresses).

## Available Tools

| Tool | Description |
|------|-------------|
| `x402guard_health_check` | Check if the proxy is online |
| `x402guard_create_agent` | Register a new AI agent |
| `x402guard_get_agent` | Get agent details by ID |
| `x402guard_create_rule` | Create a guardrail rule (spend limits, whitelists, etc.) |
| `x402guard_list_rules` | List all guardrail rules for an agent |
| `x402guard_create_session_key` | Create a temporary session key with spend limits |
| `x402guard_list_session_keys` | List all session keys |
| `x402guard_revoke_session_key` | Revoke a specific session key |
| `x402guard_proxy_payment` | Make a guarded EVM (Base) payment |
| `x402guard_proxy_solana_payment` | Make a guarded Solana payment |
| `x402guard_revoke_all` | Emergency: revoke all keys and deactivate agent |

## Guardrail Rule Types

| Rule | Parameter | Example |
|------|-----------|---------|
| `MaxSpendPerTx` | `limit` (micro-USDC) | 5000000 = $5 per tx |
| `MaxSpendPerDay` | `limit` (micro-USDC) | 50000000 = $50/day |
| `AllowedContracts` | `addresses` (array) | Only interact with whitelisted contracts |
| `MaxLeverage` | `max` (multiplier) | 3 = max 3x leverage |
| `MaxSlippage` | `bps` (basis points) | 100 = max 1% slippage |

## Architecture

```
@x402guard/openclaw-plugin
├── openclaw.plugin.json    # Plugin manifest (config schema, UI hints)
├── src/
│   ├── plugin.ts           # register(api) — lazy client + 11 tools
│   ├── openclaw.d.ts       # OpenClaw Plugin SDK types
│   ├── index.ts            # Re-exports (tools, core types, errors)
│   └── tools/
│       ├── health.ts       # x402guard_health_check
│       ├── agents.ts       # create_agent, get_agent
│       ├── rules.ts        # create_rule, list_rules
│       ├── sessionKeys.ts  # create/list/revoke session keys
│       ├── payments.ts     # proxy_payment, proxy_solana_payment
│       └── revoke.ts       # revoke_all (emergency)
├── tests/unit/             # Vitest unit tests
├── demo/demo.ts            # Standalone demo (no OpenClaw runtime needed)
└── package.json
```

The plugin depends on `@x402guard/core` for the typed HTTP client, error classes, and retry logic. No code duplication from the core SDK.

## Development

```bash
cd examples/openclaw

# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build

# Run standalone demo
X402GUARD_PROXY_URL=http://localhost:3402 npm run demo
```

## Error Handling

All tools return structured responses:

```json5
// Success
{ "success": true, "agent": { "id": "...", "name": "..." } }

// Guardrail violation (payment blocked)
{
  "success": false,
  "blocked": true,
  "ruleType": "MaxSpendPerTx",
  "limit": 5000000,
  "actual": 10000000,
  "message": "Transaction exceeds per-tx spend limit"
}

// Missing configuration
{ "success": false, "error": "agent_id is required (no default configured)" }

// Proxy down
{ "online": false, "error": "Proxy unreachable at https://..." }
```

## Security

- **Non-custodial**: x402Guard never holds private keys or funds
- **Fail-closed**: Missing configuration = denied, not allowed
- **Guardrails enforced server-side**: The proxy validates rules before forwarding transactions
- **Immutable audit log**: All transactions are logged and cannot be modified

## License

MIT — see [LICENSE](../../LICENSE)
