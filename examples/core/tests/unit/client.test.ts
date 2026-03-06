import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { X402GuardClient } from "../../src/client.js";
import {
  GuardrailViolationError,
  ProxyUnreachableError,
  X402GuardError,
} from "../../src/errors.js";

const TEST_PROXY_URL = "http://localhost:3000";

function makeClient(): X402GuardClient {
  return new X402GuardClient({
    proxyUrl: TEST_PROXY_URL,
    logLevel: "silent",
    maxRetries: 0, // No retries in tests for speed
  });
}

function mockFetchResponse(
  body: unknown,
  status: number = 200,
  headers?: Record<string, string>,
): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    }),
  );
}

describe("X402GuardClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("throws on missing proxyUrl", () => {
      expect(() => new X402GuardClient({})).toThrow();
    });

    it("accepts valid config", () => {
      const client = new X402GuardClient({
        proxyUrl: TEST_PROXY_URL,
        logLevel: "silent",
      });
      expect(client).toBeDefined();
    });

    it("uses env vars as fallback", () => {
      const originalEnv = process.env.X402GUARD_PROXY_URL;
      process.env.X402GUARD_PROXY_URL = "http://env-proxy:3000";
      try {
        const client = new X402GuardClient({ logLevel: "silent" });
        expect(client).toBeDefined();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.X402GUARD_PROXY_URL;
        } else {
          process.env.X402GUARD_PROXY_URL = originalEnv;
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // healthCheck
  // -----------------------------------------------------------------------

  describe("healthCheck", () => {
    it("returns true on 200", async () => {
      const client = makeClient();
      mockFetchResponse({ status: "ok" });

      const result = await client.healthCheck();
      expect(result).toBe(true);
    });

    it("throws ProxyUnreachableError on network error", async () => {
      const client = makeClient();
      fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(client.healthCheck()).rejects.toThrow(
        ProxyUnreachableError,
      );
      await expect(
        (async () => {
          fetchSpy.mockRejectedValueOnce(
            new TypeError("fetch failed"),
          );
          await client.healthCheck();
        })(),
      ).rejects.toThrow(/localhost:3000/);
    });
  });

  // -----------------------------------------------------------------------
  // createAgent
  // -----------------------------------------------------------------------

  describe("createAgent", () => {
    it("returns typed Agent on success", async () => {
      const client = makeClient();
      const mockAgent = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-agent",
        owner_address: "0xABCD1234",
        created_at: "2026-03-06T12:00:00Z",
        is_active: true,
      };

      mockFetchResponse({
        success: true,
        data: mockAgent,
        error: null,
      });

      const agent = await client.createAgent({
        name: "test-agent",
        owner_address: "0xABCD1234",
      });

      expect(agent.id).toBe(mockAgent.id);
      expect(agent.name).toBe("test-agent");
      expect(agent.owner_address).toBe("0xABCD1234");
      expect(agent.is_active).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // proxyPayment
  // -----------------------------------------------------------------------

  describe("proxyPayment", () => {
    it("returns typed ProxyResponse on success", async () => {
      const client = makeClient();
      const mockResponse = {
        success: true,
        txHash: "0xabc123",
        message: "payment verified and request forwarded",
        data: { result: "ok" },
      };

      mockFetchResponse(mockResponse);

      const result = await client.proxyPayment({
        targetUrl: "https://api.example.com/data",
        x402Payment: "base64payment",
        x402Requirements: "base64requirements",
        agentId: "agent-1",
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toBe("0xabc123");
      expect(result.message).toContain("payment verified");
    });

    it("throws GuardrailViolationError on 403", async () => {
      const client = makeClient();
      mockFetchResponse(
        {
          error:
            "MaxSpendPerTx exceeded: payment 2000000 > limit 1000000",
          code: 403,
        },
        403,
      );

      try {
        await client.proxyPayment({
          targetUrl: "https://api.example.com/data",
          x402Payment: "base64payment",
          x402Requirements: "base64requirements",
        });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GuardrailViolationError);
        const violation = error as GuardrailViolationError;
        expect(violation.ruleType).toBe("MaxSpendPerTx");
        expect(violation.limit).toBe(1000000);
        expect(violation.actual).toBe(2000000);
        expect(violation.statusCode).toBe(403);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("throws X402GuardError on 500", async () => {
      const client = makeClient();
      mockFetchResponse(
        { error: "internal server error", code: 500 },
        500,
      );

      await expect(
        client.createAgent({
          name: "test",
          owner_address: "0x1234",
        }),
      ).rejects.toThrow(X402GuardError);
    });

    it("throws X402GuardError on 404", async () => {
      const client = makeClient();
      mockFetchResponse(
        { error: "agent abc not found", code: 404 },
        404,
      );

      try {
        await client.getAgent("abc");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(X402GuardError);
        expect((error as X402GuardError).statusCode).toBe(404);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Rules
  // -----------------------------------------------------------------------

  describe("listRules", () => {
    it("returns array of GuardrailRule", async () => {
      const client = makeClient();
      const mockRules = [
        {
          id: "rule-1",
          agent_id: "agent-1",
          rule_type: {
            type: "MaxSpendPerTx",
            params: { limit: 1000000 },
          },
          is_active: true,
        },
      ];

      mockFetchResponse({ success: true, data: mockRules });

      const rules = await client.listRules("agent-1");
      expect(rules).toHaveLength(1);
      expect(rules[0].rule_type.type).toBe("MaxSpendPerTx");
    });
  });

  // -----------------------------------------------------------------------
  // Session Keys
  // -----------------------------------------------------------------------

  describe("createSessionKey", () => {
    it("returns typed SessionKey on success", async () => {
      const client = makeClient();
      const mockKey = {
        id: "key-1",
        agent_id: "agent-1",
        public_key: "0xPUBKEY",
        max_spend: 5000000,
        spent: 0,
        allowed_contracts: ["0xCONTRACT1"],
        expires_at: "2026-12-31T23:59:59Z",
        is_revoked: false,
        created_at: "2026-03-06T12:00:00Z",
      };

      mockFetchResponse({
        success: true,
        data: mockKey,
        error: null,
      });

      const key = await client.createSessionKey("agent-1", {
        public_key: "0xPUBKEY",
        max_spend: 5000000,
        allowed_contracts: ["0xCONTRACT1"],
        expires_at: "2026-12-31T23:59:59Z",
      });

      expect(key.id).toBe("key-1");
      expect(key.max_spend).toBe(5000000);
      expect(key.spent).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Revoke All
  // -----------------------------------------------------------------------

  describe("revokeAll", () => {
    it("returns RevokeAllResponse on success", async () => {
      const client = makeClient();
      mockFetchResponse({
        success: true,
        keys_revoked: 3,
        agent_deactivated: true,
        on_chain_authorization: { chain_id: 8453 },
      });

      const result = await client.revokeAll("agent-1", {
        owner_address: "0xOWNER",
      });

      expect(result.keys_revoked).toBe(3);
      expect(result.agent_deactivated).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Solana proxy
  // -----------------------------------------------------------------------

  describe("proxySolanaPayment", () => {
    it("returns typed SolanaProxyResponse on success", async () => {
      const client = makeClient();
      mockFetchResponse({
        success: true,
        message: "vault validated, request forwarded",
        vaultPda: "VaultPDA123",
        remainingDailyCapacity: 9000000,
      });

      const result = await client.proxySolanaPayment({
        targetUrl: "https://api.example.com/data",
        network: "solana-devnet",
        vaultOwner: "Owner123",
        amount: 1000000,
        x402Payment: "base64payment",
      });

      expect(result.success).toBe(true);
      expect(result.vaultPda).toBe("VaultPDA123");
      expect(result.remainingDailyCapacity).toBe(9000000);
    });
  });
});
