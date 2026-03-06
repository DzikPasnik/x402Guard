import { describe, expect, it } from "vitest";
import {
  GuardrailViolationError,
  ProxyUnreachableError,
  RateLimitedError,
  SessionKeyExpiredError,
  X402GuardError,
} from "../../src/errors.js";
import type { ErrorResponse } from "../../src/types.js";

describe("X402GuardError", () => {
  it("is instanceof Error", () => {
    const error = new X402GuardError("test error", 500);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(X402GuardError);
    expect(error.message).toBe("test error");
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe("X402GuardError");
  });

  it("works without statusCode", () => {
    const error = new X402GuardError("no status");
    expect(error.statusCode).toBeUndefined();
  });
});

describe("GuardrailViolationError", () => {
  it("has correct statusCode (403)", () => {
    const error = new GuardrailViolationError(
      "test",
      "MaxSpendPerTx",
      1000000,
      2000000,
    );
    expect(error.statusCode).toBe(403);
    expect(error.name).toBe("GuardrailViolationError");
    expect(error).toBeInstanceOf(X402GuardError);
    expect(error).toBeInstanceOf(Error);
  });

  describe("fromApiResponse", () => {
    it("parses MaxSpendPerTx exceeded format", () => {
      const body: ErrorResponse = {
        error:
          "MaxSpendPerTx exceeded: payment 2000000 > limit 1000000",
        code: 403,
      };
      const error = GuardrailViolationError.fromApiResponse(body);
      expect(error.ruleType).toBe("MaxSpendPerTx");
      expect(error.limit).toBe(1000000);
      expect(error.actual).toBe(2000000);
      expect(error.statusCode).toBe(403);
    });

    it("parses MaxSpendPerDay exceeded format", () => {
      const body: ErrorResponse = {
        error:
          "MaxSpendPerDay exceeded: daily total 11000000 > limit 10000000",
        code: 403,
      };
      const error = GuardrailViolationError.fromApiResponse(body);
      expect(error.ruleType).toBe("MaxSpendPerDay");
      expect(error.limit).toBe(10000000);
      expect(error.actual).toBe(11000000);
    });

    it("parses MaxLeverage exceeded format", () => {
      const body: ErrorResponse = {
        error: "MaxLeverage exceeded: 10 > max 5",
        code: 403,
      };
      const error = GuardrailViolationError.fromApiResponse(body);
      expect(error.ruleType).toBe("MaxLeverage");
      expect(error.limit).toBe(5);
      expect(error.actual).toBe(10);
    });

    it("parses MaxSlippage exceeded format", () => {
      const body: ErrorResponse = {
        error: "MaxSlippage exceeded: 100 bps > max 50 bps",
        code: 403,
      };
      const error = GuardrailViolationError.fromApiResponse(body);
      expect(error.ruleType).toBe("MaxSlippage");
      expect(error.limit).toBe(50);
      expect(error.actual).toBe(100);
    });

    it("parses AllowedContracts not in whitelist format", () => {
      const body: ErrorResponse = {
        error:
          "AllowedContracts: target 0xddddddddddddddddddddddddddddddddddddddd not in whitelist",
        code: 403,
      };
      const error = GuardrailViolationError.fromApiResponse(body);
      expect(error.ruleType).toBe("AllowedContracts");
      expect(error.limit).toBe("whitelist");
      expect(error.actual).toBe(
        "0xddddddddddddddddddddddddddddddddddddddd",
      );
    });

    it("strips guardrail violated prefix", () => {
      const body: ErrorResponse = {
        error:
          "guardrail violated: MaxSpendPerTx exceeded: payment 2000000 > limit 1000000",
        code: 403,
      };
      const error = GuardrailViolationError.fromApiResponse(body);
      expect(error.ruleType).toBe("MaxSpendPerTx");
      expect(error.limit).toBe(1000000);
      expect(error.actual).toBe(2000000);
    });

    it("handles unknown format gracefully", () => {
      const body: ErrorResponse = {
        error: "some unknown error format",
        code: 403,
      };
      const error = GuardrailViolationError.fromApiResponse(body);
      expect(error.ruleType).toBe("Unknown");
      expect(error.limit).toBe("unknown");
      expect(error.actual).toBe("unknown");
    });
  });
});

describe("ProxyUnreachableError", () => {
  it("includes proxy URL in message", () => {
    const error = new ProxyUnreachableError("http://localhost:3000");
    expect(error.message).toContain("http://localhost:3000");
    expect(error.message).toContain("docker compose up");
    expect(error.name).toBe("ProxyUnreachableError");
    expect(error).toBeInstanceOf(X402GuardError);
  });
});

describe("SessionKeyExpiredError", () => {
  it("includes key ID in message", () => {
    const error = new SessionKeyExpiredError("abc-123");
    expect(error.message).toContain("abc-123");
    expect(error.statusCode).toBe(403);
    expect(error.name).toBe("SessionKeyExpiredError");
  });
});

describe("RateLimitedError", () => {
  it("includes retryAfter value", () => {
    const error = new RateLimitedError(30);
    expect(error.retryAfter).toBe(30);
    expect(error.statusCode).toBe(429);
    expect(error.name).toBe("RateLimitedError");
    expect(error.message).toContain("30");
  });
});
