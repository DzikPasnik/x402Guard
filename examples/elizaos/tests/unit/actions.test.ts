/**
 * Unit tests for the guardedPaymentAction.
 *
 * Mocks the global fetch to simulate X402GuardClient HTTP calls
 * and creates a mock IAgentRuntime with getSetting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { guardedPaymentAction } from "../../src/actions/guardedPayment.js";
import type { IAgentRuntime, Memory, HandlerCallback } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRuntime(
  settings: Record<string, string | undefined> = {},
): IAgentRuntime {
  return {
    getSetting: (key: string): string | undefined => settings[key],
  };
}

function createMockMessage(
  text: string,
  extra: Record<string, unknown> = {},
): Memory {
  return {
    content: { text, ...extra },
  };
}

function createMockCallback(): HandlerCallback & {
  calls: Array<{ text: string; data?: unknown }>;
} {
  const calls: Array<{ text: string; data?: unknown }> = [];
  const fn = async (
    response: { text: string; data?: unknown },
  ): Promise<Memory[]> => {
    calls.push(response);
    return [];
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("guardedPaymentAction", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  it("has the correct name", () => {
    expect(guardedPaymentAction.name).toBe("GUARDED_PAYMENT");
  });

  it("has similes for payment-related phrases", () => {
    expect(guardedPaymentAction.similes).toContain("PAY");
    expect(guardedPaymentAction.similes).toContain("TRANSFER");
    expect(guardedPaymentAction.similes).toContain("X402_PAY");
  });

  // -------------------------------------------------------------------------
  // Validate
  // -------------------------------------------------------------------------

  it("validate returns true when X402GUARD_PROXY_URL is set", async () => {
    const runtime = createMockRuntime({
      X402GUARD_PROXY_URL: "http://localhost:3402",
    });
    const message = createMockMessage("pay for api access");
    const result = await guardedPaymentAction.validate(runtime, message);
    expect(result).toBe(true);
  });

  it("validate returns false when X402GUARD_PROXY_URL is missing", async () => {
    const runtime = createMockRuntime({});
    const message = createMockMessage("pay for api access");
    const result = await guardedPaymentAction.validate(runtime, message);
    expect(result).toBe(false);
  });

  it("validate returns false when X402GUARD_PROXY_URL is empty string", async () => {
    const runtime = createMockRuntime({ X402GUARD_PROXY_URL: "" });
    const message = createMockMessage("pay for api access");
    const result = await guardedPaymentAction.validate(runtime, message);
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Handler: success
  // -------------------------------------------------------------------------

  it("handler calls proxyPayment and returns success", async () => {
    // Mock fetch to simulate successful proxy response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        txHash: "0xabc123",
        message: "Payment forwarded",
      }),
    }) as unknown as typeof globalThis.fetch;

    const runtime = createMockRuntime({
      X402GUARD_PROXY_URL: "http://localhost:3402",
      X402GUARD_AGENT_ID: "agent-123",
    });

    const message = createMockMessage("pay 0.50 USDC", {
      targetUrl: "https://api.example.com/premium",
      amount: 500000,
      x402Payment: "base64url-payment-payload",
      x402Requirements: "base64url-requirements",
    });

    const callback = createMockCallback();
    const result = await guardedPaymentAction.handler(
      runtime,
      message,
      undefined,
      undefined,
      callback,
    );

    expect(result).toHaveProperty("success", true);
    expect(callback.calls).toHaveLength(1);
    expect(callback.calls[0].text).toContain("successfully");
  });

  // -------------------------------------------------------------------------
  // Handler: guardrail violation
  // -------------------------------------------------------------------------

  it("handler catches GuardrailViolationError and reports violation details", async () => {
    // Mock fetch to simulate 403 guardrail violation
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error:
          "MaxSpendPerTx exceeded: payment 2000000 > limit 1000000",
        code: 403,
      }),
    }) as unknown as typeof globalThis.fetch;

    const runtime = createMockRuntime({
      X402GUARD_PROXY_URL: "http://localhost:3402",
      X402GUARD_AGENT_ID: "agent-123",
    });

    const message = createMockMessage("pay 2 USDC", {
      targetUrl: "https://api.example.com/premium",
      amount: 2000000,
      x402Payment: "base64url-payment-payload",
      x402Requirements: "base64url-requirements",
    });

    const callback = createMockCallback();
    const result = await guardedPaymentAction.handler(
      runtime,
      message,
      undefined,
      undefined,
      callback,
    );

    expect(result).toHaveProperty("success", false);
    expect(result).toHaveProperty("violation", true);
    expect(result).toHaveProperty("ruleType", "MaxSpendPerTx");
    expect(result).toHaveProperty("limit", 1000000);
    expect(result).toHaveProperty("actual", 2000000);
    expect(callback.calls).toHaveLength(1);
    expect(callback.calls[0].text).toContain("MaxSpendPerTx");
  });

  // -------------------------------------------------------------------------
  // Handler: missing parameters
  // -------------------------------------------------------------------------

  it("handler returns error when payment parameters are missing", async () => {
    const runtime = createMockRuntime({
      X402GUARD_PROXY_URL: "http://localhost:3402",
    });

    const message = createMockMessage("pay something");

    const callback = createMockCallback();
    const result = await guardedPaymentAction.handler(
      runtime,
      message,
      undefined,
      undefined,
      callback,
    );

    expect(result).toHaveProperty("success", false);
    expect(result).toHaveProperty("error");
    expect(callback.calls).toHaveLength(1);
    expect(callback.calls[0].text).toContain("Missing payment parameters");
  });

  // -------------------------------------------------------------------------
  // Handler: proxy unreachable
  // -------------------------------------------------------------------------

  it("handler handles proxy unreachable error", async () => {
    // Mock fetch to simulate network error
    globalThis.fetch = vi.fn().mockRejectedValue(
      new TypeError("fetch failed"),
    ) as unknown as typeof globalThis.fetch;

    const runtime = createMockRuntime({
      X402GUARD_PROXY_URL: "http://localhost:3402",
      X402GUARD_AGENT_ID: "agent-123",
      X402GUARD_MAX_RETRIES: "0",
    });

    const message = createMockMessage("pay 0.50 USDC", {
      targetUrl: "https://api.example.com/premium",
      amount: 500000,
      x402Payment: "base64url-payment-payload",
      x402Requirements: "base64url-requirements",
    });

    const callback = createMockCallback();
    const result = await guardedPaymentAction.handler(
      runtime,
      message,
      undefined,
      undefined,
      callback,
    );

    expect(result).toHaveProperty("success", false);
    expect(callback.calls).toHaveLength(1);
    // Should mention unreachable or docker compose
    expect(callback.calls[0].text).toContain("unreachable");
  });
});
