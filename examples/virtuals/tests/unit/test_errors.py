"""Tests for x402guard_game error hierarchy."""

from x402guard_game.errors import (
    GuardrailViolationError,
    ProxyUnreachableError,
    RateLimitedError,
    SessionKeyExpiredError,
    X402GuardError,
)


class TestX402GuardError:
    """Base error tests."""

    def test_is_exception(self) -> None:
        err = X402GuardError("something broke", status_code=500)
        assert isinstance(err, Exception)

    def test_message_and_status(self) -> None:
        err = X402GuardError("bad request", status_code=400)
        assert err.message == "bad request"
        assert err.status_code == 400

    def test_status_code_optional(self) -> None:
        err = X402GuardError("unknown")
        assert err.status_code is None


class TestGuardrailViolationError:
    """GuardrailViolationError parsing tests."""

    def test_from_response_parses_max_spend_per_tx(self) -> None:
        body = {"error": "MaxSpendPerTx: limit=1000000 actual=2000000"}
        err = GuardrailViolationError.from_response(body)
        assert err.rule_type == "MaxSpendPerTx"
        assert err.limit == 1_000_000
        assert err.actual == 2_000_000
        assert err.status_code == 403

    def test_from_response_parses_max_spend_per_day(self) -> None:
        body = {"error": "MaxSpendPerDay: limit=5000000 actual=6000000"}
        err = GuardrailViolationError.from_response(body)
        assert err.rule_type == "MaxSpendPerDay"
        assert err.limit == 5_000_000
        assert err.actual == 6_000_000

    def test_from_response_fallback_on_unknown_format(self) -> None:
        body = {"error": "SomeOtherRule: weird format"}
        err = GuardrailViolationError.from_response(body)
        assert err.rule_type == "SomeOtherRule"
        assert err.status_code == 403

    def test_from_response_empty_body(self) -> None:
        body: dict[str, str] = {}
        err = GuardrailViolationError.from_response(body)
        assert err.message == "Guardrail violation"
        assert err.status_code == 403

    def test_has_correct_status_code(self) -> None:
        err = GuardrailViolationError(
            message="test",
            rule_type="MaxSpendPerTx",
            limit=100,
            actual=200,
        )
        assert err.status_code == 403

    def test_is_x402guard_error(self) -> None:
        err = GuardrailViolationError(message="test")
        assert isinstance(err, X402GuardError)
        assert isinstance(err, Exception)


class TestProxyUnreachableError:
    """ProxyUnreachableError tests."""

    def test_status_code_is_none(self) -> None:
        err = ProxyUnreachableError("cannot connect")
        assert err.status_code is None
        assert err.message == "cannot connect"


class TestSessionKeyExpiredError:
    """SessionKeyExpiredError tests."""

    def test_status_code_401(self) -> None:
        err = SessionKeyExpiredError("key expired")
        assert err.status_code == 401


class TestRateLimitedError:
    """RateLimitedError tests."""

    def test_retry_after(self) -> None:
        err = RateLimitedError("slow down", retry_after=30)
        assert err.status_code == 429
        assert err.retry_after == 30
