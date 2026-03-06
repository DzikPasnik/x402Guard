#!/usr/bin/env python3
"""x402Guard + Virtuals GAME SDK Demo (Agent Mode).

Demonstrates the full agentic flow with a Virtuals Protocol GAME Agent
that uses x402Guard for guarded DeFi payments.

REQUIRES: VIRTUALS_API_KEY from game.virtuals.io

Full flow:
  1. Validate environment (API key, proxy URL)
  2. Create GAME Agent with x402Guard DeFi worker
  3. Run agent for a limited number of steps
  4. The GAME LLM planner decides when to call make_guarded_payment

Prerequisites:
  - x402Guard proxy running: docker compose up -d
  - VIRTUALS_API_KEY set (from game.virtuals.io)
  - game_sdk installed: pip install game-python-sdk
  - Python package installed: pip install -e ".[game]"

Usage:
  VIRTUALS_API_KEY=your-key X402GUARD_PROXY_URL=http://localhost:3402 \\
    python demo/demo_agent.py
"""

from __future__ import annotations

import logging
import os
import sys

# Configure logging before imports
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("x402guard.demo")


def main() -> int:
    """Run the agent-mode demo."""
    print("=" * 60)
    print("x402Guard + Virtuals GAME SDK Demo (Agent Mode)")
    print("=" * 60)
    print()

    # --- Validate environment ---
    api_key = os.getenv("VIRTUALS_API_KEY")
    if not api_key:
        print("ERROR: VIRTUALS_API_KEY environment variable is required.")
        print()
        print("  1. Go to https://game.virtuals.io")
        print("  2. Create an account and generate an API key")
        print("  3. Set the environment variable:")
        print("     export VIRTUALS_API_KEY=your-api-key-here")
        print()
        return 1

    proxy_url = os.getenv("X402GUARD_PROXY_URL", "http://localhost:3402")
    logger.info("Using proxy URL: %s", proxy_url)

    # --- Check game_sdk availability ---
    try:
        from game_sdk.game.agent import Agent as GameAgent  # type: ignore[import-untyped]
    except ImportError:
        print("ERROR: game_sdk not installed.")
        print()
        print("  Install it with:")
        print("    pip install game-python-sdk")
        print()
        return 1

    from x402guard_game.functions import HAS_GAME_SDK

    if not HAS_GAME_SDK:
        print("ERROR: game_sdk was found but x402guard_game could not import it.")
        return 1

    from x402guard_game.functions import defi_worker

    # --- Health check ---
    from x402guard_game.client import X402GuardClient
    from x402guard_game.errors import ProxyUnreachableError
    from x402guard_game.types import X402GuardConfig

    config = X402GuardConfig(proxy_url=proxy_url)
    try:
        with X402GuardClient(config) as client:
            client.health_check()
            logger.info("Proxy health check passed")
    except ProxyUnreachableError:
        print(f"ERROR: Cannot reach proxy at {proxy_url}")
        print("  Is docker compose up running?")
        return 1

    # --- Create and run agent ---
    print("[Step 1] Creating GAME Agent with x402Guard DeFi worker...")
    print()

    def get_agent_state() -> dict[str, str]:
        return {
            "proxy_url": proxy_url,
            "status": "ready",
            "description": (
                "This agent can make guarded DeFi payments "
                "through x402Guard proxy."
            ),
        }

    agent = GameAgent(
        api_key=api_key,
        name="x402guard-demo-agent",
        agent_goal=(
            "Demonstrate x402Guard integration by making a guarded payment "
            "and checking vault status."
        ),
        agent_description=(
            "A demo agent that uses x402Guard proxy to make guarded "
            "DeFi payments on Base and Solana networks."
        ),
        get_agent_state_fn=get_agent_state,
        workers=[defi_worker],
    )

    print("[Step 2] Running agent (3 steps)...")
    print("  The GAME LLM planner will decide when to call functions.")
    print()

    agent.run(steps=3)

    print()
    print("=" * 60)
    print("Agent demo complete!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
