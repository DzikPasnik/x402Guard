/**
 * Unit tests for the x402Guard OpenClaw plugin.
 *
 * Tests plugin registration, tool creation, and tool handlers
 * using a mock PluginApi and mock X402GuardClient.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PluginApi, ToolDescriptor } from "../../src/openclaw.js";

// We import the register function directly
import register from "../../src/plugin.js";

// ---------------------------------------------------------------------------
// Mock PluginApi
// ---------------------------------------------------------------------------

function createMockApi(config: Record<string, unknown> = {}): {
  api: PluginApi;
  tools: ToolDescriptor[];
} {
  const tools: ToolDescriptor[] = [];

  const api: PluginApi = {
    config,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerTool: vi.fn((tool: ToolDescriptor) => {
      tools.push(tool);
    }),
    registerCommand: vi.fn(),
  };

  return { api, tools };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("x402Guard OpenClaw Plugin", () => {
  describe("register()", () => {
    it("should throw if proxyUrl is not configured", () => {
      const { api } = createMockApi({});
      // Clear env to ensure no fallback
      const original = process.env.X402GUARD_PROXY_URL;
      delete process.env.X402GUARD_PROXY_URL;

      expect(() => register(api)).toThrow("proxyUrl not configured");

      process.env.X402GUARD_PROXY_URL = original;
    });

    it("should register 11 tools when proxyUrl is provided", () => {
      const { api, tools } = createMockApi({
        proxyUrl: "https://proxy.example.com",
      });

      register(api);

      expect(tools).toHaveLength(11);
      expect(api.registerTool).toHaveBeenCalledTimes(11);
    });

    it("should register tools with correct names", () => {
      const { api, tools } = createMockApi({
        proxyUrl: "https://proxy.example.com",
      });

      register(api);

      const names = tools.map((t) => t.name);
      expect(names).toContain("x402guard_health_check");
      expect(names).toContain("x402guard_create_agent");
      expect(names).toContain("x402guard_get_agent");
      expect(names).toContain("x402guard_create_rule");
      expect(names).toContain("x402guard_list_rules");
      expect(names).toContain("x402guard_create_session_key");
      expect(names).toContain("x402guard_list_session_keys");
      expect(names).toContain("x402guard_revoke_session_key");
      expect(names).toContain("x402guard_proxy_payment");
      expect(names).toContain("x402guard_proxy_solana_payment");
      expect(names).toContain("x402guard_revoke_all");
    });

    it("should use snake_case for all tool names", () => {
      const { api, tools } = createMockApi({
        proxyUrl: "https://proxy.example.com",
      });

      register(api);

      for (const tool of tools) {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });

    it("should log initialization message", () => {
      const { api } = createMockApi({
        proxyUrl: "https://proxy.example.com",
      });

      register(api);

      expect(api.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("x402Guard plugin initializing"),
      );
    });

    it("should log default agent ID when provided", () => {
      const { api } = createMockApi({
        proxyUrl: "https://proxy.example.com",
        agentId: "test-agent-id",
      });

      register(api);

      expect(api.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("test-agent-id"),
      );
    });

    it("should fall back to env var for proxyUrl", () => {
      const original = process.env.X402GUARD_PROXY_URL;
      process.env.X402GUARD_PROXY_URL = "https://env-proxy.example.com";

      const { api, tools } = createMockApi({});

      register(api);

      expect(tools).toHaveLength(11);
      expect(api.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("env-proxy.example.com"),
      );

      process.env.X402GUARD_PROXY_URL = original;
    });

    it("should have descriptions on all tools", () => {
      const { api, tools } = createMockApi({
        proxyUrl: "https://proxy.example.com",
      });

      register(api);

      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(20);
      }
    });

    it("should have valid inputSchema on all tools", () => {
      const { api, tools } = createMockApi({
        proxyUrl: "https://proxy.example.com",
      });

      register(api);

      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });
  });
});

describe("Tool handlers — agent_id fallback", () => {
  it("should return error if no agent_id and no default", async () => {
    const { api, tools } = createMockApi({
      proxyUrl: "https://proxy.example.com",
    });

    register(api);

    const getAgentTool = tools.find((t) => t.name === "x402guard_get_agent")!;
    const result = await getAgentTool.handler({});

    expect(result).toEqual({
      success: false,
      error: "agent_id is required (no default configured)",
    });
  });

  it("should return error for list_rules without agent_id", async () => {
    const { api, tools } = createMockApi({
      proxyUrl: "https://proxy.example.com",
    });

    register(api);

    const listRulesTool = tools.find((t) => t.name === "x402guard_list_rules")!;
    const result = await listRulesTool.handler({});

    expect(result).toEqual({
      success: false,
      error: "agent_id is required (no default configured)",
    });
  });

  it("should return error for revoke_all without agent_id", async () => {
    const { api, tools } = createMockApi({
      proxyUrl: "https://proxy.example.com",
    });

    register(api);

    const revokeAllTool = tools.find((t) => t.name === "x402guard_revoke_all")!;
    const result = await revokeAllTool.handler({
      owner_address: "0x1234",
    });

    expect(result).toEqual({
      success: false,
      error: "agent_id is required (no default configured)",
    });
  });
});
