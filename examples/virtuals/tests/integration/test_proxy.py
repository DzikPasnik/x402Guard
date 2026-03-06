"""Integration tests for x402Guard proxy.

These tests require a running x402Guard proxy (docker compose up).
They are gated by the X402GUARD_INTEGRATION environment variable
and skipped by default in unit test runs.

Run with:
    X402GUARD_INTEGRATION=1 pytest tests/integration/ -v
"""

import logging
import os
import uuid

import pytest

from x402guard_game.client import X402GuardClient
from x402guard_game.errors import GuardrailViolationError
from x402guard_game.types import (
    CreateAgentRequest,
    CreateRuleRequest,
    ProxyRequest,
    X402GuardConfig,
    max_spend_per_tx,
)

logger = logging.getLogger("x402guard.test")

pytestmark = pytest.mark.skipunless(
    os.getenv("X402GUARD_INTEGRATION"),
    "requires running proxy (set X402GUARD_INTEGRATION=1)",
)


@pytest.fixture()
def proxy_url() -> str:
    return os.getenv("X402GUARD_PROXY_URL", "http://localhost:3402")


@pytest.fixture()
def client(proxy_url: str) -> X402GuardClient:
    config = X402GuardConfig(proxy_url=proxy_url, max_retries=1)
    c = X402GuardClient(config)
    yield c  # type: ignore[misc]
    c.close()


class TestIntegrationProxy:
    """Integration tests against a live x402Guard proxy."""

    _created_agent_ids: list[str] = []

    def test_health_check(self, client: X402GuardClient) -> None:
        assert client.health_check() is True

    def test_create_and_get_agent(self, client: X402GuardClient) -> None:
        req = CreateAgentRequest(
            name=f"integration-test-{uuid.uuid4().hex[:8]}",
            owner_address="0x1234567890abcdef1234567890abcdef12345678",
        )
        agent = client.create_agent(req)
        self._created_agent_ids.append(agent.id)

        assert agent.name == req.name
        assert agent.owner_address == req.owner_address
        assert agent.is_active is True

        fetched = client.get_agent(agent.id)
        assert fetched.id == agent.id
        assert fetched.name == agent.name

    def test_create_and_list_rules(self, client: X402GuardClient) -> None:
        agent_req = CreateAgentRequest(
            name=f"rules-test-{uuid.uuid4().hex[:8]}",
            owner_address="0x1234567890abcdef1234567890abcdef12345678",
        )
        agent = client.create_agent(agent_req)
        self._created_agent_ids.append(agent.id)

        rule_req = CreateRuleRequest(rule_type=max_spend_per_tx(1_000_000))
        rule = client.create_rule(agent.id, rule_req)
        assert rule.rule_type.type == "MaxSpendPerTx"
        assert rule.is_active is True

        rules = client.list_rules(agent.id)
        assert len(rules) >= 1
        assert any(r.id == rule.id for r in rules)

    def test_proxy_payment_guardrail_violation(
        self,
        client: X402GuardClient,
    ) -> None:
        # Setup: agent with low spending limit
        agent_req = CreateAgentRequest(
            name=f"violation-test-{uuid.uuid4().hex[:8]}",
            owner_address="0x1234567890abcdef1234567890abcdef12345678",
        )
        agent = client.create_agent(agent_req)
        self._created_agent_ids.append(agent.id)

        rule_req = CreateRuleRequest(rule_type=max_spend_per_tx(1_000_000))
        client.create_rule(agent.id, rule_req)

        # Attempt payment exceeding limit
        proxy_req = ProxyRequest(
            target_url="https://api.example.com/pay",
            x402_payment="dGVzdA==",
            x402_requirements="dGVzdA==",
            agent_id=agent.id,
        )
        with pytest.raises(GuardrailViolationError):
            client.proxy_payment(proxy_req)
