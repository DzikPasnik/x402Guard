# Why Your AI Agent Needs Guardrails Before Touching Real Money

*Tags: ai, web3, security, rust*

---

AI agents are getting wallets.

Not metaphorical wallets. Real ones. With real USDC. Coinbase's [x402 protocol](https://github.com/coinbase/x402) lets any HTTP service charge AI agents for API calls using the standard `402 Payment Required` status code. An agent receives a 402 response, constructs a signed payment authorization, and retries the request with an `X-Payment` header. No human in the loop. No approval pop-up. Just autonomous spending.

This is powerful. It means agents can pay for compute, data feeds, model inference, or any Web3 service without a human clicking "confirm" on every transaction.

It is also terrifying.

## What Could Go Wrong

Consider an autonomous trading agent running on ElizaOS. It has access to a wallet with $10,000 USDC. It is supposed to make small trades on Base, interacting with a specific set of DeFi contracts. Now imagine any of these scenarios:

**Unrestricted spend.** A bug in the agent's decision logic causes it to approve a $5,000 payment in a single transaction — half the treasury — on what it "thought" was a good trade.

**Malicious contracts.** The agent gets pointed at a phishing service that returns a 402 response with a payment requirement directed at an attacker-controlled contract. The agent pays. It had no whitelist to check against.

**Runaway loop.** A retry bug causes the agent to make the same $50 payment 200 times in an hour. No daily cap means $10,000 gone before anyone notices.

**Compromised session.** An attacker gains access to the agent's signing key. Without scoped session keys or revocation, they have indefinite access to the full wallet balance.

These are not hypothetical. They are the exact failure modes that keep DeFi security engineers up at night. And with x402 making agent-to-service payments frictionless, the attack surface grows with every new agent deployed.

## The Missing Layer: Guardrails

The x402 protocol handles the payment flow. Wallets handle key management. But neither handles the question: *should this agent be allowed to make this specific payment right now?*

That is the problem [x402Guard](https://github.com/DzikPasnik/x402Guard) solves. It is an open-source, non-custodial safety proxy that sits between your AI agent and any x402-enabled service. Every payment passes through configurable guardrail rules before it reaches the target.

```
Agent  -->  x402Guard Proxy  -->  Target Service
               |
         Guardrail Rules
         Session Key Verification
         Spend Tracking
         Audit Logging
```

The proxy never holds funds. It never has access to private keys. It verifies EIP-3009 payment signatures, evaluates rules, and either forwards the request or blocks it with a `403 Guardrail Violation` response. Fail-closed by default — if anything goes wrong during evaluation, the payment is denied.

## How Guardrail Rules Work

Guardrails are configured per agent through a REST API. Each rule is a typed JSON object with a discriminator and parameters:

**Cap a single transaction:**

```json
{
  "type": "MaxSpendPerTx",
  "params": { "limit": 5000000 }
}
```

This blocks any single payment above 5 USDC (amounts are in USDC minor units, so 5000000 = 5.00 USDC). An agent that tries to authorize a $500 payment gets a `403` before the transaction ever reaches the target service.

**Enforce a daily budget:**

```json
{
  "type": "MaxSpendPerDay",
  "params": { "limit": 50000000 }
}
```

A rolling 24-hour window that caps total spend at 50 USDC. Even if each individual transaction is small, the agent cannot exceed its daily allowance. The spend tracking uses atomic database operations to prevent race conditions — a critical detail when multiple requests arrive concurrently.

**Restrict which contracts the agent can interact with:**

```json
{
  "type": "AllowedContracts",
  "params": {
    "addresses": [
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "0x4200000000000000000000000000000000000006"
    ]
  }
}
```

Only payments directed at these specific contract addresses are allowed. Everything else is blocked. This is the simplest defense against phishing services that try to redirect payments to attacker-controlled contracts.

Rules stack. An agent can have all three active simultaneously: per-transaction cap, daily budget, and contract whitelist. Each payment must pass every active rule to proceed.

## Session Keys: Scoped, Temporary, Revocable

Beyond guardrails, x402Guard supports EIP-7702 session keys on Base. Instead of giving an agent unrestricted access to a wallet, you create a scoped session key:

```json
{
  "public_key": "0x...",
  "max_spend": 100000000,
  "allowed_contracts": ["0x036CbD53842c5426634e7929541eC2318f3dCF7e"],
  "expires_at": "2026-04-01T00:00:00Z"
}
```

The session key has its own spend limit (100 USDC), its own contract whitelist, and an expiration date. If the key is compromised, the blast radius is bounded. And you can revoke it instantly — one API call, and the key is dead.

For the nuclear option, there is a one-click "revoke all" that deactivates every session key for an agent simultaneously. On Base, this uses an EIP-7702 zero-address delegation to cut off access at the protocol level.

## Solana Too

The same guardrail concept extends to Solana through an Anchor program. Instead of EIP-7702 session keys, Solana uses PDA (Program Derived Address) vaults with on-chain enforcement:

- Per-transaction limit checked in the program
- Daily cap tracked on-chain with a rolling 24h window
- Program whitelist restricting which Solana programs can be called
- Owner-only revocation that zeros out agent access

The Rust proxy handles both chains through a unified API surface. Agents do not need to know which chain's guardrails they are hitting — the proxy routes and enforces appropriately.

## What the Proxy Actually Checks

When a payment request hits x402Guard, here is the full verification pipeline:

1. **Input validation** — target URL checked against SSRF patterns
2. **x402 header parsing** — payment proof and requirements decoded
3. **URL match** — target URL must match the payment requirements resource (prevents redirect attacks)
4. **Asset match** — payment token must match what the service requested
5. **EIP-3009 signature verification** — cryptographic proof the payment is authentic
6. **Session key verification** — if scoped, check delegation, expiry, and spend
7. **Guardrail evaluation** — every active rule for the agent is checked
8. **Nonce dedup** — Redis-backed replay prevention
9. **Rate limiting** — per-agent sliding window
10. **Forward** — only if everything passes

The proxy is built in Rust with Axum, backed by Redis for nonce tracking and rate limiting, and Postgres for persistent state. It has 106 tests covering the proxy logic and 13 tests for the Solana program. A security audit identified and fixed 6 critical vulnerabilities including a TOCTOU race condition in spend tracking and an IDOR on the dashboard.

## Try It

x402Guard is live on Base Sepolia testnet. You can interact with the agent demo at [x402-guard-flame.vercel.app/agent](https://x402-guard-flame.vercel.app/agent) — it walks through real guardrail enforcement with a test agent making x402 payments.

The dashboard at [x402-guard-flame.vercel.app](https://x402-guard-flame.vercel.app) lets you connect a wallet, register agents, configure guardrail rules, and monitor spend in real time.

Integration takes minutes with the TypeScript SDK:

```typescript
import { X402GuardClient } from "@x402guard/core";

const client = new X402GuardClient({
  proxyUrl: "https://x402guard-production.up.railway.app",
  agentId: "your-agent-uuid",
});

// Set up guardrails
await client.createRule(agentId, {
  rule_type: { type: "MaxSpendPerTx", params: { limit: 5000000 } },
});

await client.createRule(agentId, {
  rule_type: { type: "MaxSpendPerDay", params: { limit: 50000000 } },
});

// Proxy a payment (guardrails enforced automatically)
const result = await client.proxyPayment({
  targetUrl: "https://some-x402-service.com/api/data",
  x402Payment: paymentProof,
  x402Requirements: requirements,
  agentId: agentId,
});
```

There are also ready-made integration examples for [ElizaOS](https://github.com/DzikPasnik/x402Guard/tree/main/examples/elizaos), [Virtuals Protocol](https://github.com/DzikPasnik/x402Guard/tree/main/examples/virtuals), and [Cod3x](https://github.com/DzikPasnik/x402Guard/tree/main/examples/cod3x).

## The Bigger Picture

The x402 protocol is early. Coinbase launched it as a standard for machine-to-machine payments, and the ecosystem is still forming. But the trajectory is clear: AI agents will handle increasing amounts of real value autonomously. The question is not whether agents will spend money — it is whether they will do so safely.

Guardrails are not optional infrastructure. They are the difference between an agent that operates within bounds and one that drains a wallet at 3 AM because a retry loop hit an edge case nobody tested.

x402Guard is MIT-licensed and open source. Star the repo, try the demo, file issues, send PRs. The code is at [github.com/DzikPasnik/x402Guard](https://github.com/DzikPasnik/x402Guard).

If you are building AI agents that touch real money, add guardrails first.

---

**Links:**
- GitHub: [github.com/DzikPasnik/x402Guard](https://github.com/DzikPasnik/x402Guard)
- Live Dashboard: [x402-guard-flame.vercel.app](https://x402-guard-flame.vercel.app)
- Agent Demo: [x402-guard-flame.vercel.app/agent](https://x402-guard-flame.vercel.app/agent)
- x402 Protocol: [github.com/coinbase/x402](https://github.com/coinbase/x402)
