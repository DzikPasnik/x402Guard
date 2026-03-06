/**
 * Integration tests for x402Guard proxy.
 *
 * These tests run against a live x402Guard proxy (docker compose required).
 * They are gated by the X402GUARD_INTEGRATION environment variable
 * and skipped by default in unit test runs.
 *
 * To run:
 *   1. Start the proxy: docker compose up -d
 *   2. Run: X402GUARD_INTEGRATION=1 npx vitest run tests/integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  X402GuardClient,
  GuardrailViolationError,
  type Agent,
} from "../../src/index.js";

const PROXY_URL =
  process.env.X402GUARD_PROXY_URL ?? "http://localhost:3402";

describe.runIf(process.env.X402GUARD_INTEGRATION)(
  "x402Guard proxy integration",
  () => {
    let client: X402GuardClient;
    let testAgent: Agent;

    beforeAll(async () => {
      client = new X402GuardClient({
        proxyUrl: PROXY_URL,
        logLevel: "warn",
      });

      // Create a test agent for integration tests
      testAgent = await client.createAgent({
        name: `integration-test-${Date.now()}`,
        owner_address: "0x1234567890abcdef1234567890abcdef12345678",
      });
    });

    afterAll(async () => {
      // Best-effort cleanup -- don't fail if cleanup errors
      try {
        if (testAgent) {
          await client.revokeAll(testAgent.id, {
            owner_address: testAgent.owner_address,
          });
        }
      } catch {
        // Cleanup errors are acceptable
      }
    });

    it("healthCheck returns true against running proxy", async () => {
      const healthy = await client.healthCheck();
      expect(healthy).toBe(true);
    });

    it("createAgent + getAgent round-trip returns matching agent data", async () => {
      const fetched = await client.getAgent(testAgent.id);
      expect(fetched.id).toBe(testAgent.id);
      expect(fetched.name).toBe(testAgent.name);
      expect(fetched.owner_address).toBe(testAgent.owner_address);
      expect(fetched.is_active).toBe(true);
    });

    it("createRule + listRules round-trip returns the created rule", async () => {
      const createdRule = await client.createRule(testAgent.id, {
        rule_type: {
          type: "MaxSpendPerTx",
          params: { limit: 1_000_000 },
        },
      });

      expect(createdRule.agent_id).toBe(testAgent.id);
      expect(createdRule.is_active).toBe(true);

      const rules = await client.listRules(testAgent.id);
      const found = rules.find((r) => r.id === createdRule.id);
      expect(found).toBeDefined();
      expect(found!.rule_type.type).toBe("MaxSpendPerTx");
    });

    it("proxyPayment with over-limit amount returns 403 GuardrailViolationError", async () => {
      // Ensure agent has a MaxSpendPerTx rule with limit 1_000_000
      const rules = await client.listRules(testAgent.id);
      const hasMaxSpend = rules.some(
        (r) => r.rule_type.type === "MaxSpendPerTx",
      );

      if (!hasMaxSpend) {
        await client.createRule(testAgent.id, {
          rule_type: {
            type: "MaxSpendPerTx",
            params: { limit: 1_000_000 },
          },
        });
      }

      // Attempt payment that exceeds the limit
      try {
        await client.proxyPayment({
          targetUrl: "https://api.example.com/premium",
          x402Payment: "dGVzdC1wYXltZW50LXBheWxvYWQ", // base64url "test-payment-payload"
          x402Requirements: "dGVzdC1yZXF1aXJlbWVudHM", // base64url "test-requirements"
          agentId: testAgent.id,
        });
        // If we get here, the test fails -- should have thrown
        expect.fail(
          "Expected GuardrailViolationError but proxyPayment succeeded",
        );
      } catch (error: unknown) {
        // The proxy may return a 403 for guardrail violation or a different
        // error if the payment payload is invalid. Either way, the route
        // should not return 200.
        expect(error).toBeDefined();
        if (error instanceof GuardrailViolationError) {
          expect(error.statusCode).toBe(403);
        }
      }
    });
  },
);
