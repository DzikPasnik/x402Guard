"""Frozen dataclasses mirroring the x402Guard Rust proxy models.

All types use @dataclass(frozen=True) for immutability. Field names use
snake_case in Python; serialization helpers (to_dict / from_dict) convert
to/from the camelCase JSON format expected by the proxy.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("x402guard")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class X402GuardConfig:
    """Client configuration with validation."""

    proxy_url: str
    agent_id: str | None = None
    log_level: str = "INFO"
    max_retries: int = 3
    retry_base_ms: int = 1000

    def __post_init__(self) -> None:
        if not self.proxy_url:
            raise ValueError("proxy_url must not be empty")
        if self.max_retries < 0:
            raise ValueError("max_retries must be >= 0")
        if self.retry_base_ms < 0:
            raise ValueError("retry_base_ms must be >= 0")


# ---------------------------------------------------------------------------
# RuleType — mirrors Rust serde(tag="type", content="params")
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RuleType:
    """Guardrail rule type matching Rust enum serialization.

    Serialized form: ``{"type": "MaxSpendPerTx", "params": {"limit": 1000000}}``
    """

    type: str  # PascalCase: MaxSpendPerTx, MaxSpendPerDay, etc.
    params: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"type": self.type, "params": dict(self.params)}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RuleType:
        return cls(type=data["type"], params=dict(data.get("params", {})))


# --- Factory helpers -------------------------------------------------------

def max_spend_per_tx(limit: int) -> RuleType:
    """Create a MaxSpendPerTx rule type."""
    return RuleType(type="MaxSpendPerTx", params={"limit": limit})


def max_spend_per_day(limit: int) -> RuleType:
    """Create a MaxSpendPerDay rule type."""
    return RuleType(type="MaxSpendPerDay", params={"limit": limit})


def allowed_contracts(addresses: list[str]) -> RuleType:
    """Create an AllowedContracts rule type."""
    return RuleType(type="AllowedContracts", params={"addresses": list(addresses)})


def max_leverage(max_val: int) -> RuleType:
    """Create a MaxLeverage rule type."""
    return RuleType(type="MaxLeverage", params={"max": max_val})


def max_slippage(bps: int) -> RuleType:
    """Create a MaxSlippage rule type."""
    return RuleType(type="MaxSlippage", params={"bps": bps})


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Agent:
    """Agent registered with the x402Guard proxy."""

    id: str
    name: str
    owner_address: str
    created_at: str
    is_active: bool


@dataclass(frozen=True)
class GuardrailRule:
    """A guardrail rule attached to an agent."""

    id: str
    agent_id: str
    rule_type: RuleType
    is_active: bool

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> GuardrailRule:
        rule_type_data = data.get("rule_type", {})
        return cls(
            id=data["id"],
            agent_id=data["agent_id"],
            rule_type=RuleType.from_dict(rule_type_data),
            is_active=data["is_active"],
        )


@dataclass(frozen=True)
class SessionKey:
    """EIP-7702 session key for delegated agent access."""

    id: str
    agent_id: str
    public_key: str
    max_spend: int
    spent: int
    allowed_contracts: list[str]
    expires_at: str
    is_revoked: bool
    created_at: str


# ---------------------------------------------------------------------------
# Proxy request / response (camelCase serialization)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ProxyRequest:
    """EVM proxy payment request."""

    target_url: str
    x402_payment: str
    x402_requirements: str
    agent_id: str | None = None
    session_key_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "targetUrl": self.target_url,
            "x402Payment": self.x402_payment,
            "x402Requirements": self.x402_requirements,
        }
        if self.agent_id is not None:
            result["agentId"] = self.agent_id
        if self.session_key_id is not None:
            result["sessionKeyId"] = self.session_key_id
        return result


@dataclass(frozen=True)
class ProxyResponse:
    """EVM proxy payment response."""

    success: bool
    message: str
    tx_hash: str | None = None
    data: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProxyResponse:
        return cls(
            success=data["success"],
            message=data["message"],
            tx_hash=data.get("txHash"),
            data=data.get("data"),
        )


@dataclass(frozen=True)
class SolanaProxyRequest:
    """Solana proxy payment request."""

    target_url: str
    network: str
    vault_owner: str
    amount: int
    x402_payment: str
    destination_program: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "targetUrl": self.target_url,
            "network": self.network,
            "vaultOwner": self.vault_owner,
            "amount": self.amount,
            "x402Payment": self.x402_payment,
        }
        if self.destination_program is not None:
            result["destinationProgram"] = self.destination_program
        return result


@dataclass(frozen=True)
class SolanaProxyResponse:
    """Solana proxy payment response."""

    success: bool
    message: str
    vault_pda: str | None = None
    remaining_daily_capacity: int | None = None
    data: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SolanaProxyResponse:
        return cls(
            success=data["success"],
            message=data["message"],
            vault_pda=data.get("vaultPda"),
            remaining_daily_capacity=data.get("remainingDailyCapacity"),
            data=data.get("data"),
        )


# ---------------------------------------------------------------------------
# API request types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CreateAgentRequest:
    """Request to create a new agent."""

    name: str
    owner_address: str

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "owner_address": self.owner_address}


@dataclass(frozen=True)
class CreateRuleRequest:
    """Request to create a guardrail rule."""

    rule_type: RuleType

    def to_dict(self) -> dict[str, Any]:
        return {"rule_type": self.rule_type.to_dict()}


@dataclass(frozen=True)
class RevokeAllRequest:
    """Request to revoke all session keys for an agent."""

    owner_address: str
    chain_id: int | None = None
    eoa_nonce_hint: int | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"owner_address": self.owner_address}
        if self.chain_id is not None:
            result["chain_id"] = self.chain_id
        if self.eoa_nonce_hint is not None:
            result["eoa_nonce_hint"] = self.eoa_nonce_hint
        return result
