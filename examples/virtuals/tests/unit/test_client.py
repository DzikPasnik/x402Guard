"""Tests for X402GuardClient using unittest.mock to patch httpx."""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from x402guard_game.client import X402GuardClient
from x402guard_game.errors import (
    GuardrailViolationError,
    ProxyUnreachableError,
    X402GuardError,
)
from x402guard_game.types import (
    CreateAgentRequest,
    ProxyRequest,
    X402GuardConfig,
)


def _mock_response(
    status_code: int = 200,
    json_data: dict | None = None,
    text: str = "",
    headers: dict | None = None,
) -> MagicMock:
    """Create a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.text = text
    resp.headers = headers or {}
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = Exception("No JSON")
    return resp


@pytest.fixture()
def config() -> X402GuardConfig:
    return X402GuardConfig(proxy_url="http://test-proxy:3402")


class TestConstructor:
    """Client initialization tests."""

    def test_raises_on_empty_proxy_url(self) -> None:
        with pytest.raises(ValueError, match="proxy_url must not be empty"):
            X402GuardClient(proxy_url="")

    def test_accepts_config_object(self) -> None:
        cfg = X402GuardConfig(proxy_url="http://localhost:3402")
        c = X402GuardClient(cfg)
        c.close()

    def test_accepts_keyword_args(self) -> None:
        c = X402GuardClient(proxy_url="http://localhost:3402")
        c.close()


class TestHealthCheck:
    """Health check endpoint tests."""

    def test_returns_true_on_200(self, config: X402GuardConfig) -> None:
        client = X402GuardClient(config)
        with patch.object(client._http, "get", return_value=_mock_response(200)):
            assert client.health_check() is True
        client.close()

    def test_raises_proxy_unreachable_on_connection_error(self) -> None:
        config = X402GuardConfig(
            proxy_url="http://test-proxy:3402",
            max_retries=0,
        )
        client = X402GuardClient(config)
        with patch.object(
            client._http,
            "get",
            side_effect=httpx.ConnectError("Connection refused"),
        ):
            with pytest.raises(ProxyUnreachableError, match="Proxy unreachable"):
                client.health_check()
        client.close()


class TestCreateAgent:
    """Agent creation tests."""

    def test_returns_typed_agent(self, config: X402GuardConfig) -> None:
        client = X402GuardClient(config)
        mock_resp = _mock_response(
            200,
            json_data={
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "test-agent",
                "owner_address": "0xABCDEF1234567890",
                "created_at": "2026-03-06T00:00:00Z",
                "is_active": True,
            },
        )
        with patch.object(
            client._http, "request", return_value=mock_resp,
        ):
            req = CreateAgentRequest(
                name="test-agent",
                owner_address="0xABCDEF1234567890",
            )
            agent = client.create_agent(req)
            assert agent.id == "550e8400-e29b-41d4-a716-446655440000"
            assert agent.name == "test-agent"
            assert agent.is_active is True
        client.close()


class TestProxyPayment:
    """Proxy payment endpoint tests."""

    def test_returns_typed_response_on_success(
        self,
        config: X402GuardConfig,
    ) -> None:
        client = X402GuardClient(config)
        mock_resp = _mock_response(
            200,
            json_data={
                "success": True,
                "txHash": "0xabc123",
                "message": "Payment forwarded",
                "data": None,
            },
        )
        with patch.object(
            client._http, "request", return_value=mock_resp,
        ):
            req = ProxyRequest(
                target_url="https://api.example.com/pay",
                x402_payment="base64payment",
                x402_requirements="base64reqs",
            )
            resp = client.proxy_payment(req)
            assert resp.success is True
            assert resp.tx_hash == "0xabc123"
            assert resp.message == "Payment forwarded"
        client.close()

    def test_raises_guardrail_violation_on_403(
        self,
        config: X402GuardConfig,
    ) -> None:
        client = X402GuardClient(config)
        mock_resp = _mock_response(
            403,
            json_data={
                "error": "MaxSpendPerTx: limit=1000000 actual=2000000",
            },
        )
        with patch.object(
            client._http, "request", return_value=mock_resp,
        ):
            req = ProxyRequest(
                target_url="https://api.example.com/pay",
                x402_payment="base64payment",
                x402_requirements="base64reqs",
            )
            with pytest.raises(GuardrailViolationError) as exc_info:
                client.proxy_payment(req)

            err = exc_info.value
            assert err.rule_type == "MaxSpendPerTx"
            assert err.limit == 1_000_000
            assert err.actual == 2_000_000
        client.close()


class TestErrorHandling:
    """Generic error handling tests."""

    def test_raises_x402guard_error_on_500(
        self,
        config: X402GuardConfig,
    ) -> None:
        client = X402GuardClient(config)
        mock_resp = _mock_response(
            500,
            json_data={"error": "Internal server error"},
        )
        with patch.object(
            client._http, "request", return_value=mock_resp,
        ):
            req = CreateAgentRequest(
                name="test",
                owner_address="0x1234",
            )
            with pytest.raises(X402GuardError, match="500"):
                client.create_agent(req)
        client.close()

    def test_retry_on_connection_error(self, config: X402GuardConfig) -> None:
        cfg = X402GuardConfig(
            proxy_url="http://test-proxy:3402",
            max_retries=1,
            retry_base_ms=1,  # Fast retries for testing
        )
        client = X402GuardClient(cfg)
        success_resp = _mock_response(
            200,
            json_data={
                "id": "abc",
                "name": "test",
                "owner_address": "0x1",
                "created_at": "2026-01-01T00:00:00Z",
                "is_active": True,
            },
        )
        with patch.object(
            client._http,
            "request",
            side_effect=[
                httpx.ConnectError("Connection refused"),
                success_resp,
            ],
        ):
            req = CreateAgentRequest(name="test", owner_address="0x1")
            agent = client.create_agent(req)
            assert agent.name == "test"
        client.close()

    def test_retry_exhaustion_raises_proxy_unreachable(self) -> None:
        cfg = X402GuardConfig(
            proxy_url="http://test-proxy:3402",
            max_retries=1,
            retry_base_ms=1,
        )
        client = X402GuardClient(cfg)
        with patch.object(
            client._http,
            "request",
            side_effect=httpx.ConnectError("Connection refused"),
        ):
            req = CreateAgentRequest(name="test", owner_address="0x1")
            with pytest.raises(ProxyUnreachableError):
                client.create_agent(req)
        client.close()
