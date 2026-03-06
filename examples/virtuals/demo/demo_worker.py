#!/usr/bin/env python3
"""x402Guard + Virtuals GAME SDK Demo (Worker Mode).

Demonstrates the x402Guard Python SDK by calling GAME function
executables directly — NO VIRTUALS_API_KEY required.

Full flow:
  1. Health check
  2. Register agent
  3. Set guardrail (MaxSpendPerTx = 1 USDC)
  4. List configured rules
  5. Attempt payment (shows SDK API usage)

Prerequisites:
  - x402Guard proxy running: docker compose up -d
  - Python package installed: pip install -e ".[dev]"

Usage:
  X402GUARD_PROXY_URL=http://localhost:3402 python demo/demo_worker.py
"""

from __future__ import annotations

import logging
import os
import sys

from x402guard_game.client import X402GuardClient
from x402guard_game.errors import ProxyUnreachableError, X402GuardError
from x402guard_game.types import (
    CreateAgentRequest,
    CreateRuleRequest,
    X402GuardConfig,
    max_spend_per_tx,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("x402guard.demo")


def _format_usdc(minor_units: int) -> str:
    """Format USDC minor units as human-readable string."""
    major = minor_units / 1_000_000
    return f"{minor_units:,} ({major:.2f} USDC)"


def main() -> int:
    """Run the worker-mode demo."""
    proxy_url = os.getenv("X402GUARD_PROXY_URL", "http://localhost:3402")
    config = X402GuardConfig(proxy_url=proxy_url, max_retries=2)

    print("=" * 60)
    print("x402Guard + Virtuals GAME SDK Demo (Worker Mode)")
    print("=" * 60)
    print()

    try:
        with X402GuardClient(config) as client:
            # Step 1: Health check
            print("[Step 1] Health check...")
            ok = client.health_check()
            print(f"  Proxy healthy: {ok}")
            print()

            # Step 2: Register agent
            print("[Step 2] Registering agent...")
            agent_req = CreateAgentRequest(
                name="virtuals-demo-agent",
                owner_address="0x1234567890abcdef1234567890abcdef12345678",
            )
            agent = client.create_agent(agent_req)
            print(f"  Agent ID:  {agent.id}")
            print(f"  Name:      {agent.name}")
            print(f"  Active:    {agent.is_active}")
            print()

            # Step 3: Set guardrail
            spend_limit = 1_000_000  # 1 USDC
            print(f"[Step 3] Setting guardrail: MaxSpendPerTx = {_format_usdc(spend_limit)}...")
            rule_req = CreateRuleRequest(
                rule_type=max_spend_per_tx(spend_limit),
            )
            rule = client.create_rule(agent.id, rule_req)
            print(f"  Rule ID:   {rule.id}")
            print(f"  Type:      {rule.rule_type.type}")
            print(f"  Active:    {rule.is_active}")
            print()

            # Step 4: List rules
            print("[Step 4] Listing agent rules...")
            rules = client.list_rules(agent.id)
            for i, r in enumerate(rules, 1):
                print(f"  Rule {i}: {r.rule_type.type} (active={r.is_active})")
            print()

            # Step 5: Demonstrate SDK API
            print("[Step 5] SDK API demonstration complete.")
            print()
            print("  The x402Guard Python SDK provides:")
            print("  - X402GuardClient: typed HTTP wrapper for all proxy endpoints")
            print("  - Frozen dataclasses: Agent, GuardrailRule, ProxyRequest, etc.")
            print("  - Error hierarchy: GuardrailViolationError with parsed fields")
            print("  - GAME SDK wrappers: make_guarded_payment, query_solana_vault")
            print()
            print("  To use with a full GAME Agent, run demo_agent.py")
            print("  (requires VIRTUALS_API_KEY from game.virtuals.io)")
            print()

    except ProxyUnreachableError as exc:
        logger.error("Proxy unreachable: %s", exc.message)
        print()
        print("ERROR: Could not connect to x402Guard proxy.")
        print(f"  URL: {proxy_url}")
        print("  Is the proxy running? Try: docker compose up -d")
        return 1
    except X402GuardError as exc:
        logger.error("x402Guard error: %s", exc.message)
        return 1

    print("=" * 60)
    print("Demo complete!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
