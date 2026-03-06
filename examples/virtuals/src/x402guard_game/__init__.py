"""x402guard-game-plugin — Virtuals Protocol GAME SDK plugin for x402Guard.

Provides a typed Python client for the x402Guard proxy and GAME SDK
function wrappers for guarded DeFi payments.
"""

from x402guard_game.client import X402GuardClient
from x402guard_game.errors import (
    GuardrailViolationError,
    ProxyUnreachableError,
    RateLimitedError,
    SessionKeyExpiredError,
    X402GuardError,
)
from x402guard_game.types import (
    Agent,
    CreateAgentRequest,
    CreateRuleRequest,
    GuardrailRule,
    ProxyRequest,
    ProxyResponse,
    RevokeAllRequest,
    RuleType,
    SessionKey,
    SolanaProxyRequest,
    SolanaProxyResponse,
    X402GuardConfig,
    allowed_contracts,
    max_leverage,
    max_slippage,
    max_spend_per_day,
    max_spend_per_tx,
)

__all__ = [
    # Client
    "X402GuardClient",
    # Config
    "X402GuardConfig",
    # Domain types
    "Agent",
    "GuardrailRule",
    "RuleType",
    "SessionKey",
    # Request / response
    "ProxyRequest",
    "ProxyResponse",
    "SolanaProxyRequest",
    "SolanaProxyResponse",
    "CreateAgentRequest",
    "CreateRuleRequest",
    "RevokeAllRequest",
    # Errors
    "X402GuardError",
    "GuardrailViolationError",
    "ProxyUnreachableError",
    "SessionKeyExpiredError",
    "RateLimitedError",
    # Factory helpers
    "max_spend_per_tx",
    "max_spend_per_day",
    "allowed_contracts",
    "max_leverage",
    "max_slippage",
]
