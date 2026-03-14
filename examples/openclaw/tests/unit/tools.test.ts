/**
 * Unit tests for individual tool handlers.
 *
 * Tests handler logic by mocking X402GuardClient methods.
 */

import { describe, it, expect, vi } from "vitest";
import { healthCheckTool } from "../../src/tools/health.js";
import { createAgentTool, getAgentTool } from "../../src/tools/agents.js";
import { createRuleTool, listRulesTool } from "../../src/tools/rules.js";
import { proxyPaymentTool } from "../../src/tools/payments.js";
import { revokeAllTool } from "../../src/tools/revoke.js";
import {
  X402GuardClient,
  ProxyUnreachableError,
  GuardrailViolationError,
} from "@x402guard/core";

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function createMockClient(): X402GuardClient {
  return {
    healthCheck: vi.fn().mockResolvedValue(true),
    createAgent: vi.fn().mockResolvedValue({
      id: "agent-001",
      name: "test-agent",
      owner_address: "0xABC",
      created_at: "2026-01-01T00:00:00Z",
      is_active: true,
    }),
    getAgent: vi.fn().mockResolvedValue({
      id: "agent-001",
      name: "test-agent",
      owner_address: "0xABC",
      created_at: "2026-01-01T00:00:00Z",
      is_active: true,
    }),
    createRule: vi.fn().mockResolvedValue({
      id: "rule-001",
      agent_id: "agent-001",
      rule_type: { type: "MaxSpendPerTx", params: { limit: 1000000 } },
      is_active: true,
    }),
    listRules: vi.fn().mockResolvedValue([
      {
        id: "rule-001",
        agent_id: "agent-001",
        rule_type: { type: "MaxSpendPerTx", params: { limit: 1000000 } },
        is_active: true,
      },
    ]),
    proxyPayment: vi.fn().mockResolvedValue({
      success: true,
      txHash: "0xDEADBEEF",
      message: "Payment proxied",
    }),
    revokeAll: vi.fn().mockResolvedValue({
      success: true,
      keys_revoked: 3,
      agent_deactivated: true,
    }),
  } as unknown as X402GuardClient;
}

// ---------------------------------------------------------------------------
// Health check tool
// ---------------------------------------------------------------------------

describe("healthCheckTool", () => {
  it("should return online: true when proxy is reachable", async () => {
    const mockClient = createMockClient();
    const tool = healthCheckTool(() => mockClient);

    const result = await tool.handler({});

    expect(result).toEqual({ online: true });
    expect(mockClient.healthCheck).toHaveBeenCalledOnce();
  });

  it("should return online: false with error when proxy is unreachable", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.healthCheck).mockRejectedValue(
      new ProxyUnreachableError("https://proxy.example.com"),
    );

    const tool = healthCheckTool(() => mockClient);
    const result = (await tool.handler({})) as { online: boolean; error: string };

    expect(result.online).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should handle generic errors gracefully", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.healthCheck).mockRejectedValue(
      new Error("Network timeout"),
    );

    const tool = healthCheckTool(() => mockClient);
    const result = (await tool.handler({})) as { online: boolean; error: string };

    expect(result.online).toBe(false);
    expect(result.error).toBe("Network timeout");
  });
});

// ---------------------------------------------------------------------------
// Agent tools
// ---------------------------------------------------------------------------

describe("createAgentTool", () => {
  it("should create an agent with provided params", async () => {
    const mockClient = createMockClient();
    const tool = createAgentTool(() => mockClient);

    const result = await tool.handler({
      name: "my-agent",
      owner_address: "0x1234567890abcdef",
    });

    expect(result).toEqual({
      success: true,
      agent: expect.objectContaining({ name: "test-agent" }),
    });
    expect(mockClient.createAgent).toHaveBeenCalledWith({
      name: "my-agent",
      owner_address: "0x1234567890abcdef",
    });
  });
});

describe("getAgentTool", () => {
  it("should use provided agent_id over default", async () => {
    const mockClient = createMockClient();
    const tool = getAgentTool(() => mockClient, "default-id");

    await tool.handler({ agent_id: "custom-id" });

    expect(mockClient.getAgent).toHaveBeenCalledWith("custom-id");
  });

  it("should fall back to default agent_id", async () => {
    const mockClient = createMockClient();
    const tool = getAgentTool(() => mockClient, "default-id");

    await tool.handler({});

    expect(mockClient.getAgent).toHaveBeenCalledWith("default-id");
  });
});

// ---------------------------------------------------------------------------
// Rule tools
// ---------------------------------------------------------------------------

describe("createRuleTool", () => {
  it("should create MaxSpendPerTx rule", async () => {
    const mockClient = createMockClient();
    const tool = createRuleTool(() => mockClient, "agent-001");

    const result = await tool.handler({
      rule_type: "MaxSpendPerTx",
      limit: 5000000,
    });

    expect(result).toEqual({
      success: true,
      rule: expect.objectContaining({ id: "rule-001" }),
    });
    expect(mockClient.createRule).toHaveBeenCalledWith("agent-001", {
      rule_type: { type: "MaxSpendPerTx", params: { limit: 5000000 } },
    });
  });

  it("should create AllowedContracts rule", async () => {
    const mockClient = createMockClient();
    const tool = createRuleTool(() => mockClient, "agent-001");

    await tool.handler({
      rule_type: "AllowedContracts",
      addresses: ["0xAAA", "0xBBB"],
    });

    expect(mockClient.createRule).toHaveBeenCalledWith("agent-001", {
      rule_type: {
        type: "AllowedContracts",
        params: { addresses: ["0xAAA", "0xBBB"] },
      },
    });
  });

  it("should reject unknown rule type", async () => {
    const mockClient = createMockClient();
    const tool = createRuleTool(() => mockClient, "agent-001");

    await expect(
      tool.handler({ rule_type: "UnknownRule" }),
    ).rejects.toThrow("Unknown rule type: UnknownRule");
  });
});

describe("listRulesTool", () => {
  it("should return rules with count", async () => {
    const mockClient = createMockClient();
    const tool = listRulesTool(() => mockClient, "agent-001");

    const result = (await tool.handler({})) as {
      success: boolean;
      rules: unknown[];
      count: number;
    };

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.rules).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Payment tools
// ---------------------------------------------------------------------------

describe("proxyPaymentTool", () => {
  it("should proxy payment successfully", async () => {
    const mockClient = createMockClient();
    const tool = proxyPaymentTool(() => mockClient, "agent-001");

    const result = await tool.handler({
      target_url: "https://api.example.com",
      x402_payment: "base64-payment",
      x402_requirements: "base64-requirements",
    });

    expect(result).toEqual({
      success: true,
      txHash: "0xDEADBEEF",
      message: "Payment proxied",
    });
  });

  it("should return guardrail violation details when blocked", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.proxyPayment).mockRejectedValue(
      new GuardrailViolationError(
        "MaxSpendPerTx exceeded",
        "MaxSpendPerTx",
        1000000,
        5000000,
      ),
    );

    const tool = proxyPaymentTool(() => mockClient, "agent-001");
    const result = (await tool.handler({
      target_url: "https://api.example.com",
      x402_payment: "base64-payment",
      x402_requirements: "base64-requirements",
    })) as {
      success: boolean;
      blocked: boolean;
      ruleType: string;
      limit: number;
      actual: number;
    };

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.ruleType).toBe("MaxSpendPerTx");
    expect(result.limit).toBe(1000000);
    expect(result.actual).toBe(5000000);
  });

  it("should handle proxy unreachable error", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.proxyPayment).mockRejectedValue(
      new ProxyUnreachableError("https://proxy.example.com"),
    );

    const tool = proxyPaymentTool(() => mockClient, "agent-001");
    const result = (await tool.handler({
      target_url: "https://api.example.com",
      x402_payment: "base64-payment",
      x402_requirements: "base64-requirements",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Proxy unreachable");
  });
});

// ---------------------------------------------------------------------------
// Revoke tool
// ---------------------------------------------------------------------------

describe("revokeAllTool", () => {
  it("should revoke all keys and deactivate agent", async () => {
    const mockClient = createMockClient();
    const tool = revokeAllTool(() => mockClient, "agent-001");

    const result = await tool.handler({
      owner_address: "0x1234",
    });

    expect(result).toEqual({
      success: true,
      keysRevoked: 3,
      agentDeactivated: true,
      onChainAuthorization: undefined,
    });
  });
});
