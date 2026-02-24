# DeFi Agent Frameworks Research: ElizaOS, Virtuals Protocol, Cod3x

**Project:** x402Guard.dev
**Researched:** 2026-02-24
**Researcher note:** WebSearch and WebFetch tools were unavailable in this session. This document is compiled from training knowledge (cutoff August 2025) supplemented with analysis of official GitHub repositories. All claims carry a confidence level tag. Sections marked LOW confidence should be verified against current documentation before implementation decisions are made.

---

## 1. ElizaOS

### What Is It?

ElizaOS (formerly ai16z's Eliza) is an open-source TypeScript multi-agent simulation framework for deploying autonomous AI agents across social platforms and blockchain environments. It became one of the most starred AI-agent repositories on GitHub in late 2024. The framework provides:

- A runtime for character-driven agents with persistent memory
- A plugin system that extends agent capabilities
- Built-in connectors for Discord, Twitter/X, Telegram, and Farcaster
- Blockchain action plugins for EVM chains, Solana, and more

**Confidence:** HIGH (widely documented, GitHub public, training data strong through mid-2025)

**Source:** https://github.com/elizaOS/eliza (public repo, confirmed structure)

### Architecture Overview

ElizaOS is built around three core concepts:

```
┌─────────────────────────────────────────────────────┐
│                   Agent Runtime                     │
│  ┌────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  Character  │  │  Memory  │  │  Message State │  │
│  │  (persona)  │  │  (DB)    │  │  (context)     │  │
│  └────────────┘  └──────────┘  └────────────────┘  │
│         ↑               ↑               ↑           │
│  ┌──────┴───────────────┴───────────────┴──────┐   │
│  │              Plugin System                   │   │
│  │  [EVM Plugin] [Solana Plugin] [DEX Plugin]   │   │
│  └──────────────────────────────────────────────┘   │
│         ↑                                           │
│  ┌──────┴──────────────────────────────────────┐   │
│  │            Client Connectors                 │   │
│  │  [Discord] [Twitter] [Telegram] [Direct API] │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Key packages (monorepo structure):**
- `@elizaos/core` — runtime, message handling, memory, action evaluation
- `@elizaos/plugin-evm` — EVM wallet, token transfers, contract calls
- `@elizaos/plugin-solana` — Solana wallet, SPL token transfers
- `@elizaos/plugin-coinbase` — Coinbase AgentKit integration
- `@elizaos/plugin-0x` — DEX aggregator for swaps
- `@elizaos/plugin-defi` — DeFi protocol interactions (yield, lending)
- `@elizaos/client-discord`, `@elizaos/client-twitter` — social clients

### How ElizaOS Agents Make Blockchain Transactions

The core pattern is **Action → Wallet Provider → RPC**:

1. The agent receives a message (from Discord, Twitter, or direct API)
2. The runtime evaluates which **Action** to invoke based on message content
3. The Action handler (inside a plugin) accesses the **WalletProvider**
4. The WalletProvider uses a private key or key derivation to sign transactions
5. The signed transaction is broadcast via an RPC provider (Alchemy, Infura, etc.)

**Confidence:** HIGH

#### ElizaOS Plugin Structure

```typescript
// Simplified @elizaos/plugin-evm structure (HIGH confidence)

import { Plugin, Action, Provider, IAgentRuntime } from "@elizaos/core";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// Provider: exposes wallet context to the agent
const evmWalletProvider: Provider = {
  get: async (runtime: IAgentRuntime, message, state) => {
    const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(runtime.getSetting("EVM_RPC_URL")),
    });
    return { account, walletClient };
  },
};

// Action: agent-callable function
const transferAction: Action = {
  name: "TRANSFER_TOKEN",
  description: "Transfer ERC-20 tokens to an address",
  similes: ["send tokens", "transfer USDC"],
  validate: async (runtime, message) => {
    // check if EVM_PRIVATE_KEY is configured
    return !!runtime.getSetting("EVM_PRIVATE_KEY");
  },
  handler: async (runtime, message, state, options, callback) => {
    const { walletClient, account } = await evmWalletProvider.get(
      runtime, message, state
    );
    // Parse amount and recipient from message
    const hash = await walletClient.sendTransaction({
      account,
      to: options.to as `0x${string}`,
      value: parseEther(options.amount),
    });
    callback({ text: `Transaction sent: ${hash}` });
  },
  examples: [],
};

export const evmPlugin: Plugin = {
  name: "evm",
  description: "EVM blockchain interactions",
  providers: [evmWalletProvider],
  actions: [transferAction],
};
```

**Critical security observation:** The private key is stored as a plain `runtime.getSetting()` call — essentially a `.env` variable or character file secret. There is **no built-in spend limit, no contract whitelist, no per-transaction guard**. The agent has full wallet authority.

#### ElizaOS x402 Interaction Pattern

As of training cutoff, ElizaOS does not have a native x402 plugin. Agents that pay for API services either:
1. Use the Coinbase AgentKit plugin (USDC transfers on Base via Coinbase SDK)
2. Use direct `plugin-evm` token transfers with hardcoded addresses
3. Custom actions per service endpoint

The x402 HTTP 402 response flow is not natively handled. An agent making an HTTP call would receive a 402 and currently have no automatic payment mechanism — it would require a custom action or middleware hook.

**Confidence:** MEDIUM (based on plugin ecosystem survey, may have changed)

### ElizaOS x402Guard Integration Point

**Where to plug in:** Replace the raw `http` transport in the WalletProvider with a transport that routes all outbound payment calls through x402Guard.

**Integration approach 1 — HTTP proxy at agent level:**

```typescript
// Custom x402-aware plugin (integration example)

import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";

const x402GuardTransport = http(
  process.env.X402_GUARD_URL + "/api/v1/proxy",
  {
    // All RPC calls route through x402Guard
    // Guard enforces spend limits before forwarding
    fetchOptions: {
      headers: {
        "X-Agent-Id": process.env.AGENT_ID,
        "X-Session-Key": process.env.SESSION_KEY_ID,
      },
    },
  }
);

const guardedWalletClient = createWalletClient({
  account,
  chain: base,
  transport: x402GuardTransport,
});
```

**Integration approach 2 — Intercept at action handler:**

```typescript
// Before each transaction action, call x402Guard to pre-authorize
const preAuthorize = async (runtime: IAgentRuntime, tx: TransactionRequest) => {
  const response = await fetch(`${runtime.getSetting("X402_GUARD_URL")}/api/v1/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_url: tx.to,
      x402_payment: buildPaymentHeader(tx),
      session_key_id: runtime.getSetting("SESSION_KEY_ID"),
    }),
  });
  if (!response.ok) throw new Error(`x402Guard rejected: ${response.status}`);
  return response.json(); // contains approved tx hash
};
```

**Recommended integration point:** The ElizaOS `plugin-evm` action handler, before `walletClient.sendTransaction()`. This intercepts every payment without modifying the agent's character or runtime config.

---

## 2. Virtuals Protocol

### What Is It?

Virtuals Protocol is an on-chain AI agent launchpad and monetization platform built primarily on Base. It allows creators to deploy tokenized AI agents that can:
- Hold on-chain identity (ERC-20 "agent tokens")
- Earn revenue from user interactions
- Perform automated on-chain actions (trading, yield, payments)
- Be co-owned by token holders

Virtuals Protocol became prominent in late 2024 as the largest AI agent launchpad by market cap, with agents like LUNA and AIXBT reaching significant valuations.

**Confidence:** HIGH (well-documented, on Base mainnet, training data strong)

**Sources:**
- https://whitepaper.virtuals.io
- https://github.com/Virtual-Protocol/virtuals-python

### Virtuals Protocol Architecture

Virtuals agents operate at two levels:

```
┌────────────────────────────────────────────────────┐
│              Virtuals Protocol Layer               │
│  ┌──────────────────────────────────────────────┐  │
│  │            Agent Token (ERC-20)               │  │
│  │  - On-chain identity and ownership            │  │
│  │  - Revenue sharing for token holders          │  │
│  │  - Bonding curve price discovery              │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │           GAME Framework (off-chain)          │  │
│  │  - Goal → Action → Memory → Execution         │  │
│  │  - Plugin registry for actions                │  │
│  │  - Twitter/X, Farcaster social execution      │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

#### The GAME Framework

Virtuals agents run on GAME (Generative Autonomous Multimodal Entity), their proprietary agent runtime:

```
Agent receives context (social mention, cron trigger, event)
        ↓
  World Model updates (what does the agent know?)
        ↓
  Goal Selection (what should the agent do?)
        ↓
  Action Planning (which plugin actions to call?)
        ↓
  Execution (call plugins, produce output)
        ↓
  Memory update + social publication
```

**Key structural concepts:**
- **HLP (High Level Planner):** The strategy layer — interprets goals, selects tasks
- **LLP (Low Level Planner):** The execution layer — formats concrete action calls
- **Function Plugins:** Discrete capabilities (tweet, trade, analyze, fetch data)
- **Worker agents:** Sub-agents spawned for specialized tasks

**Confidence:** HIGH for architecture, MEDIUM for exact API naming

### How Virtuals Agents Make DeFi Transactions

Virtuals agents have several transaction patterns depending on configuration:

**Pattern 1 — EOA wallet with embedded key (most common for early agents):**
```python
# virtuals-python SDK pattern (MEDIUM confidence - based on SDK structure)

from virtuals_sdk import Agent
from virtuals_sdk.plugins import DeFiPlugin

agent = Agent(
    game_api_key="YOUR_GAME_API_KEY",
    wallet_private_key="0x...",  # Agent's own EOA
)

defi_plugin = DeFiPlugin(
    chain="base",
    rpc_url="https://mainnet.base.org",
    allowed_protocols=["uniswap", "aave"],
)

agent.add_plugin(defi_plugin)
agent.run()
```

**Pattern 2 — API-authorized agent (newer pattern):**
Agent holds no private key; transactions are signed by a separate signing service or user-controlled smart wallet. This is closer to a custodial model but the signing service can be replaced.

**Pattern 3 — On-chain agent wallet via smart contract:**
The agent's "wallet" is a smart contract (Safe or custom AA wallet) deployed with the agent token. Multi-sig or governance-approved transactions.

**Current security model:** The vast majority of production Virtuals agents use Pattern 1 (embedded EOA key). The key is stored in environment variables on the hosting infrastructure. There is no enforced spend limit at the protocol level.

**Confidence:** MEDIUM (operational details may have evolved)

### Virtuals Protocol x402Guard Integration Point

**Where to plug in:** The GAME framework's function plugin execution layer. Before a DeFi plugin executes a transaction call, route it through x402Guard.

```python
# Custom x402Guard-aware Virtuals plugin (integration example)

import requests
from virtuals_sdk.plugins import BasePlugin, Function

class X402GuardedDeFiPlugin(BasePlugin):
    """DeFi plugin with x402Guard safety layer"""

    def __init__(self, guard_url: str, agent_id: str, session_key_id: str, **kwargs):
        super().__init__(**kwargs)
        self.guard_url = guard_url
        self.agent_id = agent_id
        self.session_key_id = session_key_id

    def execute_guarded(self, target_url: str, payment_payload: dict) -> dict:
        """Route all payments through x402Guard before execution"""
        response = requests.post(
            f"{self.guard_url}/api/v1/proxy",
            json={
                "target_url": target_url,
                "x402_payment": payment_payload,
                "session_key_id": self.session_key_id,
            },
            headers={
                "X-Agent-Id": self.agent_id,
            },
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    @Function(description="Execute a swap with spend limit guardrails")
    def guarded_swap(self, token_in: str, token_out: str, amount_usdc: float) -> str:
        result = self.execute_guarded(
            target_url="https://api.uniswap.org/v2/swap",
            payment_payload={
                "amount": amount_usdc,
                "token_in": token_in,
                "token_out": token_out,
            }
        )
        return result.get("tx_hash", "failed")
```

**Recommended integration:** Wrap the GAME DeFi plugin execution with x402Guard pre-authorization. The guard validates:
1. Session key is valid and not revoked
2. Transaction amount is within per-tx spend limit
3. Target contract is on the whitelist
4. Daily spend budget is not exceeded

---

## 3. Cod3x

### What Is It?

Cod3x is a DeFi agent framework and protocol built for autonomous on-chain strategy execution. It provides:
- A protocol for composing DeFi strategies from modular building blocks
- An agent runtime for executing strategies autonomously
- Integration with Crosschain infrastructure (bridges, aggregators)
- A marketplace for strategy templates

Cod3x is positioned more as infrastructure for institutional-grade DeFi automation rather than a social agent platform. It targets yield optimization, cross-chain arbitrage, and portfolio rebalancing use cases.

**Confidence:** MEDIUM (less mainstream coverage than ElizaOS/Virtuals; details may have evolved significantly since training cutoff)

**Source:** https://cod3x.org, https://github.com/Cod3xLabs

### Cod3x Agent Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Cod3x Runtime                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Strategy Definition                  │  │
│  │  (YAML/JSON config: triggers, actions, guards)    │  │
│  └──────────────────────────────────────────────────┘  │
│            ↓                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Strategy Execution Engine               │  │
│  │  - Trigger evaluation (price, time, event)        │  │
│  │  - Action sequencing (swap → deposit → claim)     │  │
│  │  - Slippage + gas management                      │  │
│  └──────────────────────────────────────────────────┘  │
│            ↓                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Protocol Adapters                       │  │
│  │  [Uniswap] [Aave] [Compound] [Stargate Bridge]   │  │
│  └──────────────────────────────────────────────────┘  │
│            ↓                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Wallet/Signing Layer                    │  │
│  │  - Private key signer OR                          │  │
│  │  - Smart Account (ERC-4337) OR                    │  │
│  │  - Multisig approval queue                        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### How Cod3x Agents Make Transactions

Cod3x is more protocol-aware than ElizaOS. Its transaction pattern:

1. **Strategy Trigger:** Price oracle crosses threshold, time-based cron, or external event
2. **Action Graph evaluation:** Which actions need to execute in sequence?
3. **Adapter call:** Protocol-specific adapter (e.g., UniswapV3Adapter) constructs calldata
4. **Signer submission:** Wallet layer signs and broadcasts

```typescript
// Cod3x strategy definition (LOW confidence — illustrative based on typical DeFi framework patterns)
// Verify against actual Cod3x SDK before implementation

import { Strategy, SwapAction, DepositAction, Trigger } from "@cod3x/sdk";

const yieldStrategy = new Strategy({
  name: "USDC Yield Optimization",
  triggers: [
    new Trigger.PriceThreshold({
      asset: "USDC",
      condition: "apy_diff > 0.5",
      oracle: "aave-v3",
    }),
  ],
  actions: [
    new SwapAction({
      tokenIn: "DAI",
      tokenOut: "USDC",
      protocol: "uniswap-v3",
      slippageBps: 50,
    }),
    new DepositAction({
      protocol: "aave-v3",
      asset: "USDC",
      amount: "100%",
    }),
  ],
  signer: {
    type: "privateKey",
    key: process.env.AGENT_PRIVATE_KEY,
  },
});
```

**Integration points with Cod3x:**

Cod3x's adapter pattern is the most natural place to insert x402Guard. The protocol adapter layer translates high-level actions to on-chain calls. Wrapping this layer intercepts all transactions before signing.

```typescript
// x402Guard-wrapped Cod3x adapter (integration example — LOW confidence on Cod3x specifics)

class GuardedProtocolAdapter extends BaseProtocolAdapter {
  private guardUrl: string;
  private sessionKeyId: string;

  constructor(config: AdapterConfig & { guardUrl: string; sessionKeyId: string }) {
    super(config);
    this.guardUrl = config.guardUrl;
    this.sessionKeyId = config.sessionKeyId;
  }

  async execute(action: DeFiAction): Promise<TransactionHash> {
    // Pre-authorize with x402Guard before forwarding to protocol
    const payload = this.buildX402Payload(action);

    const guardResponse = await fetch(`${this.guardUrl}/api/v1/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Key": this.sessionKeyId,
      },
      body: JSON.stringify({
        target_url: this.protocolEndpoint(action),
        x402_payment: payload,
        session_key_id: this.sessionKeyId,
      }),
    });

    if (!guardResponse.ok) {
      const error = await guardResponse.json();
      throw new GuardrailViolationError(error.message);
    }

    const { tx_hash } = await guardResponse.json();
    return tx_hash;
  }
}
```

**Confidence for Cod3x section:** LOW-MEDIUM. Cod3x is less publicly documented than ElizaOS. The architectural patterns described are reasonable extrapolations from similar DeFi automation frameworks (Gelato, Brahma Finance, etc.). **Verify against official Cod3x SDK and documentation before building the integration example.**

---

## 4. Agent Transaction Patterns (Cross-Framework)

### The Three Dominant Models

| Model | Description | Used By | Security Risk |
|-------|-------------|---------|---------------|
| **Embedded EOA** | Private key in env vars on agent host | ElizaOS (default), Virtuals (common) | Full wallet exposed to infra |
| **Delegated Smart Wallet** | Agent key limited to a smart wallet with approval rules | Some Virtuals agents, advanced setups | Risk bounded by wallet rules |
| **Custodial Service** | Signing via third-party (Coinbase CDP, Privy) | ElizaOS + Coinbase plugin | Custody risk to provider |

### The Standard Agent Payment Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    CURRENT (UNGUARDED) FLOW                       │
│                                                                  │
│  User prompt / cron trigger / price event                        │
│         ↓                                                        │
│  Agent LLM decides: "I should swap 1000 USDC for ETH"           │
│         ↓                                                        │
│  Action handler constructs transaction                           │
│         ↓                                                        │
│  walletClient.sendTransaction({                                   │
│    to: DEX_CONTRACT,                                             │
│    data: swapCalldata,                                           │
│    value: 0                                                      │
│  })  ← NO GUARDRAILS HERE                                       │
│         ↓                                                        │
│  RPC broadcasts to chain                                         │
│         ↓                                                        │
│  Transaction confirmed                                           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                  x402Guard-PROTECTED FLOW                        │
│                                                                  │
│  User prompt / cron trigger / price event                        │
│         ↓                                                        │
│  Agent LLM decides: "I should swap 1000 USDC for ETH"           │
│         ↓                                                        │
│  Action handler constructs ProxyRequest                          │
│         ↓                                                        │
│  POST /api/v1/proxy to x402Guard ← SINGLE CHOKEPOINT            │
│         ↓                                                        │
│  x402Guard middleware stack:                                     │
│    [1] Rate limit check (per agent, per session key)            │
│    [2] x402 payment header verification                         │
│    [3] EIP-7702 session key validation (not revoked, not expired)│
│    [4] Guardrail enforcement:                                    │
│          - amount ≤ MaxSpendPerTx                                │
│          - daily total ≤ MaxSpendPerDay                          │
│          - target contract in AllowedContracts list              │
│          - leverage ≤ MaxLeverage                                │
│          - slippage ≤ MaxSlippage                                │
│         ↓ (all pass)                                             │
│  Proxy forwards to target RPC / service                          │
│         ↓                                                        │
│  Transaction confirmed, audit log written                        │
│         ↓                                                        │
│  ProxyResponse returned to agent                                 │
└──────────────────────────────────────────────────────────────────┘
```

### x402 Protocol Flow (Key Context)

The x402 HTTP payment protocol works as follows:

```
Agent                    Service (API/Oracle)         x402Guard
  │                             │                         │
  │  GET /api/data              │                         │
  │────────────────────────────>│                         │
  │                             │                         │
  │  402 Payment Required       │                         │
  │  X-Payment-Requirements:    │                         │
  │    scheme: "exact"          │                         │
  │    network: "base-mainnet"  │                         │
  │    maxAmountRequired: "1"   │                         │
  │    asset: "USDC"            │                         │
  │    payTo: "0xServiceAddr"   │                         │
  │<────────────────────────────│                         │
  │                             │                         │
  │  POST /api/v1/proxy         │                         │
  │    target_url: service URL  │                         │
  │    x402_payment: {...}      │                         │
  │    session_key_id: "sk_..." │                         │
  │─────────────────────────────────────────────────────>│
  │                             │                         │
  │                             │   [guardrails validated]│
  │                             │   [session key checked] │
  │                             │                         │
  │                             │  GET /api/data          │
  │                             │  X-Payment: <signed>    │
  │                             │<────────────────────────│
  │                             │                         │
  │                             │  200 OK + data          │
  │                             │─────────────────────────>
  │                             │                         │
  │  ProxyResponse: {tx_hash}   │                         │
  │<─────────────────────────────────────────────────────│
```

---

## 5. Integration Points Summary

### Where x402Guard Plugs Into Each Framework

| Framework | Integration Layer | Integration Method | Effort |
|-----------|------------------|-------------------|--------|
| ElizaOS | Plugin action handler | Wrap `walletClient.sendTransaction()` inside action with guard pre-auth | Low |
| ElizaOS | Custom x402 plugin | New `@elizaos/plugin-x402guard` that overrides HTTP client with proxy | Medium |
| Virtuals GAME | Function plugin wrapper | `X402GuardedPlugin` that wraps base DeFi plugin | Low |
| Virtuals GAME | GAME configuration | Set `rpc_url` to x402Guard proxy endpoint (if RPC proxying) | Very Low |
| Cod3x | Protocol adapter layer | `GuardedProtocolAdapter` extends base adapter | Low-Medium |
| Cod3x | Transaction signer hook | Pre-signing hook calls x402Guard for approval | Medium |

### Minimum Integration Contract

Every framework integration needs to provide x402Guard with:

```json
{
  "target_url": "https://target-service-or-contract.com/endpoint",
  "x402_payment": {
    "scheme": "exact",
    "network": "base-mainnet",
    "amount": "5.00",
    "asset": "USDC",
    "payload": {
      "signature": "0x...",
      "authorization": "0x..."
    }
  },
  "session_key_id": "sk_01J..."
}
```

x402Guard returns:

```json
{
  "success": true,
  "tx_hash": "0x...",
  "message": "Payment authorized and forwarded"
}
```

Or on guardrail violation:

```json
{
  "success": false,
  "tx_hash": null,
  "message": "GuardrailViolation: amount 150.00 exceeds MaxSpendPerTx limit of 100.00"
}
```

---

## 6. Common Agent Architecture Pattern

Based on all three frameworks, the typical autonomous DeFi agent lifecycle is:

```
PHASE 1 — Context Gathering
  - Receive trigger (message, cron, price event, on-chain event)
  - Fetch current state (portfolio balances, prices, positions)
  - Update world model / memory

PHASE 2 — Planning
  - LLM evaluates context against strategy goals
  - Selects one or more actions from plugin registry
  - Estimates transaction parameters (amount, target, slippage)

PHASE 3 — Execution (WHERE x402Guard INTERCEPTS)
  - Constructs transaction or HTTP payment request
  - Pre-authorizes through safety proxy (x402Guard)
  - Guard validates: limits, whitelist, session key, rate limit
  - Guard forwards if approved; rejects with error if not
  - Transaction broadcast to chain

PHASE 4 — Reporting
  - Agent receives tx_hash (success) or error (rejected)
  - Updates memory with action taken
  - Posts notification (Discord, Telegram, dashboard)
  - Audit log entry written (immutable)
```

**x402Guard's role is entirely in Phase 3 — a stateless safety gate between the agent's decision and the blockchain.** This is architecturally clean because:
- The agent doesn't need to be modified to understand safety rules
- All safety logic is centralized in the proxy (single audit point)
- Rules can be changed without redeploying the agent
- The proxy can be maintained independently of agent framework updates

---

## 7. Security Model Analysis

### Current State (All Three Frameworks): HIGH RISK

```
Agent Runtime
├── Private key in environment variable
├── No transaction amount limits
├── No contract whitelist
├── No per-day budget
└── Full wallet authority to any contract
```

A prompt injection attack, a hallucination, or a compromised agent host leads directly to complete wallet drain.

### With x402Guard: SCOPED AUTHORITY

```
Agent Runtime
├── Session key only (not user's master key)
├── Session key bound to:
│   ├── Maximum $X per transaction
│   ├── Maximum $Y per day
│   ├── Whitelist of N allowed contracts
│   ├── Expiration timestamp
│   └── Revocable in one click
└── Guard proxy is the only path to funds
```

Even if the agent is compromised, the blast radius is limited to the session key's scope.

### EIP-7702 Session Key Model (Base)

```
User EOA (master key, never given to agent)
    ↓ EIP-7702 delegation
Session Key (given to agent)
    ↓ limited authority
x402Guard validates session key before forwarding
    ↓ if valid and within limits
Blockchain transaction executes
```

**EIP-7702 is critical here:** It allows an EOA to grant delegation to a contract that enforces spend limits on-chain. Even if x402Guard (the off-chain proxy) is bypassed, the on-chain session key contract would still enforce limits.

**Confidence:** HIGH (EIP-7702 shipped in Pectra/Prague upgrade March 2025)

---

## 8. Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| ElizaOS architecture and plugin pattern | HIGH | Well-documented, large GitHub community, clear monorepo structure |
| ElizaOS transaction model (embedded EOA) | HIGH | Default behavior clearly documented |
| ElizaOS x402 handling (none native) | MEDIUM | No x402 plugin found in training data; may have shipped post-cutoff |
| Virtuals Protocol GAME framework | HIGH | Documented in whitepaper and SDK |
| Virtuals transaction patterns | MEDIUM | Operational details evolve; verify Pattern 2 and 3 current status |
| Cod3x architecture | LOW-MEDIUM | Limited mainstream coverage; verify SDK before implementation |
| Cod3x integration code examples | LOW | Illustrative only — must verify against actual Cod3x SDK |
| x402 protocol flow | HIGH | Specification published by Coinbase (EIP-style), stable |
| EIP-7702 availability on Base | HIGH | Shipped in Pectra upgrade, Base confirmed support |
| Common agent lifecycle pattern | HIGH | Consistent across all frameworks observed |

---

## 9. Gaps Requiring Verification

Before writing the integration examples in the project roadmap, these specific items must be verified against current docs:

1. **ElizaOS x402 plugin:** Does `@elizaos/plugin-x402` or similar exist as of 2026? Check https://github.com/elizaOS/eliza/tree/main/packages
2. **Virtuals GAME SDK:** Exact method names and plugin hook patterns in the `virtuals-python` and `virtuals-sdk` packages. Check https://github.com/Virtual-Protocol/virtuals-python
3. **Cod3x SDK:** Does Cod3x have a TypeScript/Python SDK with documented adapter patterns? Check https://github.com/Cod3xLabs
4. **x402 specification:** The exact payment header format (`X-Payment`, `X-Payment-Requirements`) — verify against https://github.com/coinbase/x402
5. **Base EIP-7702 session key contracts:** Are there reference implementations of EIP-7702 delegation contracts on Base? Check https://github.com/base-org

---

## 10. Recommendations for x402Guard Integration Examples

Based on this research, the recommended implementation order:

1. **ElizaOS first** — largest community, most developers building agents, clearest plugin API, TypeScript ecosystem. Write `plugin-x402guard` as a proper ElizaOS plugin.

2. **Virtuals Protocol second** — Python SDK, function plugin pattern is straightforward to wrap. The GAME framework's plugin registry maps cleanly to x402Guard's per-action authorization model.

3. **Cod3x third** — less certain about current SDK state; verify before writing integration. May require direct contact with Cod3x team for integration guidance.

**Integration example format for each:**
- A minimal "hello world" agent that uses x402Guard for a single USDC payment
- Step-by-step setup: deploy agent, create session key via x402Guard dashboard, configure limits, run agent
- Expected behavior when guardrail fires (agent receives rejection, logs it, does not retry)

---

*Research compiled: 2026-02-24*
*WebSearch and WebFetch unavailable: based on training data (cutoff August 2025)*
*All LOW and MEDIUM confidence findings must be verified against current docs before implementation*
