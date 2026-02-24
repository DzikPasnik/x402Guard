# x402 Protocol Research

**Project:** x402Guard.dev
**Researched:** 2026-02-24
**Scope:** x402 protocol spec, implementations, payment verification, USDC/Base flow, agent integration
**Overall confidence:** MEDIUM-HIGH (training knowledge through Aug 2025 covers the April 2025 Coinbase release; network tools unavailable for live verification)

---

## 1. What Is x402?

The x402 protocol is a machine-native payment standard that revives the long-dormant HTTP 402 "Payment Required" status code. It was open-sourced by Coinbase in April 2025 at `github.com/coinbase/x402`. The core premise: a server signals it requires payment via a structured 402 response, the client (typically an AI agent) pays autonomously in USDC on-chain, attaches proof of payment, and retries — all without human intervention.

This is distinct from traditional API keys or subscription billing. Payment is per-request, on-chain, and verified cryptographically. It makes compute, data, and oracle access metered and monetizable at the HTTP layer.

### Why It Matters for x402Guard

x402Guard sits between an AI agent and x402-protected APIs. The proxy must:
1. Intercept 402 responses from upstream services
2. Parse the payment requirement
3. Validate the requirement against guardrails (amount, recipient contract)
4. Execute payment (or forward to the agent's session key)
5. Verify payment landed on-chain
6. Retry the original request with payment proof attached

---

## 2. x402 Protocol Specification

**Confidence: HIGH** — Coinbase published the spec publicly in April 2025.

### 2.1 The Three-Step Flow

```
Agent → Service: GET /api/data
Service → Agent: 402 Payment Required
                 X-Payment-Requirements: <JSON blob>

Agent pays on-chain (USDC transfer on Base)

Agent → Service: GET /api/data
                 X-Payment: <payment proof>
Service → Agent: 200 OK + data
```

### 2.2 HTTP 402 Response Headers

When a service requires payment, it returns:

```
HTTP/1.1 402 Payment Required
X-Payment-Requirements: <base64url-encoded JSON>
Content-Type: application/json
```

The `X-Payment-Requirements` value is a base64url-encoded JSON object:

```json
{
  "scheme": "exact",
  "network": "base-mainnet",
  "maxAmountRequired": "1000000",
  "resource": "https://api.example.com/data",
  "description": "Access to price feed",
  "mimeType": "application/json",
  "payTo": "0xRecipientAddress",
  "maxTimeoutSeconds": 60,
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "extra": {
    "name": "USDC",
    "version": "1"
  }
}
```

Key fields:
- `scheme` — payment scheme; `"exact"` means exact USDC amount; other schemes TBD in the spec
- `network` — chain identifier; `"base-mainnet"` or `"base-sepolia"`
- `maxAmountRequired` — amount in token minor units (USDC has 6 decimals; `"1000000"` = $1.00)
- `payTo` — recipient address (the service provider's address)
- `asset` — ERC-20 token contract address (USDC on Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- `maxTimeoutSeconds` — how long the payment proof is valid
- `resource` — the URL being paid for
- `extra` — free-form metadata (token name, EIP-712 version)

### 2.3 Payment Proof Header

After paying, the client retries with:

```
GET /api/data HTTP/1.1
X-Payment: <base64url-encoded JSON>
```

The `X-Payment` value:

```json
{
  "scheme": "exact",
  "network": "base-mainnet",
  "payload": {
    "signature": "0xabc...123",
    "authorization": {
      "from": "0xAgentAddress",
      "to": "0xRecipientAddress",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1700000000",
      "nonce": "0xDeadBeef..."
    }
  }
}
```

The `payload` under the `exact` scheme uses **EIP-3009** (`transferWithAuthorization`) — a USDC-native signed transfer authorization. The agent signs an EIP-712 message authorizing the transfer; the server submits the transaction on-chain to claim the payment.

### 2.4 Payment Schemes

The spec defines (as of mid-2025):

| Scheme | Mechanism | Notes |
|--------|-----------|-------|
| `exact` | EIP-3009 `transferWithAuthorization` | Primary scheme; USDC native; server claims on-chain |
| `usdcPermit2` | Permit2 signed transfer | Alternative; Uniswap Permit2 contract |

The `exact` scheme is the dominant one. It uses the USDC `transferWithAuthorization` function (EIP-3009), meaning the **agent signs a message offline**, the **server submits the transaction** and pays gas. This is crucial: the agent never needs ETH for gas — only USDC.

### 2.5 Facilitator Pattern

A key architectural concept: the Coinbase x402 stack defines a **Facilitator** service. The Facilitator:
- Receives a payment payload from the client (or server)
- Verifies the signature is valid
- Submits the EIP-3009 transaction on-chain
- Returns a transaction receipt

Coinbase operates a reference Facilitator at `https://api.cdp.coinbase.com/platform/v1/facilitator` (or similar). This is the entity that pays gas and submits the on-chain transaction. In a non-custodial design like x402Guard, this role is significant — see Section 4.

### 2.6 Full Protocol Sequence Diagram

```
Agent                  x402Guard             API Service          Base Chain
  |                        |                      |                    |
  |-- POST /proxy -------> |                      |                    |
  |   {target_url, ...}    |                      |                    |
  |                        |-- GET /api/data ---> |                    |
  |                        |                      |                    |
  |                        | <-- 402 Payment Req--|                    |
  |                        |   X-Payment-Req: ... |                    |
  |                        |                      |                    |
  |                   [GUARDRAIL CHECK]            |                    |
  |                   - amount <= max_spend_per_tx |                    |
  |                   - recipient in whitelist     |                    |
  |                   - session key valid/active   |                    |
  |                   - daily limit not exceeded   |                    |
  |                        |                      |                    |
  |                   [PAYMENT CONSTRUCTION]       |                    |
  |                   - Build EIP-3009 authorization|                   |
  |                   - Sign with session key      |                    |
  |                        |                      |                    |
  |                   [PAYMENT SUBMISSION]         |                    |
  |                        |-- transferWithAuth -->|                    |
  |                        |                      |-- tx submit -----> |
  |                        |                      |                    |
  |                        |                      | <-- tx confirmed - |
  |                        |                      |                    |
  |                        |-- GET /api/data ---> |                    |
  |                        |   X-Payment: ...     |                    |
  |                        |                      |                    |
  |                        | <-- 200 OK + data -- |                    |
  |                        |                      |                    |
  | <-- ProxyResponse ----- |                      |                    |
  |   {success, tx_hash}   |                      |                    |
```

---

## 3. Existing x402 Implementations

**Confidence: HIGH** — Coinbase open-sourced these in April 2025; details from GitHub knowledge through Aug 2025.

### 3.1 Coinbase x402 Monorepo (`github.com/coinbase/x402`)

The official reference implementation. Written in TypeScript. Organized as a monorepo with these key packages:

```
packages/
  x402/              # Core SDK: client, server, types
  x402-axios/        # Axios interceptor for automatic x402 handling
  x402-fetch/        # Fetch wrapper with x402 support
  x402-express/      # Express.js middleware
  x402-hono/         # Hono middleware
  x402-fastify/      # Fastify plugin
  x402-next/         # Next.js API route helpers
examples/
  typescript-server/ # Full server example
  ...
```

#### Core Package (`x402`)

The `@coinbase/x402` package exposes:

```typescript
// Server side — add payment gate to any route
import { paymentMiddleware } from '@coinbase/x402/express';

app.use(paymentMiddleware({
  amount: 0.001,          // USD amount
  currency: 'USDC',
  network: 'base-mainnet',
  address: '0xYourWallet',
}));
```

```typescript
// Client side — automatically pay when 402 received
import { withPaymentInterceptor } from '@coinbase/x402/axios';

const client = withPaymentInterceptor(axios.create(), {
  wallet: agentWallet,     // viem WalletClient
});

// This automatically handles 402s:
const response = await client.get('https://api.example.com/data');
```

```typescript
// Types (important for x402Guard Rust implementation)
interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;    // token units as string
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;                // hex address
  maxTimeoutSeconds: number;
  asset: string;                // token contract address
  extra?: Record<string, unknown>;
}

interface PaymentPayload {
  scheme: 'exact';
  network: string;
  payload: {
    signature: string;          // hex encoded
    authorization: {
      from: string;
      to: string;
      value: string;            // USDC units as string
      validAfter: string;
      validBefore: string;
      nonce: string;            // hex encoded bytes32
    };
  };
}
```

#### Facilitator Integration

The Coinbase x402 package includes a built-in facilitator client that calls `https://api.cdp.coinbase.com`. The server calls the facilitator with the payment payload; the facilitator submits the on-chain transaction and returns a receipt.

```typescript
// Server verifies payment by calling the Coinbase facilitator:
import { createFacilitator } from '@coinbase/x402/facilitator';

const facilitator = createFacilitator({
  apiKey: process.env.COINBASE_API_KEY,
});

const result = await facilitator.settle(paymentPayload);
// result.txHash — confirmed transaction
// result.success — boolean
```

### 3.2 Rust / Non-TypeScript Implementations

**Confidence: LOW** — No production Rust x402 implementation was publicly documented as of Aug 2025.

As of August 2025, there was **no official Rust x402 crate**. x402Guard will need to implement the core x402 logic in Rust. The Coinbase TypeScript implementation serves as the spec reference.

Key Rust crates needed:
- `alloy` (already in Cargo.toml) — EIP-712 signing, ERC-20 interaction, transaction submission
- `serde_json` (already present) — JSON parsing for payment headers
- `base64` — base64url encode/decode of headers
- `reqwest` (already present) — HTTP client for forwarding requests

### 3.3 Other Notable Implementations / Ecosystem

| Implementation | Language | Status (Aug 2025) | Notes |
|---------------|----------|-------------------|-------|
| `coinbase/x402` | TypeScript | Production-ready | Reference implementation |
| ElizaOS x402 plugin | TypeScript | In development | Plugin for ElizaOS agent framework |
| Hono middleware (`x402-hono`) | TypeScript | Stable | Edge-compatible |
| Express middleware (`x402-express`) | TypeScript | Stable | Node.js |
| x402Guard (this project) | Rust | In progress | Proxy/guardrail layer |

The x402 ecosystem was nascent as of mid-2025 but growing rapidly. Coinbase allocated internal teams to support adoption.

---

## 4. Payment Verification: How a Proxy Verifies x402 Payment

**Confidence: HIGH for EIP-3009 mechanics; MEDIUM for facilitator alternatives**

This is the most critical section for x402Guard's Phase 1 implementation.

### 4.1 What Must Be Verified

When x402Guard intercepts a payment, it must verify:

1. **Signature validity** — The EIP-712 signature in `X-Payment` is valid for the claimed `from` address
2. **Amount correctness** — The signed `value` matches or exceeds `maxAmountRequired`
3. **Recipient correctness** — The signed `to` address matches `payTo` in the requirements
4. **Temporal validity** — `validBefore` has not elapsed; `validAfter` has passed
5. **Nonce uniqueness** — The `nonce` has not been used before (prevents replay attacks)
6. **Authorization not already used** — On-chain: `USDC.authorizationState(from, nonce)` == `0x0`
7. **On-chain settlement** (for hard guarantees) — The transaction was confirmed on Base

### 4.2 Signature Verification (Off-Chain)

The EIP-3009 authorization is signed as an EIP-712 structured message. The domain separator for USDC on Base:

```json
{
  "name": "USD Coin",
  "version": "2",
  "chainId": 8453,
  "verifyingContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
}
```

The type hash for `TransferWithAuthorization`:

```
TransferWithAuthorization(
  address from,
  address to,
  uint256 value,
  uint256 validAfter,
  uint256 validBefore,
  bytes32 nonce
)
```

In Rust with `alloy`:

```rust
use alloy::primitives::{address, Address, U256, B256};
use alloy::signers::Signature;
use alloy::sol_types::{eip712_domain, sol, SolStruct};

// EIP-712 domain for USDC on Base mainnet
let domain = eip712_domain! {
    name: "USD Coin",
    version: "2",
    chain_id: 8453u64,
    verifying_contract: address!("833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
};

sol! {
    struct TransferWithAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }
}

let auth = TransferWithAuthorization {
    from: from_addr,
    to: to_addr,
    value: U256::from(amount),
    validAfter: U256::from(valid_after),
    validBefore: U256::from(valid_before),
    nonce: nonce_bytes,
};

let signing_hash = auth.eip712_signing_hash(&domain);
let recovered = signature.recover_address_from_prehash(&signing_hash)?;

// recovered must equal auth.from
assert_eq!(recovered, from_addr);
```

### 4.3 On-Chain Authorization State Check

Before accepting a payment, verify the nonce has not been used:

```rust
use alloy::sol;

sol! {
    #[sol(rpc)]
    interface IUSDC {
        function authorizationState(address authorizer, bytes32 nonce)
            external view returns (bool used);
    }
}

let usdc = IUSDC::new(usdc_address, provider);
let used = usdc.authorizationState(from_addr, nonce).call().await?._0;
// used must be false — if true, this payment was already claimed
```

### 4.4 Two-Phase Verification Strategy for x402Guard

x402Guard should implement a two-phase strategy:

**Phase A — Pre-forward (fast, off-chain):**
1. Decode and parse `X-Payment` header
2. Verify EIP-712 signature recovers correct `from` address
3. Check `validBefore` > now
4. Check `validAfter` <= now
5. Check `value` >= `maxAmountRequired`
6. Check `to` == `payTo`
7. Check nonce not in local Redis cache (soft replay prevention)
8. Guardrail checks against session key limits

If all pass: forward request to upstream with `X-Payment` header attached.

**Phase B — Post-forward (async, on-chain hardening):**
1. Call `USDC.authorizationState(from, nonce)` on Base RPC
2. If `true` and no tx hash in audit log: mark as potential replay, alert
3. Confirm tx hash in audit log

This keeps hot-path latency low (off-chain verification is sub-millisecond) while providing on-chain settlement confirmation asynchronously.

### 4.5 Facilitator vs Self-Serve Verification

| Approach | Description | For x402Guard |
|----------|-------------|---------------|
| **Coinbase Facilitator** | POST payment payload to Coinbase's API; they verify + settle; return tx hash | Simpler but adds Coinbase dependency |
| **Self-verify + Claim** | Parse + verify signature yourself; call `transferWithAuthorization` yourself | Fully non-custodial; x402Guard pays gas |
| **Passive Verification Only** | Verify signature; upstream service claims payment themselves | x402Guard acts as gatekeeper only |

For x402Guard's non-custodial design, **passive verification is the right model**: x402Guard verifies the payment authorization is valid, then forwards to the upstream service. The upstream service calls the Coinbase facilitator or self-settles. x402Guard's job is guardrail enforcement, not payment settlement.

This means x402Guard does NOT need to:
- Hold USDC
- Pay gas
- Submit transactions

It only needs to:
- Parse and validate the EIP-712 signature
- Enforce guardrail rules against the payment parameters
- Forward the valid (or reject the invalid) payment

---

## 5. USDC Payment Flow on Base

**Confidence: HIGH** — ERC-20 and EIP-3009 are well-specified standards; USDC on Base is production.

### 5.1 USDC Contract Addresses

| Network | Address |
|---------|---------|
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia (testnet) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

USDC on Base is a native Circle deployment (not bridged), issued by Circle's USDC contract. It implements EIP-3009 (`transferWithAuthorization`) and EIP-2612 (`permit`) natively.

### 5.2 The Three Payment Mechanisms Compared

#### Option A: Standard ERC-20 `transfer`

```solidity
// Agent calls directly:
usdc.transfer(recipient, amount);
```

- Requires agent to have ETH for gas
- Agent must be EOA or contract with USDC balance
- No meta-transaction support
- **Not used by x402** — too simple, requires gas

#### Option B: ERC-20 `approve` + `transferFrom`

```solidity
// Agent approves first:
usdc.approve(spender, amount);
// Spender pulls:
usdc.transferFrom(agent, recipient, amount);
```

- Requires two transactions (or one approve + one transferFrom)
- Agent needs ETH for approve gas
- Common in DeFi (AMMs, lending)
- **Not used by x402** — two-tx overhead, gas needed

#### Option C: EIP-3009 `transferWithAuthorization` (x402 PRIMARY)

```solidity
// Agent signs offline; anyone submits:
usdc.transferWithAuthorization(
    from,           // agent address
    to,             // recipient (service provider)
    value,          // amount in USDC minor units
    validAfter,     // unix timestamp: not valid before
    validBefore,    // unix timestamp: not valid after
    nonce,          // bytes32 random nonce (one-time use)
    v, r, s         // EIP-712 signature components
);
```

- **Agent signs offline** — no ETH needed by agent
- Anyone (facilitator, service, relayer) submits the transaction and pays gas
- Single transaction, atomic
- Nonce is bytes32 (random, not sequential) — prevents frontrunning nonce games
- `authorizationState(from, nonce)` tracks usage — prevents replay
- **This is the x402 `exact` scheme**

#### Option D: Permit2 `permitTransferFrom` (x402 `usdcPermit2` scheme)

```solidity
// Via Uniswap Permit2 contract:
permit2.permitTransferFrom(
    permit,        // SignatureTransferDetails
    transferDetails,
    owner,         // agent address
    signature      // EIP-712 signature
);
```

- Similar offline-signing pattern
- Works with any ERC-20 (not just EIP-3009-capable tokens)
- Requires Permit2 contract allowance setup first
- **Supported as alternative x402 scheme**

### 5.3 EIP-3009 Signing in Detail

The EIP-712 structured data the agent signs:

```
Domain:
  name: "USD Coin"
  version: "2"
  chainId: 8453              (Base mainnet)
  verifyingContract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

Message type: TransferWithAuthorization
  from: address              (agent's EOA or contract)
  to: address                (service provider's wallet)
  value: uint256             (amount in USDC wei, e.g. 1_000_000 = $1)
  validAfter: uint256        (0 for immediate)
  validBefore: uint256       (unix timestamp, typically now + 60s)
  nonce: bytes32             (random 32 bytes, unique per payment)
```

The signature is `keccak256(0x19 || 0x01 || domainSeparator || structHash)`.

### 5.4 Nonce Design

x402 uses **random bytes32 nonces** (not sequential). This is important for x402Guard:

```rust
use alloy::primitives::B256;
use rand::Rng;

fn generate_nonce() -> B256 {
    let mut rng = rand::thread_rng();
    let bytes: [u8; 32] = rng.gen();
    B256::from(bytes)
}
```

Random nonces prevent:
- Sequential nonce-based replay attacks
- Frontrunning (attacker can't predict next nonce)
- Nonce ordering requirements (any payment can be submitted in any order)

Used nonces are tracked on-chain in `USDC.authorizationState(from, nonce)` returning `bool`. Once used, a nonce can never be reused.

### 5.5 Gas Considerations

Since the agent signs and a facilitator submits:
- **Agent**: Signs EIP-712 message (zero gas cost)
- **Facilitator/Service**: Pays gas for `transferWithAuthorization` call

On Base mainnet, a USDC `transferWithAuthorization` costs approximately **40,000-60,000 gas**. At Base's typical gas price (~0.001 gwei during normal conditions), this is roughly $0.0001-$0.001 per payment. Negligible relative to USDC payment amounts, but the service provider bears this cost.

For x402Guard's passive verification model, **x402Guard pays zero gas** — it only verifies signatures.

---

## 6. x402 + AI Agents: Current State

**Confidence: MEDIUM** — Based on training data through Aug 2025; the space was moving fast.

### 6.1 ElizaOS Integration

ElizaOS (formerly ai16z's agent framework) was actively adding x402 support as of mid-2025. The integration model:

```typescript
// ElizaOS plugin pattern (TypeScript)
import { x402Plugin } from '@elizaos/plugin-x402';

const agent = new AgentRuntime({
  plugins: [
    x402Plugin({
      wallet: agentWallet,        // viem WalletClient with private key
      maxSpendPerRequest: 1.0,    // USD
      allowedDomains: ['api.example.com'],
    }),
  ],
});
```

The ElizaOS x402 plugin wraps the `@coinbase/x402-fetch` package, intercepting all `fetch` calls made by the agent. When a 402 is received, the plugin constructs and attaches payment automatically.

**Implication for x402Guard:** When an ElizaOS agent points its HTTP client through x402Guard (as a forward proxy), x402Guard sees the agent's `X-Payment` payloads before they reach the service. This is the integration point.

### 6.2 Virtuals Protocol

Virtuals Protocol (agent tokenization framework) had no official x402 support documented as of Aug 2025, but community integrations existed. Their agents are TypeScript/Python-based, and the `@coinbase/x402-fetch` wrapper works generically for any fetch-based HTTP client.

### 6.3 Cod3x

Cod3x agents (on-chain trading agent framework) were experimenting with x402 for oracle access as of mid-2025. No official SDK published as of Aug 2025.

### 6.4 Generic Agent Integration Pattern

Any agent that makes HTTP calls can be x402-enabled by wrapping its HTTP client:

```typescript
// Pattern 1: Fetch wrapper (most universal)
import { wrapFetchWithPayment } from '@coinbase/x402-fetch';

const fetch = wrapFetchWithPayment(globalThis.fetch, { wallet });

// Pattern 2: Axios interceptor
import { withPaymentInterceptor } from '@coinbase/x402-axios';

const axios = withPaymentInterceptor(axios.create(), { wallet });

// Pattern 3: Forward proxy (x402Guard's model)
// Agent uses standard HTTP client, pointed at proxy
// Proxy handles 402 interception + payment + retry
```

### 6.5 x402Guard's Proxy Model

x402Guard uses the **forward proxy** pattern. This is distinct from a payment interceptor library:

```
Without x402Guard:
  Agent → [x402 library] → Service
  Agent controls payment directly

With x402Guard:
  Agent → x402Guard Proxy → Service
  x402Guard enforces guardrails on every payment
  Agent's session key has scoped permissions
```

The proxy model provides safety that library-level interceptors cannot: even if the agent's internal logic is compromised, x402Guard's guardrails are enforced in an independent process.

**Configuration in agent:** The agent sets its HTTP proxy environment variable:

```bash
HTTP_PROXY=http://x402guard.example.com:3402
HTTPS_PROXY=http://x402guard.example.com:3402
```

Or explicitly in the fetch client:

```typescript
const fetch = createProxiedFetch({
  proxyUrl: 'http://x402guard.example.com:3402',
});
```

---

## 7. Header Structure Reference for Rust Implementation

This section translates the x402 spec directly into Rust types for x402Guard's middleware.

### 7.1 Rust Type Definitions

```rust
use serde::{Deserialize, Serialize};
use alloy::primitives::Address;

/// Decoded from the X-Payment-Requirements header (base64url -> JSON)
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PaymentRequirements {
    pub scheme: PaymentScheme,
    pub network: String,                  // "base-mainnet" | "base-sepolia"
    #[serde(rename = "maxAmountRequired")]
    pub max_amount_required: String,      // USDC minor units as decimal string
    pub resource: String,                 // URL being paid for
    pub description: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    #[serde(rename = "payTo")]
    pub pay_to: String,                   // hex address
    #[serde(rename = "maxTimeoutSeconds")]
    pub max_timeout_seconds: u64,
    pub asset: String,                    // USDC contract address
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PaymentScheme {
    Exact,
    UsdcPermit2,
}

/// The full payment proof sent in X-Payment header (base64url -> JSON)
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PaymentProof {
    pub scheme: PaymentScheme,
    pub network: String,
    pub payload: ExactPaymentPayload,
}

/// Payload for the "exact" scheme (EIP-3009)
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ExactPaymentPayload {
    pub signature: String,                // hex-encoded "0x..."
    pub authorization: TransferAuthorization,
}

/// The EIP-712 structured data that was signed
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TransferAuthorization {
    pub from: String,                     // hex address "0x..."
    pub to: String,                       // hex address "0x..."
    pub value: String,                    // USDC minor units as decimal string
    #[serde(rename = "validAfter")]
    pub valid_after: String,              // unix timestamp as string
    #[serde(rename = "validBefore")]
    pub valid_before: String,             // unix timestamp as string
    pub nonce: String,                    // hex-encoded bytes32 "0x..."
}
```

### 7.2 Header Parsing

```rust
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

fn parse_payment_requirements(header_value: &str) -> anyhow::Result<PaymentRequirements> {
    let decoded = URL_SAFE_NO_PAD.decode(header_value)?;
    let requirements: PaymentRequirements = serde_json::from_slice(&decoded)?;
    Ok(requirements)
}

fn parse_payment_proof(header_value: &str) -> anyhow::Result<PaymentProof> {
    let decoded = URL_SAFE_NO_PAD.decode(header_value)?;
    let proof: PaymentProof = serde_json::from_slice(&decoded)?;
    Ok(proof)
}
```

### 7.3 Signature Verification with Alloy

```rust
use alloy::primitives::{Address, B256, U256};
use alloy::signers::Signature;
use alloy::sol_types::{eip712_domain, sol, SolStruct};
use std::str::FromStr;

// USDC domain separators by network
fn usdc_domain(chain_id: u64, contract: Address) -> alloy::sol_types::Eip712Domain {
    eip712_domain! {
        name: "USD Coin",
        version: "2",
        chain_id: chain_id,
        verifying_contract: contract,
    }
}

sol! {
    struct TransferWithAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }
}

pub fn verify_payment_signature(
    proof: &ExactPaymentPayload,
    chain_id: u64,
    usdc_address: Address,
) -> anyhow::Result<Address> {
    let auth = &proof.authorization;

    let from = Address::from_str(&auth.from)?;
    let to = Address::from_str(&auth.to)?;
    let value = U256::from_str_radix(&auth.value, 10)?;
    let valid_after = U256::from_str_radix(&auth.valid_after, 10)?;
    let valid_before = U256::from_str_radix(&auth.valid_before, 10)?;
    let nonce_hex = auth.nonce.strip_prefix("0x").unwrap_or(&auth.nonce);
    let nonce = B256::from_slice(&hex::decode(nonce_hex)?);

    let struct_data = TransferWithAuthorization {
        from,
        to,
        value,
        validAfter: valid_after,
        validBefore: valid_before,
        nonce,
    };

    let domain = usdc_domain(chain_id, usdc_address);
    let signing_hash = struct_data.eip712_signing_hash(&domain);

    let sig_hex = proof.signature.strip_prefix("0x").unwrap_or(&proof.signature);
    let sig_bytes = hex::decode(sig_hex)?;
    let signature = Signature::try_from(sig_bytes.as_slice())?;

    let recovered = signature.recover_address_from_prehash(&signing_hash)?;
    Ok(recovered)
}
```

### 7.4 Temporal Validation

```rust
use std::time::{SystemTime, UNIX_EPOCH};

pub struct TemporalValidation {
    pub valid_after: u64,
    pub valid_before: u64,
}

impl TemporalValidation {
    pub fn check(&self) -> anyhow::Result<()> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs();

        if now < self.valid_after {
            anyhow::bail!("payment not yet valid (validAfter={}, now={})", self.valid_after, now);
        }
        if now >= self.valid_before {
            anyhow::bail!("payment expired (validBefore={}, now={})", self.valid_before, now);
        }
        Ok(())
    }
}
```

---

## 8. Known Pitfalls and Security Concerns

### 8.1 Replay Attack via Nonce Reuse

**Risk:** An attacker intercepts a valid `X-Payment` header and reuses it on another request.

**Prevention:**
- Track used nonces in Redis with TTL matching `validBefore` timestamp
- Before forwarding, check Redis: `SETNX nonce:{nonce_hex} 1 EX {ttl_seconds}`
- If the key already exists: reject with 402, nonce already used
- Also check `USDC.authorizationState(from, nonce)` for on-chain confirmation

**x402Guard Redis key pattern:**
```
nonce:{chain_id}:{nonce_hex}  →  "used"  EX {valid_before - now + buffer}
```

### 8.2 Time Manipulation / Clock Skew

**Risk:** Proxy server clock skew causes valid payments to be rejected or expired payments accepted.

**Prevention:**
- Add a small grace window (±30 seconds) for clock skew
- Use NTP-synchronized time
- Consider using block timestamp as reference for on-chain verification

### 8.3 Amount Underflow (Truncation Attacks)

**Risk:** Agent signs for `value = 1000000` (1 USDC) but the payment requirement is for 2 USDC. Proxy accepts because guardrail checks `value >= maxAmountRequired` but mis-parses string as float.

**Prevention:**
- Parse all amounts as `U256` (integer), never float
- Verify `value >= maxAmountRequired` in integer arithmetic
- Treat amounts as USDC minor units (6 decimal places) consistently

### 8.4 Network Mismatch

**Risk:** Payment signed for `base-sepolia` is forwarded to `base-mainnet` service.

**Prevention:**
- Verify `proof.network == requirements.network`
- Verify the USDC contract address matches the expected address for that network
- Maintain a hardcoded map of `{network -> usdc_address -> chain_id}`

### 8.5 Recipient Address Spoofing

**Risk:** Malicious API service returns a `payTo` address the agent shouldn't be paying.

**Prevention (x402Guard guardrail):**
- `AllowedContracts` guardrail rule should include expected `payTo` addresses
- Alert when an unknown `payTo` address appears in a 402 response
- Consider per-agent domain allowlists for trusted API providers

### 8.6 Double-Payment Risk

**Risk:** x402Guard receives a 402, pays, forwards, gets 402 again (service bug or attack), pays again.

**Prevention:**
- Per-request payment state machine: track `(agent_id, request_id, nonce)` in Redis
- Maximum one payment attempt per proxy request
- Expose `X-Request-ID` to tie payments to original requests

### 8.7 Facilitator Centralization Risk

**Risk:** Coinbase's facilitator service is a single point of failure/trust.

**For x402Guard:** Since x402Guard does passive verification only (not settlement), this risk is on the service side, not x402Guard's. However, if x402Guard were to do self-settlement, it would need fallback facilitator options or self-hosted settlement.

---

## 9. Implementation Roadmap for x402Guard Phase 1

Based on this research, the Phase 1 x402 implementation in `proxy/src/middleware/x402.rs` should:

### Step 1: Dependency Additions

Add to `Cargo.toml`:
```toml
base64 = "0.22"
hex = "0.4"
alloy = { version = "0.12", features = ["full"] }  # already present
```

### Step 2: Core Types Module

Create `proxy/src/x402/types.rs`:
- `PaymentRequirements` struct
- `PaymentProof` struct
- `ExactPaymentPayload` struct
- `TransferAuthorization` struct
- `PaymentScheme` enum
- Network/address constants

### Step 3: Verification Logic

Create `proxy/src/x402/verify.rs`:
- `parse_requirements_header(header: &str) -> Result<PaymentRequirements>`
- `parse_payment_header(header: &str) -> Result<PaymentProof>`
- `verify_signature(proof, chain_id, usdc_address) -> Result<Address>`
- `verify_temporal(auth) -> Result<()>`
- `verify_amount(proof_value, required) -> Result<()>`
- `verify_recipient(proof_to, required_pay_to) -> Result<()>`
- `verify_network(proof_network, required_network) -> Result<()>`

### Step 4: Nonce Tracking

Create `proxy/src/x402/nonce.rs`:
- `check_and_mark_nonce(redis, chain_id, nonce, ttl) -> Result<bool>`
- Uses Redis `SET NX EX` for atomic check-and-set

### Step 5: Middleware Integration

Update `proxy/src/middleware/x402.rs`:
- Tower middleware layer that:
  1. Inspects outgoing request for `X-Payment` header
  2. Parses and verifies signature
  3. Checks nonce (Redis)
  4. Validates temporal bounds
  5. Returns `AppError::Unauthorized` if invalid
  6. Passes to guardrails middleware if valid

---

## 10. Key URLs and References

Note: Network access was unavailable during this research session. The following sources are referenced from training knowledge (through August 2025).

| Source | URL | Confidence |
|--------|-----|------------|
| Coinbase x402 GitHub | `https://github.com/coinbase/x402` | HIGH — publicly released April 2025 |
| x402 Spec Site | `https://x402.org` | HIGH — official spec site |
| EIP-3009 Standard | `https://eips.ethereum.org/EIPS/eip-3009` | HIGH — finalized standard |
| EIP-2612 Standard | `https://eips.ethereum.org/EIPS/eip-2612` | HIGH — finalized standard |
| EIP-712 Standard | `https://eips.ethereum.org/EIPS/eip-712` | HIGH — finalized standard |
| USDC on Base | `https://developers.circle.com/stablecoins/docs/usdc-on-base` | HIGH |
| Alloy EIP-712 docs | `https://docs.rs/alloy/latest/alloy/sol_types/` | HIGH |
| Coinbase CDP Docs | `https://docs.cdp.coinbase.com/x402` | MEDIUM — docs may have evolved |

---

## 11. Confidence Summary

| Area | Confidence | Notes |
|------|------------|-------|
| x402 HTTP flow (3-step) | HIGH | Core protocol well-documented in training data |
| Header format / JSON schema | HIGH | Published by Coinbase April 2025 |
| EIP-3009 signing mechanics | HIGH | Finalized EIP, USDC implements it |
| USDC contract addresses | HIGH | Public on-chain, verifiable |
| Coinbase TypeScript SDK structure | HIGH | Open-sourced April 2025 |
| Rust implementation examples | MEDIUM | alloy API verified through Aug 2025; minor API changes possible |
| ElizaOS x402 integration | MEDIUM | In-development as of Aug 2025; may have shipped or changed |
| Virtuals/Cod3x x402 | LOW | No official SDK as of Aug 2025 |
| Facilitator API details | MEDIUM | Internal API may have changed since training |
| `usdcPermit2` scheme details | MEDIUM | Spec existed but less documented than `exact` |

---

*Research conducted: 2026-02-24. Network tools unavailable; based on training knowledge through August 2025. Recommend verifying against live `github.com/coinbase/x402` README and x402.org spec before implementation.*
