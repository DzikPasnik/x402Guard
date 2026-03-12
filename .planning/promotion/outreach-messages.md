# Community Outreach Messages

## Twitter/X — Launch Thread

**Thread (5 tweets):**

**1/5**
We built x402Guard — an open-source safety proxy for autonomous AI agents handling real money via @coinbase's x402 protocol.

Guardrails for DeFi agents: spend limits, contract whitelists, session keys.

Try the live demo → https://x402-guard-flame.vercel.app/agent

🧵

**2/5**
The problem: AI agents are getting wallets. Without guardrails, they can drain funds, interact with malicious contracts, or exceed budgets.

x402Guard sits between agents and Web3 services, enforcing configurable rules without ever touching private keys.

**3/5**
What it enforces:
- MaxSpendPerTx — cap individual payments
- MaxSpendPerDay — daily budget limits
- AllowedContracts — whitelist approved contracts
- EIP-7702 session keys — time-limited, scoped spending
- Immutable audit log — every action recorded

**4/5**
Production stack:
- Rust/Axum proxy (106 tests)
- Solana PDA vault guard (13 tests)
- Next.js dashboard
- Base + Solana support
- Security audit complete (6 CRITICAL fixed)

All open source, MIT licensed.

**5/5**
Links:
⭐ GitHub: https://github.com/DzikPasnik/x402Guard
🎮 Agent Demo: https://x402-guard-flame.vercel.app/agent
📊 Dashboard: https://x402-guard-flame.vercel.app
📖 Integration examples: ElizaOS, Virtuals, Cod3x

---

## ElizaOS Discord — #showcase / #plugins

**Subject: x402Guard — Guardrails plugin for ElizaOS agents handling x402 payments**

Hey everyone! We built x402Guard, an open-source safety proxy for AI agents handling real money via the x402 protocol.

We have a ready-to-use ElizaOS integration that adds guardrails to your agent's payment flows:
- Spend limits (per-tx and daily caps)
- Contract whitelists (only approved addresses)
- Session key scoping (EIP-7702)
- Full audit logging

The plugin sits between your agent and Web3 services — non-custodial, never touches keys.

**Live demo** (chat with an AI agent using x402Guard tools): https://x402-guard-flame.vercel.app/agent

**Integration code**: https://github.com/DzikPasnik/x402Guard/tree/main/examples

MIT licensed. Would love feedback from anyone building agents that handle payments!

---

## Virtuals Discord — #builders

**Subject: x402Guard — Safety layer for Virtuals agents using x402 payments**

Hi! Sharing x402Guard — open-source guardrails proxy for autonomous agents handling money via x402.

We built a Virtuals integration example that adds spend limits, contract whitelists, and session key scoping to your agent's payment flows. Non-custodial — your keys stay with you.

Live agent demo: https://x402-guard-flame.vercel.app/agent
GitHub: https://github.com/DzikPasnik/x402Guard

Looking for feedback from anyone building payment-enabled agents!

---

## Cod3x Discord — #showcase

**Subject: x402Guard Cod3x Integration — Guardrails for agent payments**

Hey Cod3x builders! We created x402Guard, a non-custodial safety proxy for AI agents handling x402 payments. We have a dedicated Cod3x integration example.

Features: spend limits, contract whitelists, session keys, audit logging.
All open source: https://github.com/DzikPasnik/x402Guard/tree/main/examples/cod3x

Try the interactive demo: https://x402-guard-flame.vercel.app/agent

---

## Farcaster / Warpcast Post

Built x402Guard — open-source guardrails for AI agents handling real money via @coinbase x402 protocol.

Spend limits • Contract whitelists • Session keys • Audit logging

Non-custodial. 106 tests. Security audit complete.

Try the live agent demo → x402-guard-flame.vercel.app/agent

⭐ github.com/DzikPasnik/x402Guard

---

## GitHub Discussions — Announcement

**Title: x402Guard is ready for testing — AI agent guardrails for x402**

x402Guard is now production-deployed and ready for community testing.

**What it does:** Non-custodial safety proxy that sits between AI agents and Web3 services, enforcing guardrails on x402 payment flows.

**What's new:**
- Interactive AI agent demo at /agent (chat with a Claude-powered agent that uses x402Guard tools live)
- Full security audit complete
- Beta tested on Base Sepolia (9/9 scenarios passing)
- Integration examples for ElizaOS, Virtuals, and Cod3x

**Try it:**
- Agent Demo: https://x402-guard-flame.vercel.app/agent
- Dashboard: https://x402-guard-flame.vercel.app
- Docs: See README and examples/

We'd love your feedback, bug reports, and contributions. See CONTRIBUTING.md for guidelines.
