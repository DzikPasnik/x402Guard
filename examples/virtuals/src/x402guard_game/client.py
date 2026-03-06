"""X402GuardClient — typed HTTP wrapper for all x402Guard proxy endpoints.

Provides both sync and async interfaces. Uses httpx for HTTP,
stdlib logging (no print), and typed frozen dataclasses for all
request/response types.
"""

from __future__ import annotations

import logging
import os
import time
from types import TracebackType
from typing import Any, Self

import httpx

from x402guard_game.errors import (
    GuardrailViolationError,
    ProxyUnreachableError,
    RateLimitedError,
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
    SessionKey,
    SolanaProxyRequest,
    SolanaProxyResponse,
    X402GuardConfig,
)

logger = logging.getLogger("x402guard")


class X402GuardClient:
    """Synchronous HTTP client for the x402Guard proxy.

    Usage::

        config = X402GuardConfig(proxy_url="http://localhost:3402")
        client = X402GuardClient(config)
        try:
            ok = client.health_check()
        finally:
            client.close()

    Or with context manager::

        with X402GuardClient(config) as client:
            ok = client.health_check()
    """

    def __init__(
        self,
        config: X402GuardConfig | None = None,
        *,
        proxy_url: str | None = None,
        agent_id: str | None = None,
        log_level: str | None = None,
        max_retries: int | None = None,
        retry_base_ms: int | None = None,
    ) -> None:
        if config is not None:
            self._config = config
        else:
            resolved_url = (
                proxy_url
                or os.getenv("X402GUARD_PROXY_URL", "")
            )
            resolved_agent_id = (
                agent_id
                or os.getenv("X402GUARD_AGENT_ID")
            )
            resolved_log_level = (
                log_level
                or os.getenv("X402GUARD_LOG_LEVEL", "INFO")
            )
            self._config = X402GuardConfig(
                proxy_url=resolved_url,
                agent_id=resolved_agent_id,
                log_level=resolved_log_level,
                max_retries=max_retries if max_retries is not None else 3,
                retry_base_ms=retry_base_ms if retry_base_ms is not None else 1000,
            )

        logging.getLogger("x402guard").setLevel(self._config.log_level)
        self._http = httpx.Client(
            base_url=self._config.proxy_url,
            timeout=30.0,
        )

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._http.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute an HTTP request with retry and error handling."""
        return self._retry_request(method, path, body, attempt=0)

    def _retry_request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None,
        attempt: int = 0,
    ) -> dict[str, Any]:
        """Send request with exponential backoff retry on 429 / network errors."""
        try:
            response = self._http.request(
                method,
                path,
                json=body,
                headers={"Content-Type": "application/json"},
            )
        except httpx.ConnectError as exc:
            if attempt < self._config.max_retries:
                wait_ms = self._config.retry_base_ms * (2 ** attempt)
                logger.warning(
                    "Connection error (attempt %d/%d), retrying in %dms: %s",
                    attempt + 1,
                    self._config.max_retries,
                    wait_ms,
                    exc,
                )
                time.sleep(wait_ms / 1000.0)
                return self._retry_request(method, path, body, attempt + 1)
            raise ProxyUnreachableError(
                f"Proxy unreachable at {self._config.proxy_url} "
                f"-- is docker compose up running?"
            ) from exc

        # Handle rate limiting
        if response.status_code == 429:
            if attempt < self._config.max_retries:
                retry_after = int(response.headers.get("Retry-After", "1"))
                wait_ms = max(
                    retry_after * 1000,
                    self._config.retry_base_ms * (2 ** attempt),
                )
                logger.warning(
                    "Rate limited (attempt %d/%d), retrying in %dms",
                    attempt + 1,
                    self._config.max_retries,
                    wait_ms,
                )
                time.sleep(wait_ms / 1000.0)
                return self._retry_request(method, path, body, attempt + 1)
            raise RateLimitedError(
                message="Rate limited by proxy",
                retry_after=int(response.headers.get("Retry-After", "0")),
            )

        # Handle guardrail violations
        if response.status_code == 403:
            try:
                error_body = response.json()
            except Exception:
                error_body = {"error": response.text}
            raise GuardrailViolationError.from_response(error_body)

        # Handle other errors
        if response.status_code >= 400:
            try:
                error_body = response.json()
                msg = error_body.get("error", response.text)
            except Exception:
                msg = response.text
            raise X402GuardError(
                message=f"HTTP {response.status_code}: {msg}",
                status_code=response.status_code,
            )

        # Parse successful response
        if response.status_code == 204:
            return {}

        try:
            return response.json()  # type: ignore[no-any-return]
        except Exception:
            return {}

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def health_check(self) -> bool:
        """Check proxy health. Returns True on 200.

        Raises:
            ProxyUnreachableError: If proxy cannot be reached.
        """
        try:
            self._http.get("/health")
            return True
        except httpx.ConnectError as exc:
            raise ProxyUnreachableError(
                f"Proxy unreachable at {self._config.proxy_url} "
                f"-- is docker compose up running?"
            ) from exc

    # ------------------------------------------------------------------
    # Agents
    # ------------------------------------------------------------------

    def create_agent(self, req: CreateAgentRequest) -> Agent:
        """Create a new agent. POST /api/v1/agents."""
        data = self._request("POST", "/api/v1/agents", req.to_dict())
        return Agent(
            id=data["id"],
            name=data["name"],
            owner_address=data["owner_address"],
            created_at=data["created_at"],
            is_active=data["is_active"],
        )

    def get_agent(self, agent_id: str) -> Agent:
        """Get agent by ID. GET /api/v1/agents/:id."""
        data = self._request("GET", f"/api/v1/agents/{agent_id}")
        return Agent(
            id=data["id"],
            name=data["name"],
            owner_address=data["owner_address"],
            created_at=data["created_at"],
            is_active=data["is_active"],
        )

    # ------------------------------------------------------------------
    # Guardrail Rules
    # ------------------------------------------------------------------

    def create_rule(
        self,
        agent_id: str,
        rule: CreateRuleRequest,
    ) -> GuardrailRule:
        """Create a guardrail rule. POST /api/v1/agents/:id/rules."""
        data = self._request(
            "POST",
            f"/api/v1/agents/{agent_id}/rules",
            rule.to_dict(),
        )
        return GuardrailRule.from_dict(data)

    def list_rules(self, agent_id: str) -> list[GuardrailRule]:
        """List guardrail rules. GET /api/v1/agents/:id/rules."""
        data = self._request("GET", f"/api/v1/agents/{agent_id}/rules")
        if isinstance(data, list):
            return [GuardrailRule.from_dict(item) for item in data]
        # Some APIs wrap in {"rules": [...]}
        rules_list = data.get("rules", data.get("data", []))
        return [GuardrailRule.from_dict(item) for item in rules_list]

    # ------------------------------------------------------------------
    # Session Keys
    # ------------------------------------------------------------------

    def create_session_key(
        self,
        agent_id: str,
        public_key: str,
        max_spend: int,
        allowed_contracts: list[str] | None = None,
        expires_at: str | None = None,
    ) -> SessionKey:
        """Create a session key. POST /api/v1/agents/:id/session-keys."""
        body: dict[str, Any] = {
            "public_key": public_key,
            "max_spend": max_spend,
        }
        if allowed_contracts is not None:
            body["allowed_contracts"] = list(allowed_contracts)
        if expires_at is not None:
            body["expires_at"] = expires_at

        data = self._request(
            "POST",
            f"/api/v1/agents/{agent_id}/session-keys",
            body,
        )
        return SessionKey(
            id=data["id"],
            agent_id=data["agent_id"],
            public_key=data["public_key"],
            max_spend=data["max_spend"],
            spent=data["spent"],
            allowed_contracts=data.get("allowed_contracts", []),
            expires_at=data["expires_at"],
            is_revoked=data["is_revoked"],
            created_at=data["created_at"],
        )

    # ------------------------------------------------------------------
    # Revocation
    # ------------------------------------------------------------------

    def revoke_all(self, agent_id: str, req: RevokeAllRequest) -> None:
        """Revoke all session keys. POST /api/v1/agents/:id/revoke-all."""
        self._request(
            "POST",
            f"/api/v1/agents/{agent_id}/revoke-all",
            req.to_dict(),
        )

    # ------------------------------------------------------------------
    # Proxy Payments
    # ------------------------------------------------------------------

    def proxy_payment(self, req: ProxyRequest) -> ProxyResponse:
        """Submit EVM proxy payment. POST /api/v1/proxy."""
        data = self._request("POST", "/api/v1/proxy", req.to_dict())
        return ProxyResponse.from_dict(data)

    def proxy_solana_payment(
        self,
        req: SolanaProxyRequest,
    ) -> SolanaProxyResponse:
        """Submit Solana proxy payment. POST /api/v1/proxy/solana."""
        data = self._request("POST", "/api/v1/proxy/solana", req.to_dict())
        return SolanaProxyResponse.from_dict(data)

    # ------------------------------------------------------------------
    # Solana Vault
    # ------------------------------------------------------------------

    def get_vault_status(self, owner_pubkey: str) -> dict[str, Any]:
        """Get Solana vault status. GET /api/v1/solana/vault/:owner."""
        return self._request("GET", f"/api/v1/solana/vault/{owner_pubkey}")
