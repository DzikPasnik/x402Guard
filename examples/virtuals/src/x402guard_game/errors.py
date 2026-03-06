"""Typed exception hierarchy for x402Guard client errors.

Mirrors the proxy's error responses with structured fields for
programmatic handling of guardrail violations.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


class X402GuardError(Exception):
    """Base exception for all x402Guard client errors."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        # Use object.__setattr__ so frozen dataclass subclasses can call super().__init__
        object.__setattr__(self, "message", message)
        object.__setattr__(self, "status_code", status_code)


@dataclass(frozen=True)
class GuardrailViolationError(X402GuardError):
    """Raised when a guardrail rule blocks a transaction (HTTP 403).

    Attributes:
        rule_type: The violated rule (e.g. "MaxSpendPerTx").
        limit: The configured limit value.
        actual: The actual value that exceeded the limit.
    """

    rule_type: str = ""
    limit: int | str = 0
    actual: int | str = 0

    def __init__(
        self,
        message: str,
        rule_type: str = "",
        limit: int | str = 0,
        actual: int | str = 0,
    ) -> None:
        # Frozen dataclass — use object.__setattr__ for init
        object.__setattr__(self, "rule_type", rule_type)
        object.__setattr__(self, "limit", limit)
        object.__setattr__(self, "actual", actual)
        super().__init__(message=message, status_code=403)

    @classmethod
    def from_response(cls, body: dict[str, str | int]) -> GuardrailViolationError:
        """Parse the proxy 403 error format.

        Expected format: ``{"error": "MaxSpendPerTx: limit=1000000 actual=2000000"}``
        """
        error_str = str(body.get("error", ""))

        # Pattern: "RuleType: limit=N actual=N"
        match = re.match(
            r"^(\w+):\s*limit=(\d+)\s+actual=(\d+)$",
            error_str,
        )
        if match:
            return cls(
                message=error_str,
                rule_type=match.group(1),
                limit=int(match.group(2)),
                actual=int(match.group(3)),
            )

        # Fallback: unrecognized format
        return cls(
            message=error_str or "Guardrail violation",
            rule_type=error_str.split(":")[0] if ":" in error_str else "Unknown",
        )


class ProxyUnreachableError(X402GuardError):
    """Raised when the x402Guard proxy cannot be reached."""

    def __init__(self, message: str) -> None:
        super().__init__(message=message, status_code=None)


class SessionKeyExpiredError(X402GuardError):
    """Raised when a session key has expired."""

    def __init__(self, message: str) -> None:
        super().__init__(message=message, status_code=401)


class RateLimitedError(X402GuardError):
    """Raised when rate-limited by the proxy (HTTP 429)."""

    def __init__(self, message: str, retry_after: int = 0) -> None:
        super().__init__(message=message, status_code=429)
        self.retry_after = retry_after
