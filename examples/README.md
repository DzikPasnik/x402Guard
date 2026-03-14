# x402Guard Integration Examples

Ready-to-use integrations for popular AI agent frameworks.

| Example | Language | Framework | Use Case |
|---------|----------|-----------|----------|
| [core](core/) | TypeScript | Vanilla SDK | Direct proxy API — use this as a starting point |
| [elizaos](elizaos/) | TypeScript | [ElizaOS](https://elizaos.ai) | AI agent plugin for ElizaOS characters |
| [virtuals](virtuals/) | Python | [Virtuals GAME SDK](https://virtuals.io) | Python integration for Virtuals Protocol agents |
| [cod3x](cod3x/) | TypeScript | [Cod3x](https://cod3x.org) | DeFi-focused adapter for Cod3x SDK |
| [openclaw](openclaw/) | TypeScript | [OpenClaw](https://openclaw.ai) | Plugin for the most popular open-source AI agent |

## Getting Started

1. Deploy x402Guard proxy (see [root README](../README.md))
2. Create an agent via the [dashboard](https://x402-guard-flame.vercel.app) or API
3. Pick an example above and follow its README

All examples require a running x402Guard proxy and a configured agent ID.

## Common Environment Variables

| Variable | Description |
|----------|-------------|
| `X402GUARD_PROXY_URL` | Proxy URL (e.g. `https://x402guard-production.up.railway.app`) |
| `X402GUARD_AGENT_ID` | Your agent UUID from the dashboard |
| `X402GUARD_LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) |
