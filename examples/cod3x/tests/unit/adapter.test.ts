/**
 * Unit tests for X402GuardCod3xAdapter.
 *
 * All tests mock global.fetch to isolate from the real proxy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { X402GuardCod3xAdapter } from "../../src/adapter.js";
import { GuardrailViolationError } from "@x402guard/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROXY_URL = "http://localhost:3402";
const AGENT_ID = "test-agent-uuid";

function mockFetchResponse(body: unknown, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("X402GuardCod3xAdapter", () => {
  let adapter: X402GuardCod3xAdapter;

  beforeEach(() => {
    adapter = new X402GuardCod3xAdapter({
      proxyUrl: PROXY_URL,
      agentId: AGENT_ID,
      logLevel: "silent",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  it("throws on missing proxyUrl when no env var is set", () => {
    // Clear env var to ensure no fallback
    const original = process.env.X402GUARD_PROXY_URL;
    delete process.env.X402GUARD_PROXY_URL;

    try {
      expect(() => {
        new X402GuardCod3xAdapter({ logLevel: "silent" });
      }).toThrow();
    } finally {
      if (original !== undefined) {
        process.env.X402GUARD_PROXY_URL = original;
      }
    }
  });

  // -----------------------------------------------------------------------
  // healthCheck
  // -----------------------------------------------------------------------

  it("healthCheck delegates to client and returns boolean", async () => {
    mockFetchResponse({ status: "ok" });

    const result = await adapter.healthCheck();

    expect(result).toBe(true);

    const fetchSpy = vi.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain("/api/v1/health");
  });

  // -----------------------------------------------------------------------
  // guardedExecute
  // -----------------------------------------------------------------------

  it("guardedExecute returns Cod3xGuardedResponse with guardedBy field on success", async () => {
    const proxyResponse = {
      success: true,
      txHash: "0xabc123",
      message: "Payment forwarded",
    };
    mockFetchResponse(proxyResponse);

    const result = await adapter.guardedExecute({
      targetUrl: "https://api.example.com/pay",
      x402Payment: "base64-payment",
      x402Requirements: "base64-requirements",
      agentId: AGENT_ID,
      cod3xSessionId: "session-123",
    });

    expect(result.guardedBy).toBe("x402guard");
    expect(result.success).toBe(true);
    expect(result.txHash).toBe("0xabc123");
    expect(result.message).toBe("Payment forwarded");
  });

  it("guardedExecute throws GuardrailViolationError on 403", async () => {
    mockFetchResponse(
      {
        error: "MaxSpendPerTx exceeded: payment 2000000 > limit 1000000",
        code: 403,
      },
      403,
    );

    await expect(
      adapter.guardedExecute({
        targetUrl: "https://api.example.com/pay",
        x402Payment: "base64-payment",
        x402Requirements: "base64-requirements",
      }),
    ).rejects.toThrow(GuardrailViolationError);
  });

  // -----------------------------------------------------------------------
  // createGuardrail
  // -----------------------------------------------------------------------

  it("createGuardrail delegates to client.createRule", async () => {
    const ruleResponse = {
      success: true,
      data: {
        id: "rule-uuid",
        agent_id: AGENT_ID,
        rule_type: { type: "MaxSpendPerTx", params: { limit: 1000000 } },
        is_active: true,
      },
    };
    mockFetchResponse(ruleResponse);

    const result = await adapter.createGuardrail(AGENT_ID, {
      type: "MaxSpendPerTx",
      params: { limit: 1_000_000 },
    });

    expect(result.id).toBe("rule-uuid");
    expect(result.agent_id).toBe(AGENT_ID);
    expect(result.rule_type.type).toBe("MaxSpendPerTx");

    const fetchSpy = vi.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain(`/api/v1/agents/${AGENT_ID}/rules`);
  });

  // -----------------------------------------------------------------------
  // toSecurityWorker
  // -----------------------------------------------------------------------

  it("toSecurityWorker returns object with securityWorker function", () => {
    const workerConfig = adapter.toSecurityWorker();

    expect(workerConfig).toHaveProperty("securityWorker");
    expect(typeof workerConfig.securityWorker).toBe("function");
  });

  it("securityWorker function returns headers with X-Agent-Id", async () => {
    const workerConfig = adapter.toSecurityWorker();
    const result = await workerConfig.securityWorker(undefined);

    expect(result.headers).toEqual({
      "X-Agent-Id": AGENT_ID,
    });
  });

  // -----------------------------------------------------------------------
  // createAgent
  // -----------------------------------------------------------------------

  it("createAgent delegates to client with correct request shape", async () => {
    const agentResponse = {
      success: true,
      data: {
        id: "new-agent-uuid",
        name: "cod3x-bot",
        owner_address: "0xOwner",
        created_at: "2026-03-06T00:00:00Z",
        is_active: true,
      },
    };
    mockFetchResponse(agentResponse);

    const result = await adapter.createAgent("cod3x-bot", "0xOwner");

    expect(result.id).toBe("new-agent-uuid");
    expect(result.name).toBe("cod3x-bot");
    expect(result.owner_address).toBe("0xOwner");

    const fetchSpy = vi.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain("/api/v1/agents");

    // Verify request body shape
    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody).toEqual({
      name: "cod3x-bot",
      owner_address: "0xOwner",
    });
  });

  // -----------------------------------------------------------------------
  // revokeAllKeys
  // -----------------------------------------------------------------------

  it("revokeAllKeys delegates to client.revokeAll", async () => {
    const revokeResponse = {
      success: true,
      keys_revoked: 3,
      agent_deactivated: true,
    };
    mockFetchResponse(revokeResponse);

    await adapter.revokeAllKeys(AGENT_ID, "0xOwner");

    const fetchSpy = vi.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain(`/api/v1/agents/${AGENT_ID}/revoke-all`);
  });
});
