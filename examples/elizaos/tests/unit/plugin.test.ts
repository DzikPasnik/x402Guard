/**
 * Unit tests for the x402Guard ElizaOS plugin structure.
 *
 * Verifies that the plugin object conforms to the @elizaos/core Plugin
 * interface and contains the expected actions and providers.
 */

import { describe, it, expect } from "vitest";
import { x402guardPlugin } from "../../src/plugin.js";
import { guardedPaymentAction } from "../../src/actions/guardedPayment.js";
import { x402guardProvider } from "../../src/providers/x402guard.js";

describe("x402guardPlugin", () => {
  it("has the correct name", () => {
    expect(x402guardPlugin.name).toBe("@elizaos/plugin-x402guard");
  });

  it("has a description", () => {
    expect(x402guardPlugin.description).toBe(
      "x402Guard guardrail proxy integration for ElizaOS agents",
    );
  });

  it("includes guardedPaymentAction in actions", () => {
    expect(x402guardPlugin.actions).toBeDefined();
    expect(x402guardPlugin.actions).toContain(guardedPaymentAction);
    expect(x402guardPlugin.actions).toHaveLength(1);
  });

  it("includes x402guardProvider in providers", () => {
    expect(x402guardPlugin.providers).toBeDefined();
    expect(x402guardPlugin.providers).toContain(x402guardProvider);
    expect(x402guardPlugin.providers).toHaveLength(1);
  });

  it("has config keys for proxy URL and agent ID", () => {
    expect(x402guardPlugin.config).toBeDefined();
    expect(x402guardPlugin.config).toHaveProperty("X402GUARD_PROXY_URL");
    expect(x402guardPlugin.config).toHaveProperty("X402GUARD_AGENT_ID");
  });

  it("has an init function", () => {
    expect(x402guardPlugin.init).toBeDefined();
    expect(typeof x402guardPlugin.init).toBe("function");
  });
});
