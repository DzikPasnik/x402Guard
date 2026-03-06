"""Tests for GAME SDK function wrappers.

Tests the raw executable functions (make_guarded_payment, query_solana_vault)
using unittest.mock to patch HTTP responses. Tests for GAME SDK Function
objects are skipped if game_sdk is not installed.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from x402guard_game.functions import (
    HAS_GAME_SDK,
    FunctionResultStatus,
    make_guarded_payment,
    query_solana_vault,
)


def _mock_response(
    status_code: int = 200,
    json_data: dict | None = None,
) -> MagicMock:
    """Create a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.text = ""
    resp.headers = {}
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = Exception("No JSON")
    return resp


class TestMakeGuardedPayment:
    """Tests for make_guarded_payment executable."""

    @patch("x402guard_game.client.httpx.Client")
    def test_returns_done_on_success(
        self,
        mock_client_cls: MagicMock,
    ) -> None:
        mock_http = MagicMock()
        mock_client_cls.return_value = mock_http
        mock_http.request.return_value = _mock_response(
            200,
            json_data={
                "success": True,
                "txHash": "0xabc",
                "message": "Payment forwarded",
                "data": None,
            },
        )

        status, msg, data = make_guarded_payment(
            target_url="https://api.example.com/pay",
            amount="500000",
            agent_id="agent-123",
            network="base-sepolia",
        )

        assert status == FunctionResultStatus.DONE
        assert "Payment forwarded" in msg
        assert data["success"] is True

    @patch("x402guard_game.client.httpx.Client")
    def test_returns_failed_on_guardrail_violation(
        self,
        mock_client_cls: MagicMock,
    ) -> None:
        mock_http = MagicMock()
        mock_client_cls.return_value = mock_http
        mock_http.request.return_value = _mock_response(
            403,
            json_data={
                "error": "MaxSpendPerTx: limit=1000000 actual=2000000",
            },
        )

        status, msg, data = make_guarded_payment(
            target_url="https://api.example.com/pay",
            amount="2000000",
            agent_id="agent-123",
            network="base-sepolia",
        )

        assert status == FunctionResultStatus.FAILED
        assert "BLOCKED" in msg
        assert data["rule_type"] == "MaxSpendPerTx"
        assert data["limit"] == 1_000_000
        assert data["actual"] == 2_000_000

    @patch("x402guard_game.client.httpx.Client")
    def test_solana_network_routing(
        self,
        mock_client_cls: MagicMock,
    ) -> None:
        mock_http = MagicMock()
        mock_client_cls.return_value = mock_http
        mock_http.request.return_value = _mock_response(
            200,
            json_data={
                "success": True,
                "message": "Solana payment validated",
                "vaultPda": "SomePDA123",
                "remainingDailyCapacity": 5000000,
                "data": None,
            },
        )

        status, msg, data = make_guarded_payment(
            target_url="https://api.example.com/pay",
            amount="500000",
            agent_id="owner-pubkey",
            network="solana-devnet",
        )

        assert status == FunctionResultStatus.DONE
        assert data["vault_pda"] == "SomePDA123"


class TestQuerySolanaVault:
    """Tests for query_solana_vault executable."""

    @patch("x402guard_game.client.httpx.Client")
    def test_returns_done_on_success(
        self,
        mock_client_cls: MagicMock,
    ) -> None:
        mock_http = MagicMock()
        mock_client_cls.return_value = mock_http
        mock_http.request.return_value = _mock_response(
            200,
            json_data={
                "owner": "SomeOwner",
                "per_tx_limit": 1000000,
                "daily_cap": 5000000,
                "spent_today": 250000,
            },
        )

        status, msg, data = query_solana_vault("SomeOwner")

        assert status == FunctionResultStatus.DONE
        assert msg == "Vault status retrieved"
        assert data["per_tx_limit"] == 1000000


class TestGameSdkObjects:
    """Tests for GAME SDK Function/WorkerConfig objects.

    Skipped if game_sdk is not installed.
    """

    @pytest.mark.skipif(not HAS_GAME_SDK, reason="game_sdk not installed")
    def test_guarded_payment_fn_is_valid(self) -> None:
        from x402guard_game.functions import guarded_payment_fn

        assert guarded_payment_fn is not None
        assert guarded_payment_fn.fn_name == "make_guarded_payment"
        assert len(guarded_payment_fn.args) == 4

    @pytest.mark.skipif(not HAS_GAME_SDK, reason="game_sdk not installed")
    def test_solana_vault_fn_is_valid(self) -> None:
        from x402guard_game.functions import solana_vault_fn

        assert solana_vault_fn is not None
        assert solana_vault_fn.fn_name == "query_solana_vault"

    @pytest.mark.skipif(not HAS_GAME_SDK, reason="game_sdk not installed")
    def test_defi_worker_has_both_functions(self) -> None:
        from x402guard_game.functions import defi_worker

        assert defi_worker is not None
        assert len(defi_worker.action_space) == 2
