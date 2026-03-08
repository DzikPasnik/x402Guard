# x402Guard Solana Program

Anchor program implementing on-chain PDA vault guards for Solana-based x402 payments.

## Overview

The program creates per-agent vaults (PDA accounts) that enforce spend limits and contract whitelists on-chain, complementing the off-chain proxy guardrails.

## Architecture

```
solana/programs/x402-guard/src/
├── lib.rs              # Program entry, declare_id!, instruction dispatch
├── constants.rs        # Hardcoded USDC mint addresses (devnet + mainnet)
├── errors.rs           # Custom program errors
├── instructions/
│   ├── initialize_vault.rs   # Create PDA vault for an agent
│   ├── deposit.rs            # Deposit USDC into vault
│   ├── guarded_withdraw.rs   # Withdraw with per-tx limit + whitelist check
│   ├── update_rules.rs       # Update vault spend limits and whitelist
│   ├── revoke_agent.rs       # Freeze vault (emergency stop)
│   └── close_vault.rs        # Close vault and return remaining funds
└── state/
    ├── vault.rs        # Vault account structure (authority, limits, whitelist)
    └── mod.rs
```

## Program ID

The current program ID is a **development placeholder**:

```
CCiocBgtgKu4x2JfiRgKaYTkt4HVGonEmperieZ3VXfj
```

For production deployment, generate a new keypair with `solana-keygen grind` and update both `lib.rs` and `Anchor.toml`.

## Building

```bash
# Requires Anchor CLI (https://www.anchor-lang.com/docs/installation)
cd solana
anchor build

# Or check compilation without full build:
cargo check --lib
```

## Testing

```bash
# Unit tests (13 tests)
cargo test --lib

# Integration tests (requires local validator)
anchor test
```

## Security Notes

- **USDC mint validation**: The program only accepts the canonical USDC mint addresses for devnet (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) and mainnet (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`). Custom networks require updating `constants.rs`.
- **Dual whitelist check**: Both the signing authority AND the destination address are validated against the whitelist.
- **PDA authority**: Vaults use program-derived addresses — the program itself is the signer for withdrawals, not any external key.

## Configuration

`Anchor.toml` defines network-specific settings:

```toml
[programs.localnet]
x402_guard = "CCiocBgtgKu4x2JfiRgKaYTkt4HVGonEmperieZ3VXfj"

[programs.devnet]
x402_guard = "CCiocBgtgKu4x2JfiRgKaYTkt4HVGonEmperieZ3VXfj"
```

Both use the development placeholder. Update with your deployed program ID before use.
