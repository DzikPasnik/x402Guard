# EIP-7702 Session Keys and Delegation Patterns

**Project:** x402Guard.dev
**Researched:** 2026-02-24
**Confidence:** HIGH for spec (finalized EIP, Pectra shipped May 2025); MEDIUM for Base-specific considerations (verify against current Base docs); LOW for implementation library current state (ZeroDev, Biconomy APIs evolve rapidly)

> **Tool Note:** WebSearch and WebFetch were unavailable during this research session. All findings are from training data (cutoff August 2025). EIP-7702 shipped in Ethereum Pectra (May 7, 2025). Base adopted it at the same time (Base is an OP Stack chain running on Ethereum L1 security). Verify implementation library APIs against current documentation before writing code.

---

## 1. EIP-7702 Specification

### What Is EIP-7702?

EIP-7702 ("Set EOA Account Code") is an Ethereum Improvement Proposal authored by Vitalik Buterin, Sam Wilson, Ansgar Dietrichs, and Matt Garnett. It was finalized and shipped as part of the **Pectra hard fork** on May 7, 2025.

**Core mechanism:** EIP-7702 allows an Externally Owned Account (EOA) to temporarily set its own bytecode to the code of a smart contract, by including a signed authorization in a new transaction type. The EOA "delegates" its execution context to a contract implementation — meaning when someone calls the EOA address, the EVM executes the implementation contract's code *in the context of the EOA's storage and balance*.

This is fundamentally different from:
- **Account Abstraction (EIP-4337):** Creates a separate smart wallet. The EOA is not the account — it just signs for it.
- **DELEGATECALL:** Exists in Solidity but only callable from smart contracts, not EOAs.
- **EIP-3074:** Predecessor that was superseded by EIP-7702. Used `AUTH`/`AUTHCALL` opcodes.

With EIP-7702, the EOA *becomes* a smart contract wallet while retaining its address. This is the key innovation: zero migration, same address, smart contract capabilities.

**Confidence: HIGH** — This is the canonical spec as finalized.

### New Transaction Type: Type 4

EIP-7702 introduces **transaction type 4** (0x04). A type-4 transaction has all the fields of an EIP-1559 transaction (type 2) plus a new field:

```
authorization_list: List[Authorization]
```

The full transaction RLP encoding:

```
rlp([
  chain_id,
  nonce,
  max_priority_fee_per_gas,
  max_fee_per_gas,
  gas_limit,
  destination,        // can be empty (contract creation)
  value,
  data,
  access_list,
  authorization_list, // NEW
  signature_y_parity,
  signature_r,
  signature_s
])
```

### Authorization Tuple Format

Each entry in `authorization_list` is an **Authorization tuple**:

```
Authorization = (chain_id, address, nonce, y_parity, r, s)
```

| Field | Type | Description |
|-------|------|-------------|
| `chain_id` | uint256 | Chain ID for replay protection. `0` means valid on any chain. |
| `address` | address | The implementation contract to delegate to. |
| `nonce` | uint256 | The EOA's nonce at signing time. Prevents replay after nonce advances. |
| `y_parity` | uint256 | ECDSA signature component (0 or 1). |
| `r` | uint256 | ECDSA signature r component. |
| `s` | uint256 | ECDSA signature s component. |

The signed message (what the EOA signs to create the authorization):

```
keccak256(0x05 || rlp([chain_id, address, nonce]))
```

Note the magic prefix byte `0x05` — this prevents signature collisions with regular Ethereum transactions (which use `0x01`, `0x02`, etc.).

### How Delegation Works Step by Step

```
1. User (EOA owner) decides to delegate to implementation contract C.
2. User signs: keccak256(0x05 || rlp([chain_id, C_address, eoa_nonce]))
3. This produces Authorization = (chain_id, C_address, eoa_nonce, y, r, s)
4. Anyone (the user OR a relayer) submits a Type-4 transaction containing this Authorization.
5. During execution, the EVM:
   a. Recovers the authority (EOA address) from the signature.
   b. Verifies authority.nonce == Authorization.nonce.
   c. Increments authority.nonce by 1 (consumes the authorization).
   d. Sets the bytecode of authority to: 0xEF0100 || C_address
      (a special "delegation designator" prefix + implementation address)
6. From this point on, any CALL to the EOA address executes C's code
   in the context of the EOA's storage.
```

### The Delegation Designator

When an EOA has been delegated, its code is set to:

```
0xEF0100 || address  // 23 bytes total
```

- `0xEF` is an invalid opcode (reserved by EIP-3541), preventing this from being deployed as normal contract code.
- `0x01` + `0x00` = version byte.
- The 20-byte address is the implementation contract.

When the EVM encounters code starting with `0xEF0100`, it follows the delegation: loads and executes the code at the referenced address, in the EOA's storage context.

### Revocation / Clearing Delegation

To revoke delegation, the EOA signs a new authorization with:

```
address = 0x0000000000000000000000000000000000000000  // zero address
```

This clears the bytecode, restoring the EOA to a plain EOA. The transaction containing this authorization can be submitted by anyone, as long as the signature is valid.

**Confidence: HIGH** — These are spec-level details from the finalized EIP.

---

## 2. Session Key Pattern on Top of EIP-7702

### Conceptual Layer Separation

EIP-7702 itself does **not** define session keys. It provides the primitive: "EOA code = implementation contract." Session keys are a **pattern** built on top — the implementation contract is what enforces session key logic.

```
User EOA
  |-- delegates via EIP-7702 -->  SessionKeyValidator contract
                                      |
                                      |-- validates: key not expired
                                      |-- validates: key not revoked
                                      |-- validates: tx within spend limit
                                      |-- validates: target in whitelist
                                      |-- enforces: daily spend tracking
                                      |-- enforces: per-tx limit
```

### Session Key Data Model

A session key in the EIP-7702 context is a separately generated keypair (or a typed-data signer) that has been granted limited permissions. The implementation contract stores session key policies in the EOA's own storage (since code runs in EOA storage context).

Standard fields that define a session key's scope:

| Field | Type | Purpose |
|-------|------|---------|
| `sessionKey` | `address` | The authorized key's Ethereum address (derived from public key) |
| `validUntil` | `uint48` | Unix timestamp after which key is invalid |
| `validAfter` | `uint48` | Unix timestamp before which key is invalid (optional) |
| `paymaster` | `address` | If set, only this paymaster can be used |
| `allowedTargets` | `address[]` | Whitelist of contract addresses the key can call |
| `allowedSelectors` | `bytes4[]` | Whitelist of function selectors per target |
| `nativeTokenLimit` | `uint256` | Max ETH the key can spend |
| `erc20Limits` | `TokenLimit[]` | Per-token spend caps (token address + limit) |
| `merkleRoot` | `bytes32` | Alternative: encode policies as merkle tree for gas efficiency |

For x402Guard specifically, add:

| Field | Type | Purpose |
|-------|------|---------|
| `usdcLimit` | `uint256` | Max USDC spend for this session |
| `usdcSpent` | `uint256` | Running USDC spend counter (storage, not policy) |
| `dailyUsdcLimit` | `uint256` | Rolling 24h USDC cap |
| `lastDayStart` | `uint48` | Timestamp of current daily window |
| `dailyUsdcSpent` | `uint256` | USDC spent in current daily window |
| `maxLeverageBps` | `uint32` | Max leverage in basis points |
| `maxSlippageBps` | `uint32` | Max slippage in basis points |

### Session Key Lifecycle

```
1. CREATE
   User (or x402Guard API) generates a new keypair: (sessionPrivKey, sessionPubKey)
   sessionKeyAddress = address derived from sessionPubKey

   Policy is stored on-chain by calling the EOA's implementation contract:
   eoa.addSessionKey(sessionKeyAddress, {validUntil, allowedTargets, usdcLimit, ...})

   This call is signed by the EOA's own private key (the full owner key).

2. DELEGATE
   The EOA signs an EIP-7702 Authorization pointing to the SessionKeyValidator contract.
   This is submitted as a Type-4 transaction.
   After this, the EOA's code = 0xEF0100 || SessionKeyValidatorAddress.

3. AGENT USE
   The agent holds sessionPrivKey.
   Agent wants to call contract T with calldata D:

   Agent signs a UserOperation (or calls executeSessionKeyOp):
   {
     target: T,
     calldata: D,
     nonce: ...,
     sessionKey: sessionKeyAddress
   }

   The EOA's implementation contract verifies:
   - signature(op) == sessionKeyAddress  ✓ / ✗
   - block.timestamp < validUntil        ✓ / ✗
   - target in allowedTargets            ✓ / ✗
   - usdcAmount <= remaining usdcLimit   ✓ / ✗
   - (etc.)

   If all pass: EXECUTE. Update usdcSpent += usdcAmount.

4. REVOKE
   a. Soft revoke: EOA owner calls eoa.removeSessionKey(sessionKeyAddress)
      This deletes the policy from storage. The key is immediately inert.
   b. Hard revoke: EOA owner submits EIP-7702 Authorization with address=0
      This clears the entire delegation. ALL session keys become inert at once.
      The EOA returns to plain EOA state.
```

**One-click revoke** (critical for x402Guard) = send a Type-4 transaction with `address=0x000...000` in the authorization. Requires only the user's EOA private key. No on-chain state to clean up.

---

## 3. Existing Implementations

### 3.1 ZeroDev (Kernel)

**Confidence: MEDIUM** — API details accurate as of mid-2025, may have updated since.

ZeroDev's Kernel v3 supports EIP-7702. Their session key module is called `PermissionValidator` or `SessionKeyValidator` depending on version.

Key packages:
- `@zerodev/sdk` — Main SDK
- `@zerodev/session-key` — Session key plugin
- `@zerodev/ecdsa-validator` — ECDSA-based session key validator

Kernel uses a modular validator architecture where validators are plugins. For EIP-7702 + session keys:

```typescript
import { createKernelAccount } from "@zerodev/sdk"
import { toECDSASigner } from "@zerodev/ecdsa-validator"
import { toPermissionValidator } from "@zerodev/permissions"
import { toSessionKeyValidator } from "@zerodev/session-key"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

// 1. The EOA owner sets up delegation
const sessionPrivateKey = generatePrivateKey()
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey)

// 2. Create a permissions validator restricting what the session key can do
const sessionKeyValidator = await toSessionKeyValidator(publicClient, {
  signer: sessionKeySigner,
  validatorData: {
    paymaster: zeroAddress,
    permissions: [
      {
        target: ALLOWED_CONTRACT_ADDRESS,
        // valueLimit: max ETH per call
        valueLimit: 0n,
        // abi + functionName restrict to specific function
        abi: myContractAbi,
        functionName: "swapExactTokensForTokens",
        args: [
          { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_AMOUNT }
        ]
      }
    ]
  }
})

// 3. Create the kernel account (this triggers EIP-7702 delegation)
const kernelAccount = await createKernelAccount(publicClient, {
  plugins: {
    sudo: ecdsaValidator,     // owner key
    regular: sessionKeyValidator  // session key with restrictions
  },
  entryPoint,
})
```

ZeroDev's `permissions` array supports:
- `target` — Allowed contract address
- `valueLimit` — Max ETH per call
- `abi` + `functionName` — Restrict to specific function
- `args` — Per-argument conditions (EQUAL, LESS_THAN, GREATER_THAN, etc.)

Reference: `github.com/zerodevapp/kernel` — Kernel smart contract. `github.com/zerodevapp/sdk` — TypeScript SDK.

### 3.2 Biconomy (Nexus)

**Confidence: MEDIUM** — Nexus is their ERC-7579-compatible modular smart account.

Biconomy's Nexus supports EIP-7702 as of Nexus v1.2+ (late 2024 / early 2025). Their session key module is part of the `SessionKeyManager`.

Key packages:
- `@biconomy/sdk` — Main SDK
- `@rhinestone/module-sdk` — Module SDK for session keys (they use Rhinestone's module ecosystem)

Their session key approach uses ERC-7739 (typed data signatures) and stores policies as hashed permission trees.

```typescript
import { createNexusSessionClient } from "@biconomy/sdk"

const nexusClient = await createNexusSessionClient({
  chain: base,
  accountAddress: userEOA,
  signer: sessionKeySigner,
  transport: http(BASE_RPC_URL),
  bundlerTransport: http(BUNDLER_URL),
})

const { userOpHash } = await nexusClient.grantPermission({
  sessionRequestedInfo: [
    {
      sessionPublicKey: sessionKeyAddress,
      actionPoliciesInfo: [
        {
          contractAddress: ALLOWED_CONTRACT,
          functionSelector: "0xa9059cbb", // transfer(address,uint256)
          rules: [
            {
              offsetIndex: 1,  // second argument (amount)
              condition: 1,    // LESS_THAN_OR_EQUAL
              referenceValue: MAX_USDC_AMOUNT,
            }
          ],
          valueLimit: 0n,
        }
      ],
      expirationTime: Math.floor(Date.now() / 1000) + 86400, // 24h
    }
  ]
})
```

### 3.3 Pimlico (Permissionless.js)

**Confidence: MEDIUM** — Pimlico is primarily a bundler/paymaster, not a session key library. They use permissionless.js which wraps account implementations.

Pimlico's `permissionless` library provides utilities for working with various smart account implementations including ZeroDev Kernel and Biconomy Nexus. They don't have their own session key implementation.

For EIP-7702 specifically, permissionless.js has `toEip7702SmartAccount`:

```typescript
import { toEip7702SmartAccount } from "permissionless/accounts"
import { eip7702Actions } from "viem/experimental"

const client = createWalletClient({
  account: eoaAccount,
  chain: base,
  transport: http(),
}).extend(eip7702Actions())

// Sign an authorization
const authorization = await client.signAuthorization({
  contractAddress: SESSION_KEY_VALIDATOR_ADDRESS,
})

// Send a type-4 transaction with the authorization
const hash = await client.sendTransaction({
  authorizationList: [authorization],
  to: SESSION_KEY_VALIDATOR_ADDRESS,
  data: initSessionKeyCalldata,
})
```

### 3.4 Viem (Direct Library Support)

**Confidence: HIGH** — Viem is the foundational library and has first-class EIP-7702 support as of v2.x.

Viem provides `eip7702Actions()` as an extension to `WalletClient`. This is the lowest-level correct approach for x402Guard.

```typescript
import { createWalletClient, http } from "viem"
import { base } from "viem/chains"
import { eip7702Actions } from "viem/experimental"
import { privateKeyToAccount } from "viem/accounts"

const eoaAccount = privateKeyToAccount(USER_PRIVATE_KEY)

const walletClient = createWalletClient({
  account: eoaAccount,
  chain: base,
  transport: http(BASE_RPC_URL),
}).extend(eip7702Actions())

// Sign an EIP-7702 authorization
const authorization = await walletClient.signAuthorization({
  contractAddress: X402GUARD_SESSION_VALIDATOR_ADDRESS,
  // chain and nonce are inferred automatically
})

// Submit type-4 transaction to activate delegation
const txHash = await walletClient.sendTransaction({
  authorizationList: [authorization],
  to: eoaAccount.address,
  data: encodeFunctionData({
    abi: sessionKeyValidatorAbi,
    functionName: "initialize",
    args: [/* owner, initial config */],
  }),
})
```

### 3.5 Reference Contracts to Study

| Repo | What to Study |
|------|--------------|
| `zerodevapp/kernel` | `KernelFactory.sol`, `ECDSAValidator.sol`, `SessionKeyValidator.sol` |
| `eth-infinitism/account-abstraction` | EntryPoint, IAccount interface |
| `rhinestone/modulekit` | Modular validator architecture |
| `daimo-eth/eip7702` | Minimal reference implementation |
| `base-org/eip7702-example` | Base-specific examples (verify existence) |

---

## 4. Base Network Support

### EIP-7702 on Base

**Confidence: HIGH for the fact; MEDIUM for exact timeline**

Base adopted EIP-7702 as part of its alignment with the Ethereum Pectra hard fork. Base is an OP Stack chain and the OP Stack adopted Pectra compatibility in the same timeframe (May–June 2025).

Key facts:
- **Base Sepolia (testnet):** EIP-7702 available from approximately April 2025 (pre-Pectra testing).
- **Base Mainnet:** EIP-7702 available from approximately May 2025 (post-Pectra).
- **Chain IDs:** Base Sepolia = 84532, Base Mainnet = 8453.
- **RPC:** Standard `eth_sendRawTransaction` accepts type-4 transactions.
- **Block explorers:** Basescan shows type-4 transactions and EOA delegation state.

### Base-Specific Considerations

1. **Gas costs are lower than mainnet.** EIP-7702 authorization processing costs gas on L1; on Base (L2), the execution gas is cheap but L1 calldata costs apply. Authorization list items cost calldata bytes posted to L1.

2. **No special precompiles needed.** EIP-7702 requires standard ECDSA recovery, which all EVM chains support.

3. **OP Stack sequencer.** Type-4 transactions go through Base's sequencer. The sequencer submits them to L1 as compressed calldata. The authorization signatures are verified by the EVM, not the sequencer — the sequencer just forwards them.

4. **USDC on Base.** Native USDC (Circle's official deployment) exists on Base. Address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (verify on chain before use).

5. **Bundler availability.** Pimlico, Alchemy, Stackup all support Base for AA/EIP-7702 bundling. Required if using paymasters or batching session key setup.

6. **No native account abstraction in Base L2 sequencer.** EIP-4337 EntryPoint is deployed at `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` on Base (same as mainnet).

### Verifying Chain Support

```bash
# Check if a Base RPC supports type-4 transactions
cast send --rpc-url https://mainnet.base.org \
  --type 4 \
  --auth "$(cast wallet sign-auth ...)" \
  ...
```

---

## 5. Security Model

### Security Properties of EIP-7702

**Confidence: HIGH** — These derive directly from the spec.

1. **Replay protection:** The `nonce` field in the authorization matches the EOA's current nonce. Once the transaction executes (which increments the nonce), the authorization is consumed. An attacker who intercepts the signature cannot replay it after the nonce has advanced.

2. **Chain binding:** The `chain_id` field prevents cross-chain replay. An authorization signed for Base mainnet cannot be used on Base Sepolia (unless chain_id = 0, which should be avoided).

3. **Signature is over the implementation address:** The EOA explicitly signs which contract they are delegating to. Changing the implementation requires a new signature.

4. **Storage isolation:** EIP-7702 runs the implementation in the EOA's *own* storage. Two EOAs delegating to the same implementation contract have entirely separate storage. Storage slots are indexed by the EOA address, not the implementation.

5. **ETH balance retained:** The EOA's ETH balance is not moved to a contract. The EOA still holds it. The implementation code can spend it only if the logic permits.

### Revocation Mechanisms

| Mechanism | How | Speed | Scope |
|-----------|-----|-------|-------|
| **Soft revoke (session key)** | Call `removeSessionKey(address)` on the implementation | Next block | Single session key |
| **Hard revoke (delegation)** | Sign authorization with `address = 0x0` | Next block (type-4 tx) | All session keys (EOA returns to plain EOA) |
| **Nonce invalidation** | Send any transaction from the EOA (advances nonce, but does NOT revoke delegation — common misconception) | N/A | Does not revoke |
| **Implementation upgrade** | Sign new authorization with different contract address | Next block | Replaces validator logic |

**Critical for x402Guard:** The one-click revoke feature maps to the **hard revoke** path. The x402Guard backend should provide an endpoint that generates and submits a type-4 transaction with zero address authorization when the user clicks "Revoke All."

### Attack Vectors

**Confidence: HIGH for spec-level attacks; MEDIUM for implementation-specific**

#### 1. Malicious Implementation Contract
**Threat:** User is tricked into delegating to a malicious contract that drains their EOA.
**Mitigation:** x402Guard must only allow delegation to its own audited `SessionKeyValidator` contract. Never accept user-provided implementation addresses without validation.

#### 2. Signature Phishing
**Threat:** User signs an authorization (thinking it's something else) and attacker submits it.
**Mitigation:** Hardware wallets and modern wallets display EIP-7702 authorization requests with the implementation address and chain ID. Users must verify the implementation address. The `0x05` prefix byte prevents re-use of signatures from other contexts.

#### 3. Session Key Leakage
**Threat:** Agent holds the session private key. If the agent is compromised, the session key is leaked. Attacker can execute any operation the session key permits.
**Mitigation:** Scope is enforced on-chain by the validator contract — a leaked session key can only do what its policy allows. Spend limits, target whitelist, and expiry all apply. One-click revoke removes the key immediately.

#### 4. Storage Collision in Implementation Contract
**Threat:** If the implementation contract uses specific storage slots, and the EOA already has data in those slots from a previous delegation or direct storage write, state may be corrupted.
**Mitigation:** Implementation contracts should use EIP-1967 proxy-style namespaced storage (derived via `keccak256("...")-1`) to avoid collisions. The x402Guard SessionKeyValidator must use namespaced storage for all its state.

#### 5. Griefing via Authorization Inclusion
**Threat:** Attacker includes a legitimate user's authorization in a transaction that the attacker sends, front-running the user's intended first call to initialize state correctly.
**Mitigation:** The implementation contract's `initialize()` function must check `msg.sender == authority` or use `CALLER`-based access control. The authorization itself doesn't convey initialization data — the calldata does, and that must be validated. Better: design the validator to be idempotent on first call.

#### 6. Delegated Code Self-Destruction
**Threat:** Implementation contract contains `SELFDESTRUCT` which would destroy the EOA.
**Mitigation:** EIP-7702 does NOT allow `SELFDESTRUCT` from a delegated EOA. The spec explicitly prohibits self-destruction of the authority. Verify this is enforced by the EVM.

#### 7. Reentrancy via Delegated Execution
**Threat:** The EOA's implementation can be reentered if it calls external contracts before updating its state.
**Mitigation:** Follow checks-effects-interactions pattern in the implementation contract. Use ReentrancyGuard. For spend tracking: update `usdcSpent` BEFORE calling the target contract.

#### 8. Stale Authorization After Revocation
**Threat:** User hard-revokes delegation (address=0), but an attacker has already captured a session key signature for a future operation. Can they re-delegate and replay?
**Mitigation:** After hard revoke, re-delegation requires a new EIP-7702 authorization with the new nonce. Old session key signatures are for operations against the validator contract — they don't re-enable delegation themselves. A revoked EOA is a plain EOA and can only be re-delegated by its own private key.

---

## 6. Solidity Patterns: On-Chain Session Key Validator

### Minimal SessionKeyValidator Contract

This is the contract x402Guard will deploy and that users' EOAs will delegate to.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title X402GuardSessionKeyValidator
/// @notice Implementation contract for EIP-7702 delegation.
///         Runs in the storage context of the delegating EOA.
///         Enforces scoped, time-limited, revocable session keys.
contract X402GuardSessionKeyValidator {
    using ECDSA for bytes32;

    // ------------------------------------------------------------------
    // Namespaced storage to avoid collisions with EOA's own storage.
    // Slot: keccak256("x402guard.session.storage") - 1
    // ------------------------------------------------------------------
    bytes32 private constant STORAGE_SLOT =
        0x5e3e2d60a9f1b4c8d3f7a2e0c6b9d4a7e1f3c5b8d2a6e9f0c4b7d1a3e5f2c8 - 1;

    struct SessionPolicy {
        uint48  validUntil;        // expiry timestamp
        uint48  validAfter;        // not-before timestamp (0 = immediate)
        bool    isRevoked;         // soft revoke flag
        // Spend limits (USDC, 6 decimals)
        uint256 usdcTotalLimit;    // total lifetime USDC limit
        uint256 usdcSpent;         // USDC spent so far (lifetime)
        uint256 usdcDailyLimit;    // rolling 24h USDC limit
        uint256 usdcDailySpent;    // USDC spent in current day window
        uint48  dailyWindowStart;  // start of current 24h window
        // Per-tx limits
        uint256 usdcPerTxLimit;    // max USDC per single transaction
        // Contract whitelist
        // stored as packed bytes: [numTargets][target0][target1]...
        // For simplicity here we use a mapping approach
    }

    struct ValidatorStorage {
        address owner;             // The EOA that initialized this
        mapping(address => SessionPolicy) policies;
        mapping(address => mapping(address => bool)) allowedTargets;
        // Nonce for session key operations (prevents replays of signed ops)
        mapping(address => uint256) sessionKeyNonces;
    }

    function _storage() internal pure returns (ValidatorStorage storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event SessionKeyAdded(address indexed sessionKey, uint48 validUntil);
    event SessionKeyRevoked(address indexed sessionKey);
    event SessionKeyExecuted(address indexed sessionKey, address target, uint256 value, bytes4 selector);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------
    error NotOwner();
    error SessionKeyNotFound();
    error SessionKeyRevoked();
    error SessionKeyExpired();
    error SessionKeyNotYetValid();
    error TargetNotAllowed(address target);
    error UsdcLimitExceeded();
    error UsdcDailyLimitExceeded();
    error UsdcPerTxLimitExceeded();
    error InvalidSignature();
    error AlreadyInitialized();

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------
    modifier onlyOwner() {
        // When called via EIP-7702, address(this) == the EOA.
        // The owner is whoever called initialize() first.
        // For calls from the EOA's own key, we check if the caller IS the EOA.
        if (msg.sender != _storage().owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------
    // Initialization
    // ------------------------------------------------------------------

    /// @notice Called once to initialize the validator in EOA storage.
    ///         Must be called by the EOA (owner) in the same Type-4 tx
    ///         that sets the delegation, or in a subsequent tx.
    function initialize(address owner_) external {
        ValidatorStorage storage s = _storage();
        if (s.owner != address(0)) revert AlreadyInitialized();
        s.owner = owner_;
    }

    // ------------------------------------------------------------------
    // Session Key Management (called by EOA owner)
    // ------------------------------------------------------------------

    struct SessionKeyConfig {
        uint48  validUntil;
        uint48  validAfter;
        uint256 usdcTotalLimit;
        uint256 usdcDailyLimit;
        uint256 usdcPerTxLimit;
        address[] allowedTargets;
    }

    function addSessionKey(
        address sessionKey,
        SessionKeyConfig calldata config
    ) external onlyOwner {
        ValidatorStorage storage s = _storage();

        s.policies[sessionKey] = SessionPolicy({
            validUntil:       config.validUntil,
            validAfter:       config.validAfter == 0
                                  ? uint48(block.timestamp)
                                  : config.validAfter,
            isRevoked:        false,
            usdcTotalLimit:   config.usdcTotalLimit,
            usdcSpent:        0,
            usdcDailyLimit:   config.usdcDailyLimit,
            usdcDailySpent:   0,
            dailyWindowStart: uint48(block.timestamp),
            usdcPerTxLimit:   config.usdcPerTxLimit
        });

        for (uint256 i = 0; i < config.allowedTargets.length; i++) {
            s.allowedTargets[sessionKey][config.allowedTargets[i]] = true;
        }

        emit SessionKeyAdded(sessionKey, config.validUntil);
    }

    function removeSessionKey(address sessionKey) external onlyOwner {
        ValidatorStorage storage s = _storage();
        s.policies[sessionKey].isRevoked = true;
        emit SessionKeyRevoked(sessionKey);
    }

    // ------------------------------------------------------------------
    // Session Key Execution (called by agent with session key signature)
    // ------------------------------------------------------------------

    struct SessionOp {
        address sessionKey;
        address target;
        uint256 value;
        bytes   callData;
        uint256 usdcAmount;    // How much USDC this op spends (0 if not USDC transfer)
        uint256 nonce;         // Session key nonce
        uint256 deadline;      // Op must execute before this timestamp
    }

    /// @notice Execute an operation signed by a session key.
    /// @param op         The operation to execute.
    /// @param signature  ECDSA signature of op hash by the session key.
    function executeSessionKeyOp(
        SessionOp calldata op,
        bytes calldata signature
    ) external returns (bytes memory) {
        // 1. Reconstruct the signed message
        bytes32 opHash = _hashSessionOp(op);
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(opHash);

        // 2. Recover signer
        address recovered = ethHash.recover(signature);
        if (recovered != op.sessionKey) revert InvalidSignature();

        // 3. Load and validate policy
        ValidatorStorage storage s = _storage();
        SessionPolicy storage policy = s.policies[op.sessionKey];

        if (policy.validUntil == 0) revert SessionKeyNotFound();
        if (policy.isRevoked) revert SessionKeyRevoked();
        if (block.timestamp > policy.validUntil) revert SessionKeyExpired();
        if (block.timestamp < policy.validAfter) revert SessionKeyNotYetValid();
        if (block.timestamp > op.deadline) revert SessionKeyExpired();

        // 4. Check target whitelist
        if (!s.allowedTargets[op.sessionKey][op.target]) {
            revert TargetNotAllowed(op.target);
        }

        // 5. Check USDC spend limits (before execution — CEI pattern)
        if (op.usdcAmount > 0) {
            // Per-tx limit
            if (op.usdcAmount > policy.usdcPerTxLimit) revert UsdcPerTxLimitExceeded();

            // Lifetime limit
            uint256 newSpent = policy.usdcSpent + op.usdcAmount;
            if (newSpent > policy.usdcTotalLimit) revert UsdcLimitExceeded();

            // Daily limit — reset window if 24h has elapsed
            uint256 dailySpent = policy.usdcDailySpent;
            if (block.timestamp >= policy.dailyWindowStart + 24 hours) {
                dailySpent = 0;
                policy.dailyWindowStart = uint48(block.timestamp);
                policy.usdcDailySpent = 0;
            }
            if (dailySpent + op.usdcAmount > policy.usdcDailyLimit) {
                revert UsdcDailyLimitExceeded();
            }

            // Update state BEFORE external call (CEI)
            policy.usdcSpent = newSpent;
            policy.usdcDailySpent = dailySpent + op.usdcAmount;
        }

        // 6. Update op nonce (prevent replay)
        if (s.sessionKeyNonces[op.sessionKey] != op.nonce) revert InvalidSignature();
        s.sessionKeyNonces[op.sessionKey]++;

        // 7. Execute the call
        (bool success, bytes memory returnData) = op.target.call{value: op.value}(op.callData);
        if (!success) {
            // Bubble up the revert reason
            assembly {
                revert(add(returnData, 32), mload(returnData))
            }
        }

        emit SessionKeyExecuted(op.sessionKey, op.target, op.value, bytes4(op.callData));
        return returnData;
    }

    // ------------------------------------------------------------------
    // View Functions
    // ------------------------------------------------------------------

    function getSessionPolicy(address sessionKey)
        external
        view
        returns (SessionPolicy memory)
    {
        return _storage().policies[sessionKey];
    }

    function isSessionKeyValid(address sessionKey) external view returns (bool) {
        ValidatorStorage storage s = _storage();
        SessionPolicy storage p = s.policies[sessionKey];
        return (
            p.validUntil != 0 &&
            !p.isRevoked &&
            block.timestamp <= p.validUntil &&
            block.timestamp >= p.validAfter
        );
    }

    function getRemainingUsdcAllowance(address sessionKey)
        external
        view
        returns (uint256 lifetime, uint256 daily)
    {
        ValidatorStorage storage s = _storage();
        SessionPolicy storage p = s.policies[sessionKey];
        lifetime = p.usdcTotalLimit > p.usdcSpent
            ? p.usdcTotalLimit - p.usdcSpent
            : 0;

        uint256 dailySpent = p.usdcDailySpent;
        if (block.timestamp >= p.dailyWindowStart + 24 hours) {
            dailySpent = 0;
        }
        daily = p.usdcDailyLimit > dailySpent
            ? p.usdcDailyLimit - dailySpent
            : 0;
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _hashSessionOp(SessionOp calldata op) internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("SessionOp(address sessionKey,address target,uint256 value,bytes callData,uint256 usdcAmount,uint256 nonce,uint256 deadline,uint256 chainId,address validator)"),
            op.sessionKey,
            op.target,
            op.value,
            keccak256(op.callData),
            op.usdcAmount,
            op.nonce,
            op.deadline,
            block.chainid,
            address(this)
        ));
    }
}
```

### EIP-712 Typed Data for Session Ops (Production Version)

For production, use EIP-712 structured data instead of `toEthSignedMessageHash` — it gives users more readable signing prompts:

```solidity
// EIP-712 domain separator (computed once at deployment)
bytes32 private constant DOMAIN_TYPEHASH = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
);

bytes32 private constant SESSION_OP_TYPEHASH = keccak256(
    "SessionOp(address sessionKey,address target,uint256 value,bytes32 callDataHash,uint256 usdcAmount,uint256 nonce,uint256 deadline)"
);

function _domainSeparator() internal view returns (bytes32) {
    return keccak256(abi.encode(
        DOMAIN_TYPEHASH,
        keccak256("X402GuardSessionKeyValidator"),
        keccak256("1"),
        block.chainid,
        address(this)
    ));
}

function _hashSessionOp712(SessionOp calldata op) internal view returns (bytes32) {
    return keccak256(abi.encodePacked(
        "\x19\x01",
        _domainSeparator(),
        keccak256(abi.encode(
            SESSION_OP_TYPEHASH,
            op.sessionKey,
            op.target,
            op.value,
            keccak256(op.callData),
            op.usdcAmount,
            op.nonce,
            op.deadline
        ))
    ));
}
```

### Rust-Side: Submitting EIP-7702 Type-4 Transaction

The x402Guard proxy (Rust/Axum) needs to interact with EIP-7702 via the `ethers-rs` or `alloy` crate. As of mid-2025, **alloy** is the recommended Rust crate for modern Ethereum interactions:

```rust
use alloy::{
    network::EthereumWallet,
    primitives::{address, U256},
    providers::{Provider, ProviderBuilder},
    rpc::types::eth::{Authorization, SignedAuthorization},
    signers::local::PrivateKeySigner,
};

/// Signs an EIP-7702 authorization for the session key validator contract.
/// The user_signer is the EOA private key (held by user, not the proxy).
pub async fn sign_eip7702_authorization(
    user_signer: &PrivateKeySigner,
    implementation: alloy::primitives::Address,
    chain_id: u64,
    nonce: u64,
) -> anyhow::Result<SignedAuthorization> {
    let auth = Authorization {
        chain_id: U256::from(chain_id),
        address: implementation,
        nonce: U256::from(nonce),
    };
    let signed = user_signer.sign_authorization(auth).await?;
    Ok(signed)
}

/// Submits a type-4 transaction to activate delegation.
pub async fn activate_delegation(
    provider: &impl Provider,
    user_wallet: EthereumWallet,
    implementation: alloy::primitives::Address,
    init_calldata: Vec<u8>,
) -> anyhow::Result<alloy::primitives::B256> {
    // Build and send type-4 tx
    let tx_hash = provider
        .send_transaction(
            alloy::rpc::types::eth::TransactionRequest {
                to: Some(alloy::primitives::TxKind::Call(user_wallet.default_signer().address())),
                input: init_calldata.into(),
                authorization_list: Some(vec![/* signed authorization */]),
                ..Default::default()
            }
        )
        .await?
        .watch()
        .await?;
    Ok(tx_hash)
}
```

**Note:** The exact alloy API for type-4 transactions is evolving. Verify against `alloy-rs/alloy` crate docs for the version you pin. As of alloy 0.3.x (mid-2025), EIP-7702 types are in `alloy-rpc-types-eth`.

---

## 7. x402Guard-Specific Design Decisions

### Architecture for x402Guard

```
┌─────────────────────────────────────────────────────────┐
│                     User EOA                            │
│  Normal address, holds ETH + USDC                       │
│  code = 0xEF0100 || X402GuardSessionKeyValidator        │
└─────────────────┬───────────────────────────────────────┘
                  │  EIP-7702 Delegation
                  ▼
┌─────────────────────────────────────────────────────────┐
│        X402GuardSessionKeyValidator (deployed once)     │
│  - Enforces session key policies                        │
│  - Checks USDC spend limits                             │
│  - Enforces contract whitelist                          │
│  - Emits audit events                                   │
│  - Handles revocation                                   │
└─────────────────┬───────────────────────────────────────┘
                  │  Verification
                  ▼
┌─────────────────────────────────────────────────────────┐
│              x402Guard Proxy (Rust/Axum)                │
│  - Intercepts agent HTTP requests                       │
│  - Verifies session key signature                       │
│  - Pre-validates limits (off-chain fast path)           │
│  - Calls executeSessionKeyOp on-chain                   │
│  - Records audit logs to Supabase                       │
└─────────────────┬───────────────────────────────────────┘
                  │  Approved calls only
                  ▼
┌─────────────────────────────────────────────────────────┐
│              DeFi Protocol / x402 Service               │
│  e.g. Uniswap, Aave, oracle API                         │
└─────────────────────────────────────────────────────────┘
```

### Session Key Creation Flow

Two paths, both supported:

**Path A: Dashboard (user-initiated)**
1. User opens x402Guard dashboard.
2. Configures session key parameters (limits, targets, expiry).
3. Dashboard generates a new session keypair client-side.
4. User signs: (a) EIP-7702 authorization, (b) `addSessionKey` calldata.
5. Dashboard submits type-4 transaction bundling both.
6. Dashboard stores `sessionPrivKey` encrypted in browser (or exports to user).
7. User gives `sessionPrivKey` to their agent.

**Path B: API (agent-automated)**
1. Agent calls `POST /v1/session-keys/create` on x402Guard API.
2. x402Guard API generates session keypair.
3. x402Guard API returns unsigned authorization + calldata for user to sign.
4. User signs via wallet (MetaMask, etc.) — this step always requires user action.
5. Signed tx submitted. Session key activated.
6. `sessionPrivKey` returned to agent over encrypted channel.

### Off-Chain Pre-Validation

The Rust proxy can do fast off-chain checks before hitting the chain:

```rust
pub struct SessionKeyGuard {
    // Cached session key policies from Supabase/Redis
    policies: Arc<RwLock<HashMap<Address, SessionKeyPolicy>>>,
}

impl SessionKeyGuard {
    pub fn validate_pre_chain(&self, op: &SessionOp) -> Result<(), GuardError> {
        let policies = self.policies.read().unwrap();
        let policy = policies.get(&op.session_key)
            .ok_or(GuardError::SessionKeyNotFound)?;

        if policy.is_revoked {
            return Err(GuardError::Revoked);
        }
        if Utc::now() > policy.expires_at {
            return Err(GuardError::Expired);
        }
        if op.usdc_amount > policy.usdc_per_tx_limit {
            return Err(GuardError::PerTxLimitExceeded);
        }
        if !policy.allowed_targets.contains(&op.target) {
            return Err(GuardError::TargetNotAllowed);
        }

        Ok(())
    }
}
```

The on-chain validator is the **source of truth**. Off-chain pre-validation is an optimization to reject obviously invalid requests before paying gas.

---

## 8. Key Libraries and References

| Resource | Type | Confidence | URL (verify) |
|----------|------|-----------|------|
| EIP-7702 Specification | Official EIP | HIGH | `eips.ethereum.org/EIPS/eip-7702` |
| Viem EIP-7702 Guide | Official Docs | HIGH | `viem.sh/experimental/eip7702` |
| ZeroDev Kernel v3 | GitHub | MEDIUM | `github.com/zerodevapp/kernel` |
| ZeroDev SDK | GitHub | MEDIUM | `github.com/zerodevapp/sdk` |
| Alloy Rust crate | GitHub | MEDIUM | `github.com/alloy-rs/alloy` |
| Biconomy Nexus | GitHub | MEDIUM | `github.com/bcnmy/nexus` |
| Rhinestone ModuleKit | GitHub | MEDIUM | `github.com/rhinestonewtf/modulekit` |
| Base EIP-7702 Docs | Official | MEDIUM | `docs.base.org` (verify section) |
| Pimlico permissionless.js | Docs | MEDIUM | `docs.pimlico.io/permissionless` |
| ERC-7579 (modular accounts) | Official EIP | HIGH | `eips.ethereum.org/EIPS/eip-7579` |

---

## 9. Open Questions and Validation Needed

These items should be verified against live documentation before implementing:

1. **Alloy 0.x API for Type-4 Transactions:** The `authorization_list` field API in alloy Rust crate — verify exact types and method names against current `alloy-rs/alloy` crate (version pinned in Cargo.toml).

2. **Base Sepolia Type-4 Transaction Support:** Confirm with a test transaction that Base Sepolia RPC accepts type-4. Check `cast` or Basescan for type-4 transaction examples.

3. **ZeroDev Session Key API:** `toSessionKeyValidator` is the mid-2025 API — verify against current `@zerodev/session-key` package README.

4. **USDC Address on Base Mainnet:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` — verify on Basescan before hardcoding.

5. **EIP-7702 and EOA Nonce Behavior:** After delegation, if the EOA sends a regular type-2 transaction, does the nonce increment affect any session key policy? (Answer per spec: no — nonces and session key policies are independent. But verify with a test.)

6. **Storage Slot Calculation:** The `STORAGE_SLOT` constant in the validator contract — calculate correctly using `cast keccak "x402guard.session.storage"` and subtract 1. Do not use the placeholder value shown above.

7. **Gas Estimates:** Estimate gas cost for `addSessionKey`, `executeSessionKeyOp`, and `removeSessionKey` on Base. At Base gas prices (~0.001 gwei), these should be negligible, but benchmark.

8. **ERC-7579 Compatibility:** Consider whether x402Guard's validator should implement ERC-7579 `IValidator` interface for broader ecosystem compatibility. ZeroDev Kernel v3 and Biconomy Nexus both support ERC-7579.

---

## 10. Summary for Roadmap

### What EIP-7702 Gives x402Guard

- **Non-custodial by design:** User's EOA address doesn't change. User keeps their private key. No funds move to a contract.
- **Instant revocation:** Type-4 tx with zero address = all session keys dead, EOA restored. One transaction, next block.
- **Scoped delegation:** The validator contract enforces fine-grained limits on-chain — not just proxy-side.
- **Standard primitive:** EIP-7702 is a live Ethereum standard, not a protocol-specific solution. Interoperable with existing wallets and tooling.

### Phase Recommendations

**Phase 2 (EIP-7702 Core):**
- Deploy `X402GuardSessionKeyValidator` to Base Sepolia.
- Implement `addSessionKey` / `removeSessionKey` / `executeSessionKeyOp`.
- Implement hard-revoke via EIP-7702 zero-address authorization.
- Write Rust alloy integration for type-4 transaction construction.
- Write tests with Foundry (fork Base Sepolia).

**Phase 3 (Proxy Integration):**
- Implement `eip7702.rs` middleware in Rust proxy.
- Off-chain pre-validation with cached policies.
- On-chain enforcement via alloy provider calls.
- Audit log to Supabase on each execution.

**Phase 4 (Dashboard):**
- Session key creation UI (generate keypair, sign authorization, show status).
- Spend monitoring against on-chain `usdcSpent`.
- One-click revoke button (generates and submits zero-address authorization).

### Critical Pitfalls for Implementation

1. Use namespaced storage in the validator (avoid collision with EOA storage).
2. Checks-Effects-Interactions in `executeSessionKeyOp` — update spend before calling target.
3. Include `chainId` and `address(this)` in the `SessionOp` hash to prevent cross-chain / cross-contract replays.
4. Never accept user-supplied implementation addresses — the validator address must be hardcoded or whitelisted by x402Guard.
5. Test with a real EIP-7702 type-4 transaction on Base Sepolia before mainnet.
