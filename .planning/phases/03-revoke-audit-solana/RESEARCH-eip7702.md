# Phase 3: EIP-7702 Session Key Revocation - Research

**Researched:** 2026-02-28
**Domain:** EIP-7702 delegation revocation, alloy Rust crate, on-chain vs off-chain revocation patterns
**Confidence:** HIGH for EIP-7702 spec mechanics, MEDIUM for alloy 0.12 API specifics, MEDIUM for gas estimates

> **Tool limitation:** WebSearch and WebFetch were unavailable during this research session. Findings are based on: (1) existing project research at `.planning/research/eip7702-session-keys.md`, (2) current codebase analysis, and (3) training data (cutoff May 2025). EIP-7702 shipped in Ethereum Pectra (May 7, 2025) and is finalized spec. Alloy 0.12 API details should be verified against current crate docs before implementation.

---

## Summary

Phase 3 requires two revocation features: individual session key revocation (FR-3.4) and one-click revoke-ALL (FR-3.5). The current codebase already has `repo::session_keys::revoke()` which sets `is_revoked = true` in PostgreSQL, and the proxy middleware checks this flag before forwarding any transaction. The question is whether on-chain EIP-7702 revocation is also needed.

**The proxy-first architecture of x402Guard means DB revocation IS the critical path.** Since all agent transactions flow through the proxy, and the proxy checks `is_revoked` in PostgreSQL before forwarding, revoking in DB is immediately effective for all proxy-routed traffic. On-chain revocation via EIP-7702 zero-address delegation is a defense-in-depth measure for the case where an agent bypasses the proxy and attempts to use a leaked session key directly on-chain.

**Primary recommendation:** Implement a two-layer revocation strategy: (1) immediate DB-level revocation (already exists for individual keys, needs a `revoke_all` batch endpoint), and (2) optional on-chain EIP-7702 zero-address delegation for users who want belt-and-suspenders protection. The on-chain path requires additional alloy features and an RPC provider connection, making it a SHOULD-level enhancement rather than a hard requirement for Phase 3 MVP.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FR-3.4 | Revoke individual session keys | DB revocation already implemented in `repo::session_keys::revoke()`. Phase 3 adds: on-chain soft revoke via `removeSessionKey()` call on the validator contract, and audit log event emission. |
| FR-3.5 | Revoke ALL session keys for an agent (one-click via zero-address delegation) | New `repo::session_keys::revoke_all_by_agent()` for DB batch revocation. Optional on-chain EIP-7702 zero-address authorization for full chain-level kill switch. |
</phase_requirements>

---

## 1. EIP-7702 Revocation Mechanics

### How Delegation Revocation Works (from finalized EIP spec)

**Confidence: HIGH** -- This is canonical spec behavior, verified in existing project research.

EIP-7702 delegation is set by including a signed authorization tuple in a Type 4 transaction. The authorization format:

```
Authorization = (chain_id, address, nonce, y_parity, r, s)
```

The signed message (what the EOA signs):
```
keccak256(0x05 || rlp([chain_id, address, nonce]))
```

**To revoke all delegation:** Sign an authorization where `address = 0x0000000000000000000000000000000000000000` (zero address). This clears the `0xEF0100 || impl_address` bytecode from the EOA, restoring it to a plain EOA. All session keys enforced by the validator contract become immediately inert because the validator code no longer executes when the EOA is called.

**To revoke a single session key on-chain:** Call `removeSessionKey(sessionKeyAddress)` on the validator contract (which runs in the EOA's storage context). This sets `isRevoked = true` in the on-chain policy storage.

### Revocation Comparison Table

| Mechanism | Scope | Speed | Gas Cost | Requires EOA Key | Proxy Bypass Safe |
|-----------|-------|-------|----------|-------------------|-------------------|
| DB `is_revoked = true` | Single key | Instant | None | No | NO -- only if traffic goes through proxy |
| DB batch `SET is_revoked = true WHERE agent_id = X` | All keys for agent | Instant | None | No | NO -- same limitation |
| On-chain `removeSessionKey(addr)` | Single key | Next block (~2s on Base) | ~30-50k gas | Yes (or delegated call) | YES |
| On-chain zero-address delegation (EIP-7702) | ALL keys | Next block (~2s on Base) | ~25k gas base + per-auth overhead | Yes | YES |
| Deactivate agent (`is_active = false`) | All proxy access | Instant | None | No | NO |

### Key Insight: When Does On-Chain Revocation Matter?

On-chain revocation only matters if a session key holder can bypass the x402Guard proxy and interact directly with the delegated EOA on-chain. This scenario requires:

1. The agent has the session private key (always true -- that's how agents operate)
2. The agent knows the validator contract address and ABI (discoverable on-chain)
3. The agent constructs and submits a `executeSessionKeyOp` transaction directly to Base RPC

**For Security Level 10 (DeFi handling real money):** On-chain revocation IS needed as defense-in-depth. A compromised agent could absolutely bypass the proxy. The proxy is a convenience/enforcement layer, not a cryptographic barrier. The on-chain validator contract is the true security boundary.

---

## 2. Current Codebase State

### What Already Exists

| Component | Status | File |
|-----------|--------|------|
| Individual key revocation (DB) | COMPLETE | `proxy/src/repo/session_keys.rs::revoke()` |
| Session key verification middleware | COMPLETE | `proxy/src/middleware/eip7702.rs` |
| Revoke API endpoint (single key) | COMPLETE | `proxy/src/handlers/session_keys.rs` DELETE `/agents/{agent_id}/session-keys/{key_id}` |
| Agent deactivation | COMPLETE (field exists) | `proxy/src/models/agent.rs` has `is_active` |
| Revoke-all batch (DB) | NOT STARTED | Needs `repo::session_keys::revoke_all_by_agent()` |
| Revoke-all API endpoint | NOT STARTED | Needs POST `/agents/{agent_id}/revoke-all` |
| On-chain revocation (single key) | NOT STARTED | Needs alloy provider + contract call |
| On-chain revocation (zero-address) | NOT STARTED | Needs alloy EIP-7702 type-4 tx construction |
| Audit log for revocation events | NOT STARTED | Phase 3 scope (FR-6.3) |

### What Needs To Be Built

**Tier 1 (MUST -- immediate safety):**
1. `repo::session_keys::revoke_all_by_agent(pool, agent_id)` -- batch SQL UPDATE
2. `POST /api/v1/agents/{agent_id}/revoke-all` endpoint
3. Audit log event for both individual and batch revocations
4. Deactivate agent on revoke-all (set `is_active = false` alongside key revocation)

**Tier 2 (SHOULD -- defense-in-depth for Security Level 10):**
5. On-chain `removeSessionKey()` call when individual key is revoked via API
6. On-chain EIP-7702 zero-address delegation when revoke-all is triggered
7. Alloy provider integration (requires additional crate features)

---

## 3. Alloy 0.12 EIP-7702 Support

### Current Feature Set

The project uses:
```toml
alloy = { version = "0.12", features = ["sol-types", "signers", "signer-local"] }
```

This provides:
- `alloy::primitives` -- Address, U256, B256, etc.
- `alloy::sol_types` / `alloy::sol!` macro -- Solidity type encoding
- `alloy::signers` -- Signer traits
- `alloy::signers::local::PrivateKeySigner` -- Local key signing

### Additional Features Needed for On-Chain Revocation

**Confidence: MEDIUM** -- Based on alloy crate structure as of training data. Feature names may have changed in 0.12.x. Verify against `Cargo.toml` of `alloy-rs/alloy` at the pinned version.

For constructing and sending EIP-7702 Type 4 transactions, the following additional features are likely needed:

```toml
alloy = { version = "0.12", features = [
    "sol-types",
    "signers",
    "signer-local",
    # Additional features for on-chain interaction:
    "providers",        # Provider trait, ProviderBuilder
    "network",          # EthereumWallet, network types
    "rpc-types",        # TransactionRequest, Authorization, SignedAuthorization
    "consensus",        # TxEip7702, transaction types
    "transport-http",   # HTTP transport for RPC
] }
```

**WARNING:** The `"providers"` and `"transport-http"` features may pull in additional dependencies including `reqwest` (which the project already uses) and potentially `hyper`. The `"consensus"` feature includes `alloy-consensus` which had the `serde_core` issue that required pinning serde to `=1.0.219`. Test compilation in Docker before committing to these features.

**CRITICAL CONSTRAINT:** The project explicitly avoids `"full"` features to prevent the `blst` C dependency. Any feature additions must be tested to ensure they don't transitively pull in `blst` or other C dependencies that require MSVC/gcc.

### Key Types for EIP-7702 in Alloy

Based on alloy crate structure (verify against 0.12 docs):

```rust
// Authorization for EIP-7702 -- the unsigned authorization tuple
// Located in alloy-eips or alloy-consensus
pub struct Authorization {
    pub chain_id: U256,   // or u64 in newer versions
    pub address: Address, // implementation contract (or zero for revocation)
    pub nonce: u64,       // EOA's current nonce
}

// Signed authorization (after EOA signs it)
pub struct SignedAuthorization {
    // inner authorization + ECDSA signature components
}

// The signer trait should provide:
// PrivateKeySigner::sign_authorization(auth) -> SignedAuthorization

// TransactionRequest for sending type-4 transactions
pub struct TransactionRequest {
    pub to: Option<TxKind>,
    pub input: TransactionInput,
    pub authorization_list: Option<Vec<SignedAuthorization>>,
    // ... standard EIP-1559 fields
}
```

### Alternative: Minimal On-Chain Interaction Without Full Provider

If adding `"providers"` + `"transport-http"` causes dependency bloat or `blst` issues, an alternative approach:

1. **Construct the raw transaction bytes** using `alloy-consensus` types (TxEip7702)
2. **Sign it** using `alloy-signers`
3. **Send it** via `reqwest` directly to the Base RPC endpoint (`eth_sendRawTransaction`)

This avoids the full alloy provider stack and uses the project's existing `reqwest` dependency:

```rust
use reqwest::Client;
use serde_json::json;

async fn send_raw_tx(rpc_url: &str, signed_tx_hex: &str) -> anyhow::Result<String> {
    let client = Client::new();
    let resp = client.post(rpc_url)
        .json(&json!({
            "jsonrpc": "2.0",
            "method": "eth_sendRawTransaction",
            "params": [signed_tx_hex],
            "id": 1
        }))
        .send()
        .await?;
    // Parse response for tx hash
    let body: serde_json::Value = resp.json().await?;
    let tx_hash = body["result"].as_str()
        .ok_or_else(|| anyhow::anyhow!("RPC error: {:?}", body["error"]))?;
    Ok(tx_hash.to_string())
}
```

**Recommendation:** Try the provider-based approach first. If it causes build issues in Docker, fall back to raw `reqwest` + `eth_sendRawTransaction`.

---

## 4. Architecture: Two-Layer Revocation

### Recommended Design

```
User clicks "Revoke All"
        |
        v
  [Revoke API Endpoint]
        |
        +---> [Layer 1: DB Revocation] (synchronous, MUST succeed)
        |     - UPDATE session_keys SET is_revoked = true WHERE agent_id = $1
        |     - UPDATE agents SET is_active = false WHERE id = $1
        |     - INSERT audit_log event
        |     - Return 200 to user immediately
        |
        +---> [Layer 2: On-Chain Revocation] (async, best-effort)
              - Construct zero-address EIP-7702 authorization
              - Submit Type-4 transaction to Base RPC
              - Record tx_hash in audit log
              - If RPC fails: log warning, queue for retry
              - Does NOT block the API response
```

### Why Layer 1 (DB) is Synchronous and Layer 2 (On-Chain) is Async

1. **DB revocation is instant** -- the proxy checks `is_revoked` on every request. Once set, no proxy-routed traffic can use the key.
2. **On-chain transactions take time** -- even on Base (~2 second block time), there's latency. The user should not wait for block confirmation.
3. **On-chain can fail** -- RPC could be down, gas price could spike. DB revocation must not be blocked by on-chain failure.
4. **DB revocation covers 99% of cases** -- agents use the proxy. On-chain is only for the edge case of proxy bypass.

### Security Analysis of This Design

**Attack scenario:** Agent is compromised. Attacker has session private key. User clicks "Revoke All."

- **Without on-chain revocation:** Attacker can bypass proxy and call `executeSessionKeyOp` directly on-chain until the session key expires naturally. Risk window = time until expiry.
- **With on-chain revocation (zero-address):** Attacker's window is ~2-4 seconds (one Base block). After that, the delegation is cleared and direct on-chain calls fail.
- **With DB revocation only:** Risk if attacker bypasses proxy, but all proxy-routed traffic is immediately blocked.

**Recommendation for Security Level 10:** Implement both layers. The on-chain layer should be async/best-effort but logged. If it fails, surface a warning to the user ("DB revocation complete, on-chain revocation pending -- retry recommended").

---

## 5. Implementation Patterns

### 5.1 Batch DB Revocation (Tier 1)

Add to `proxy/src/repo/session_keys.rs`:

```rust
/// SECURITY: Revoke ALL active session keys for an agent.
/// Returns the count of keys revoked for audit logging.
pub async fn revoke_all_by_agent(pool: &PgPool, agent_id: Uuid) -> Result<u64> {
    let result = sqlx::query(
        "UPDATE session_keys SET is_revoked = true \
         WHERE agent_id = $1 AND is_revoked = false"
    )
    .bind(agent_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}
```

### 5.2 Revoke-All API Endpoint (Tier 1)

Add to `proxy/src/handlers/session_keys.rs` or a new `proxy/src/handlers/revocation.rs`:

```rust
#[derive(Debug, Serialize)]
pub struct RevokeAllResponse {
    pub success: bool,
    pub keys_revoked: u64,
    pub agent_deactivated: bool,
    pub on_chain_tx_hash: Option<String>,
    pub message: String,
}

async fn revoke_all_keys(
    State(state): State<AppState>,
    Path(agent_id): Path<Uuid>,
) -> Result<Json<RevokeAllResponse>, AppError> {
    // 1. Verify agent exists
    let agent = repo::agents::find_by_id(&state.db, agent_id)
        .await
        .map_err(|e| AppError::Internal(e))?
        .ok_or_else(|| AppError::NotFound(format!("agent {} not found", agent_id)))?;

    // 2. DB revocation (synchronous, must succeed)
    let keys_revoked = repo::session_keys::revoke_all_by_agent(&state.db, agent_id)
        .await
        .map_err(|e| AppError::Internal(e))?;

    // 3. Deactivate agent
    repo::agents::deactivate(&state.db, agent_id)
        .await
        .map_err(|e| AppError::Internal(e))?;

    // 4. Audit log (Phase 3 FR-6.3)
    // repo::audit_log::record_revoke_all(&state.db, agent_id, keys_revoked).await?;

    // 5. On-chain revocation (async, best-effort) -- Tier 2
    // tokio::spawn(async move { ... submit zero-address authorization ... });

    Ok(Json(RevokeAllResponse {
        success: true,
        keys_revoked,
        agent_deactivated: true,
        on_chain_tx_hash: None, // populated when Tier 2 implemented
        message: format!("revoked {} session keys and deactivated agent", keys_revoked),
    }))
}
```

### 5.3 On-Chain Zero-Address Delegation (Tier 2)

**Confidence: MEDIUM** -- alloy API details need verification.

```rust
use alloy::primitives::{Address, U256};

/// Construct and submit an EIP-7702 zero-address authorization
/// to revoke all delegation for the given EOA.
///
/// SECURITY: This requires the EOA owner's private key.
/// The proxy does NOT hold user private keys.
/// This function is called when the user provides a signed authorization
/// via the dashboard/API, OR when the proxy holds a designated hot key
/// for emergency revocation.
pub async fn submit_revoke_delegation(
    rpc_url: &str,
    signed_authorization: SignedAuthorization, // user-signed, address = 0x0
) -> anyhow::Result<String> {
    // Option A: Full alloy provider
    // let provider = ProviderBuilder::new()
    //     .with_recommended_fillers()
    //     .on_http(rpc_url.parse()?);
    //
    // let tx = TransactionRequest::default()
    //     .with_authorization_list(vec![signed_authorization]);
    //
    // let pending = provider.send_transaction(tx).await?;
    // let receipt = pending.get_receipt().await?;
    // Ok(format!("{:?}", receipt.transaction_hash))

    // Option B: Raw reqwest (if alloy provider features cause build issues)
    // See Section 3 above for the raw approach
    todo!("implement after verifying alloy features compile in Docker")
}
```

### 5.4 User-Signed Revocation Flow (Non-Custodial)

**Critical design decision:** The proxy is NON-CUSTODIAL. It does NOT hold user private keys. Therefore, for on-chain revocation, the user must sign the zero-address authorization themselves.

**Flow for Dashboard (Phase 4):**
1. User clicks "Revoke All" in dashboard
2. Dashboard calls API: `POST /api/v1/agents/{id}/revoke-all`
3. API performs DB revocation immediately (returns success)
4. Dashboard then prompts user's wallet (MetaMask/RainbowKit) to sign an EIP-7702 authorization with `address = 0x0`
5. Dashboard submits the Type-4 transaction via the user's wallet
6. Dashboard reports on-chain confirmation back to API for audit logging

**Flow for API-Only (no wallet):**
1. Agent/user calls `POST /api/v1/agents/{id}/revoke-all`
2. API performs DB revocation
3. API returns: `{ on_chain_required: true, authorization_to_sign: { chain_id, address: "0x0", nonce: <eoa_nonce> } }`
4. Caller signs the authorization off-band and submits separately
5. OR: If the proxy is configured with an emergency revocation key for the EOA (explicit opt-in), the proxy submits on-chain directly

**Recommendation:** For Phase 3, implement DB revocation and return the unsigned authorization data. Defer the full on-chain submission to Phase 4 dashboard integration where the user's wallet is available.

---

## 6. Gas Costs on Base

**Confidence: MEDIUM** -- estimates from training data, verify on Base Sepolia.

### EIP-7702 Transaction Gas Components

| Component | Gas Cost (approximate) |
|-----------|----------------------|
| Base transaction cost (type 4) | 21,000 |
| Per authorization in list | 12,500 (PER_EMPTY_ACCOUNT_COST) or 2,500 (if account already warm) |
| Calldata (per non-zero byte) | 16 |
| Calldata (per zero byte) | 4 |
| Contract execution (removeSessionKey) | ~30,000-50,000 (storage write) |

### Estimated Costs on Base

Base L2 has two cost components:
1. **L2 execution gas:** Very cheap (~0.001 gwei base fee typical)
2. **L1 data fee:** Proportional to calldata posted to Ethereum L1

For a zero-address delegation revocation (minimal calldata):
- L2 gas: ~25,000-35,000 gas at ~0.001 gwei = negligible
- L1 data: ~100-200 bytes * L1 blob fee = typically $0.001-$0.01
- **Total estimated cost: < $0.05 per revocation**

For a `removeSessionKey(address)` call:
- L2 gas: ~50,000-70,000 gas
- L1 data: ~200-300 bytes
- **Total estimated cost: < $0.10 per revocation**

**Conclusion:** Gas costs on Base are negligible for revocation operations. Cost is not a barrier to on-chain revocation.

---

## 7. Common Pitfalls

### Pitfall 1: Revocation Race Condition
**What goes wrong:** User revokes a session key. In the ~2 second window before the on-chain revocation confirms, a compromised agent sends a transaction directly to the validator contract.
**Why it happens:** On-chain state is only updated after block inclusion.
**How to avoid:** DB revocation happens first and blocks all proxy-routed traffic immediately. For direct on-chain bypass, the 2-second window is the minimum achievable latency. Accept this as the security model -- it's equivalent to any other on-chain operation's finality window.
**Warning signs:** Audit logs showing transactions AFTER revocation timestamp but BEFORE on-chain confirmation.

### Pitfall 2: Nonce Mismatch on Authorization
**What goes wrong:** The signed authorization includes the EOA's nonce at signing time. If the EOA sends any other transaction between signing and submission, the nonce advances and the authorization becomes invalid.
**Why it happens:** EIP-7702 uses the EOA's account nonce for replay protection in the authorization itself.
**How to avoid:** Fetch the EOA's current nonce (`eth_getTransactionCount`) immediately before signing. Submit the Type-4 transaction promptly. Do not batch other transactions from the same EOA between signing and submission.

### Pitfall 3: Assuming DB Revocation is Sufficient
**What goes wrong:** A compromised agent bypasses the proxy and interacts with the delegated EOA directly on-chain, spending USDC despite being "revoked" in the DB.
**Why it happens:** DB revocation only affects the proxy's enforcement. The on-chain validator contract has its own independent state.
**How to avoid:** Implement both layers. Log warnings when on-chain revocation fails. Consider the `is_revoked` DB flag as the "fast path" and on-chain revocation as the "secure path."

### Pitfall 4: alloy Feature Bloat
**What goes wrong:** Adding alloy features for provider/transport pulls in the `blst` crate via transitive dependencies, breaking Docker builds.
**Why it happens:** Some alloy features (especially related to consensus/beacon chain) depend on BLS cryptography.
**How to avoid:** Add features incrementally. Test each addition in Docker. Use `cargo tree -i blst` to check if `blst` appears in the dependency tree. If it does, use the raw `reqwest` fallback approach.

### Pitfall 5: Non-Custodial Violation
**What goes wrong:** Someone designs the revocation endpoint to submit on-chain transactions using a key the proxy holds, making the proxy custodial.
**Why it happens:** It's simpler to have the proxy sign and submit directly.
**How to avoid:** The proxy NEVER holds user EOA keys. On-chain revocation requires a user-signed authorization. The API returns unsigned authorization data; the client-side wallet signs it. The only exception is if the user explicitly grants an emergency revocation key to the proxy (opt-in, documented, auditable).

---

## 8. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EIP-7702 authorization signing | Custom ECDSA + RLP encoding | `alloy::signers::Signer::sign_authorization()` | Subtle encoding rules (0x05 prefix, RLP format), easy to get wrong |
| Transaction nonce management | Manual nonce tracking | Alloy provider's nonce manager or `eth_getTransactionCount` | Race conditions with concurrent transactions |
| EIP-712 typed data hashing | Manual keccak + abi.encode | `alloy::sol_types::SolStruct::eip712_hash_struct()` | Already used in the project for EIP-3009, consistent approach |
| Hex/RLP encoding | Manual byte manipulation | `alloy::primitives` encoding utilities | Off-by-one errors, endianness issues |
| Gas estimation | Hardcoded gas limits | `eth_estimateGas` RPC call or alloy provider's gas estimation | Gas costs change with EVM upgrades, hardcoding is fragile |

---

## 9. Architecture Patterns

### Recommended File Structure for Phase 3 Revocation

```
proxy/src/
  handlers/
    session_keys.rs     # EXISTING -- add revoke_all_keys handler
    OR
    revocation.rs       # NEW -- dedicated revocation handlers
  middleware/
    eip7702.rs          # EXISTING -- add on-chain revocation functions
  repo/
    session_keys.rs     # EXISTING -- add revoke_all_by_agent()
    agents.rs           # EXISTING -- add deactivate()
    audit_log.rs        # NEW -- append-only audit log repository
  services/
    revocation.rs       # NEW -- orchestrates DB + on-chain revocation
    chain.rs            # NEW -- alloy provider setup, RPC interaction
```

### Pattern: Service Layer for Multi-Step Operations

Revocation involves multiple coordinated steps (DB update, agent deactivation, audit log, on-chain tx). This warrants a service layer rather than putting all logic in the handler:

```rust
// proxy/src/services/revocation.rs

pub struct RevocationResult {
    pub keys_revoked: u64,
    pub agent_deactivated: bool,
    pub on_chain_status: OnChainStatus,
}

pub enum OnChainStatus {
    NotAttempted,           // Feature not enabled or no RPC configured
    Submitted(String),      // tx_hash
    Failed(String),         // error message
    UserActionRequired {    // Non-custodial: user must sign
        chain_id: u64,
        nonce: u64,
    },
}

pub async fn revoke_all(
    db: &PgPool,
    agent_id: Uuid,
    // Optional: on-chain config
    chain_config: Option<&ChainConfig>,
) -> Result<RevocationResult> {
    // 1. DB revocation (must succeed)
    let keys_revoked = repo::session_keys::revoke_all_by_agent(db, agent_id).await?;

    // 2. Agent deactivation
    repo::agents::deactivate(db, agent_id).await?;

    // 3. On-chain (if configured)
    let on_chain_status = match chain_config {
        Some(config) => {
            // Return unsigned authorization for user to sign
            OnChainStatus::UserActionRequired {
                chain_id: config.chain_id,
                nonce: get_eoa_nonce(config, agent_id).await?,
            }
        }
        None => OnChainStatus::NotAttempted,
    };

    Ok(RevocationResult {
        keys_revoked,
        agent_deactivated: true,
        on_chain_status,
    })
}
```

### Anti-Patterns to Avoid

- **Blocking API response on on-chain confirmation:** The user should not wait for a block to confirm. DB revocation is the immediate protection.
- **Holding EOA keys in the proxy:** Violates the non-custodial guarantee. Always return unsigned data for client-side signing.
- **Skipping audit logs on revocation:** Every revocation must be logged (FR-6.3). This is append-only and immutable.
- **Revoking without cross-agent auth check:** The existing pattern (`revoke(pool, id, agent_id)`) correctly requires both key_id AND agent_id. The new `revoke_all_by_agent` must also verify the caller owns the agent.

---

## 10. State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EIP-3074 AUTH/AUTHCALL | EIP-7702 Set Code | May 2025 (Pectra) | 3074 was never deployed; 7702 is live |
| ethers-rs for Rust Ethereum | alloy-rs | 2024-2025 | alloy is the canonical Rust Ethereum library |
| Smart contract wallets (separate address) | EIP-7702 (EOA becomes smart wallet) | May 2025 | Same address, no migration needed |
| Manual RLP encoding for tx types | alloy's typed transaction builders | alloy 0.1+ | Less error-prone, type-safe |

---

## 11. Open Questions

### Q1: Which alloy 0.12 features are safe to add?
- **What we know:** `sol-types`, `signers`, `signer-local` compile cleanly. The project avoids `"full"` to prevent `blst`.
- **What's unclear:** Whether `"providers"`, `"consensus"`, `"transport-http"` transitively pull in `blst` or other C deps.
- **Recommendation:** Test in Docker incrementally. Add `"consensus"` first (needed for `TxEip7702` types). Then `"rpc-types"`. Then `"providers"` + `"transport-http"`. Run `cargo tree -i blst` after each to verify. If any pulls in `blst`, use the raw `reqwest` + `eth_sendRawTransaction` fallback.

### Q2: Does the proxy need its own alloy Provider for read operations?
- **What we know:** To fetch EOA nonce (`eth_getTransactionCount`) and check delegation status (`eth_getCode`), the proxy needs RPC access.
- **What's unclear:** Whether this should use alloy Provider or raw `reqwest` to the RPC URL (already in config as `base_sepolia_rpc_url` / `base_mainnet_rpc_url`).
- **Recommendation:** Start with raw `reqwest` JSON-RPC calls for simple reads (nonce, code). This adds zero new dependencies. Upgrade to alloy Provider later if needed for more complex interactions.

### Q3: Should `revoke_all` also clear Redis-cached session key data?
- **What we know:** The project uses Redis for rate limiting and nonce dedup. Session key data lives in PostgreSQL.
- **What's unclear:** Whether there's any Redis-cached session key state that becomes stale after revocation.
- **Recommendation:** Check if any Redis keys are cached for session key policies. If so, invalidate them on revocation. The current code does not appear to cache session keys in Redis (only rate limits and nonces).

### Q4: How to handle revoke-all for an agent with keys on multiple chains?
- **What we know:** Phase 3 adds Solana support alongside Base. An agent might have session keys on both.
- **What's unclear:** Whether revoke-all should revoke on ALL chains simultaneously.
- **Recommendation:** `revoke_all` should batch-revoke all DB records regardless of chain. On-chain revocation should be chain-specific and clearly labeled in the response (e.g., `base_on_chain_status`, `solana_on_chain_status`).

---

## 12. Code Examples

### Example: Batch Revocation SQL

```sql
-- Revoke all active session keys for an agent
UPDATE session_keys
SET is_revoked = true
WHERE agent_id = $1 AND is_revoked = false
RETURNING id;

-- Deactivate the agent
UPDATE agents
SET is_active = false
WHERE id = $1;
```

### Example: EIP-7702 Zero-Address Authorization (Unsigned)

```rust
use alloy::primitives::{Address, U256};

/// Generate the unsigned authorization data for zero-address delegation revocation.
/// The user must sign this with their EOA private key.
pub fn create_revoke_authorization_data(chain_id: u64, eoa_nonce: u64) -> serde_json::Value {
    serde_json::json!({
        "chain_id": chain_id,
        "address": "0x0000000000000000000000000000000000000000",
        "nonce": eoa_nonce,
        "message": "Sign this to revoke ALL session key delegation for your EOA. This will restore your account to a plain EOA."
    })
}
```

### Example: Checking EOA Delegation Status via Raw RPC

```rust
/// Check if an EOA has active EIP-7702 delegation by examining its code.
/// Returns Some(impl_address) if delegated, None if plain EOA.
pub async fn check_delegation_status(
    http_client: &reqwest::Client,
    rpc_url: &str,
    eoa_address: &str,
) -> anyhow::Result<Option<String>> {
    let resp = http_client.post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_getCode",
            "params": [eoa_address, "latest"],
            "id": 1
        }))
        .send()
        .await?;

    let body: serde_json::Value = resp.json().await?;
    let code = body["result"].as_str().unwrap_or("0x");

    // EIP-7702 delegation designator: 0xEF0100 || 20-byte address = 23 bytes = 46 hex chars + "0x"
    if code.len() == 48 && code.starts_with("0xef0100") {
        let impl_address = format!("0x{}", &code[8..]); // skip "0xef0100"
        Ok(Some(impl_address))
    } else if code == "0x" || code == "0x0" {
        Ok(None) // Plain EOA, no delegation
    } else {
        // Has code but not delegation designator -- this is a contract, not a delegated EOA
        anyhow::bail!("address has non-delegation code: {}", &code[..std::cmp::min(20, code.len())]);
    }
}
```

### Example: Fetching EOA Nonce via Raw RPC

```rust
pub async fn get_eoa_nonce(
    http_client: &reqwest::Client,
    rpc_url: &str,
    eoa_address: &str,
) -> anyhow::Result<u64> {
    let resp = http_client.post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_getTransactionCount",
            "params": [eoa_address, "latest"],
            "id": 1
        }))
        .send()
        .await?;

    let body: serde_json::Value = resp.json().await?;
    let nonce_hex = body["result"].as_str()
        .ok_or_else(|| anyhow::anyhow!("no result in nonce response"))?;

    let nonce = u64::from_str_radix(nonce_hex.trim_start_matches("0x"), 16)?;
    Ok(nonce)
}
```

---

## 13. Simpler Approach Analysis

### "Is DB-only revocation sufficient?"

**For Phase 3 MVP:** Yes, with caveats.

**Arguments FOR DB-only revocation:**
1. All agent traffic goes through the proxy. No proxy = no transactions.
2. DB revocation is instant, reliable, and requires no gas.
3. On-chain revocation adds complexity (alloy features, RPC dependency, error handling).
4. The SessionKeyValidator contract may not even be deployed yet (it was listed as Phase 2 scope but the STATE.md does not confirm on-chain deployment).

**Arguments AGAINST DB-only revocation (Security Level 10):**
1. A compromised agent can bypass the proxy entirely.
2. "Defense in depth" is a core security principle -- every layer should independently enforce access control.
3. If the proxy goes down, revoked keys would still work on-chain.
4. Audit/compliance expectations for DeFi products assume on-chain enforcement.

**Recommendation for Phase 3:**
- MUST: Implement DB-level `revoke_all_by_agent()` + API endpoint + audit logging
- MUST: Implement agent deactivation on revoke-all
- SHOULD: Return unsigned EIP-7702 zero-address authorization data from the API (for dashboard to use in Phase 4)
- SHOULD: Implement `check_delegation_status()` via raw RPC (verify if EOA is currently delegated)
- COULD: Implement full on-chain submission if alloy features compile cleanly
- DEFER to Phase 4: Dashboard-triggered on-chain revocation with user wallet signing

---

## Sources

### Primary (HIGH confidence)
- Existing project research: `.planning/research/eip7702-session-keys.md` (2026-02-24) -- comprehensive EIP-7702 spec analysis
- EIP-7702 specification (finalized, Pectra hard fork May 2025) -- spec-level revocation mechanics
- Current codebase: `proxy/src/repo/session_keys.rs`, `proxy/src/middleware/eip7702.rs`, `proxy/src/handlers/session_keys.rs`

### Secondary (MEDIUM confidence)
- Alloy crate structure and API patterns from training data (May 2025) -- feature names and type locations may have shifted in 0.12.x
- Base L2 gas cost estimates from training data -- verify with actual Base Sepolia transactions

### Tertiary (LOW confidence -- needs validation)
- Exact alloy feature names for EIP-7702 support (`"providers"`, `"consensus"`, `"transport-http"`) -- test in Docker before committing
- `blst` dependency graph for alloy features -- must verify with `cargo tree -i blst`

---

## Metadata

**Confidence breakdown:**
- EIP-7702 revocation mechanics: HIGH -- finalized spec, confirmed in existing research
- Two-layer architecture: HIGH -- standard defense-in-depth pattern, fits non-custodial model
- Alloy 0.12 feature requirements: MEDIUM -- feature names from training data, need Docker verification
- Gas cost estimates: MEDIUM -- directionally correct, need Base Sepolia validation
- Implementation code patterns: MEDIUM -- patterns are sound, exact alloy API may differ

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (alloy crate evolves, but EIP-7702 spec is stable)
