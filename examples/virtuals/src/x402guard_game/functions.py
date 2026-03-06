"""GAME SDK function wrappers for x402Guard operations.

Wraps x402Guard proxy calls as GAME SDK Function objects so that
Virtuals Protocol agents can make guarded DeFi payments.

The ``game_sdk`` dependency is OPTIONAL. If not installed, the raw
executable functions (``make_guarded_payment``, ``query_solana_vault``)
still work standalone — only the GAME SDK Function/WorkerConfig
objects require the SDK.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from x402guard_game.client import X402GuardClient
from x402guard_game.errors import GuardrailViolationError, X402GuardError
from x402guard_game.types import (
    ProxyRequest,
    SolanaProxyRequest,
    X402GuardConfig,
)

logger = logging.getLogger("x402guard")

# --- Optional game_sdk import ---------------------------------------------

HAS_GAME_SDK = False
try:
    from game_sdk.game.custom_types import (  # type: ignore[import-untyped]
        Argument,
        Function,
        FunctionResultStatus,
    )
    from game_sdk.game.agent import WorkerConfig  # type: ignore[import-untyped]

    HAS_GAME_SDK = True
except ImportError:
    logger.debug("game_sdk not installed; GAME SDK wrappers unavailable")


# --- Result tuple type (mirrors FunctionResultStatus interface) ------------

# When game_sdk is not available, define a compatible enum
if not HAS_GAME_SDK:

    class _FunctionResultStatus:  # type: ignore[no-redef]
        DONE = "done"
        FAILED = "failed"

    FunctionResultStatus = _FunctionResultStatus  # type: ignore[misc]


# --- Executable functions --------------------------------------------------


def make_guarded_payment(
    target_url: str,
    amount: str,
    agent_id: str,
    network: str = "base-sepolia",
) -> tuple[Any, str, dict[str, Any]]:
    """Make an x402 payment guarded by x402Guard rules.

    Returns:
        Tuple of (FunctionResultStatus, message, data_dict).
    """
    proxy_url = os.getenv("X402GUARD_PROXY_URL", "http://localhost:3402")
    config = X402GuardConfig(proxy_url=proxy_url, max_retries=2)

    try:
        with X402GuardClient(config) as client:
            if network.startswith("solana"):
                req = SolanaProxyRequest(
                    target_url=target_url,
                    network=network,
                    vault_owner=agent_id,
                    amount=int(amount),
                    x402_payment="placeholder",
                )
                resp = client.proxy_solana_payment(req)
                return (
                    FunctionResultStatus.DONE,
                    resp.message,
                    {
                        "success": resp.success,
                        "vault_pda": resp.vault_pda,
                        "remaining_daily_capacity": resp.remaining_daily_capacity,
                    },
                )
            else:
                req_evm = ProxyRequest(
                    target_url=target_url,
                    x402_payment="placeholder",
                    x402_requirements="placeholder",
                    agent_id=agent_id,
                )
                resp_evm = client.proxy_payment(req_evm)
                return (
                    FunctionResultStatus.DONE,
                    resp_evm.message,
                    {
                        "success": resp_evm.success,
                        "tx_hash": resp_evm.tx_hash,
                    },
                )
    except GuardrailViolationError as exc:
        return (
            FunctionResultStatus.FAILED,
            f"[BLOCKED] GuardrailViolationError: {exc.message}",
            {
                "rule_type": exc.rule_type,
                "limit": exc.limit,
                "actual": exc.actual,
            },
        )
    except X402GuardError as exc:
        return (
            FunctionResultStatus.FAILED,
            f"x402Guard error: {exc.message}",
            {},
        )


def query_solana_vault(
    owner_pubkey: str,
) -> tuple[Any, str, dict[str, Any]]:
    """Query Solana vault status for a wallet owner.

    Returns:
        Tuple of (FunctionResultStatus, message, vault_data).
    """
    proxy_url = os.getenv("X402GUARD_PROXY_URL", "http://localhost:3402")
    config = X402GuardConfig(proxy_url=proxy_url, max_retries=2)

    try:
        with X402GuardClient(config) as client:
            vault_data = client.get_vault_status(owner_pubkey)
            return (
                FunctionResultStatus.DONE,
                "Vault status retrieved",
                vault_data,
            )
    except X402GuardError as exc:
        return (
            FunctionResultStatus.FAILED,
            f"x402Guard error: {exc.message}",
            {},
        )


# --- GAME SDK Function definitions ----------------------------------------

if HAS_GAME_SDK:
    guarded_payment_fn = Function(
        fn_name="make_guarded_payment",
        fn_description=(
            "Make an x402 payment guarded by x402Guard rules. "
            "Use when a DeFi transaction is needed."
        ),
        args=[
            Argument(
                name="target_url",
                description="Target API URL requiring x402 payment",
            ),
            Argument(
                name="amount",
                description="Amount in USDC minor units (1 USDC = 1000000)",
            ),
            Argument(
                name="agent_id",
                description="x402Guard agent ID",
            ),
            Argument(
                name="network",
                description=(
                    "Network: 'base-sepolia', 'base-mainnet', or 'solana-devnet'"
                ),
            ),
        ],
        executable=make_guarded_payment,
    )

    solana_vault_fn = Function(
        fn_name="query_solana_vault",
        fn_description="Query Solana vault status for a wallet owner.",
        args=[
            Argument(
                name="owner_pubkey",
                description="Solana wallet public key of the vault owner",
            ),
        ],
        executable=query_solana_vault,
    )

    defi_worker = WorkerConfig(
        id="x402guard_defi_worker",
        worker_description=(
            "Handles guarded DeFi payments via x402Guard proxy"
        ),
        get_state_fn=lambda fn_name, fn_args: {
            "proxy_url": os.getenv("X402GUARD_PROXY_URL", ""),
        },
        action_space=[guarded_payment_fn, solana_vault_fn],
    )
else:
    guarded_payment_fn = None  # type: ignore[assignment]
    solana_vault_fn = None  # type: ignore[assignment]
    defi_worker = None  # type: ignore[assignment]
