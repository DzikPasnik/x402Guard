/**
 * x402Guard ElizaOS Plugin
 *
 * Integrates the x402Guard guardrail proxy with ElizaOS agents.
 * Provides:
 * - GUARDED_PAYMENT action: Make guarded x402 payments (EVM + Solana)
 * - X402GUARD_STATUS provider: Proxy health status in agent context
 *
 * Configuration is read from ElizaOS runtime settings (character.json):
 * - X402GUARD_PROXY_URL: URL of the x402Guard proxy
 * - X402GUARD_AGENT_ID: UUID of the registered agent
 */

import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { X402GuardClient, ProxyUnreachableError, createLogger } from "@x402guard/core";
import { guardedPaymentAction } from "./actions/guardedPayment.js";
import { x402guardProvider } from "./providers/x402guard.js";

const logger = createLogger("elizaos-x402guard-plugin");

/**
 * x402Guard plugin for ElizaOS.
 *
 * Registers the GUARDED_PAYMENT action and X402GUARD_STATUS provider.
 * On init, verifies proxy connectivity with a health check.
 *
 * @example
 * ```typescript
 * import { x402guardPlugin } from "@elizaos/plugin-x402guard";
 *
 * const character = {
 *   plugins: [x402guardPlugin],
 *   settings: {
 *     X402GUARD_PROXY_URL: "http://localhost:3402",
 *     X402GUARD_AGENT_ID: "your-agent-uuid",
 *   },
 * };
 * ```
 */
export const x402guardPlugin: Plugin = {
  name: "@elizaos/plugin-x402guard",
  description: "x402Guard guardrail proxy integration for ElizaOS agents",

  config: {
    X402GUARD_PROXY_URL:
      "URL of the x402Guard proxy (e.g. http://localhost:3402)",
    X402GUARD_AGENT_ID: "UUID of the registered agent",
  },

  /**
   * Initialize the plugin by verifying proxy connectivity.
   *
   * @throws ProxyUnreachableError with actionable message if proxy is down
   */
  init: async (
    _config: Record<string, string>,
    runtime: IAgentRuntime,
  ): Promise<void> => {
    const proxyUrl =
      runtime.getSetting("X402GUARD_PROXY_URL") ??
      process.env.X402GUARD_PROXY_URL;

    if (!proxyUrl) {
      logger.warn(
        "X402GUARD_PROXY_URL not configured -- plugin will not be able to proxy payments",
      );
      return;
    }

    const logLevel = runtime.getSetting("X402GUARD_LOG_LEVEL");

    try {
      const client = new X402GuardClient({
        proxyUrl,
        logLevel: logLevel as "info" | "debug" | "warn" | "error" | undefined,
      });
      await client.healthCheck();
      logger.info({ proxyUrl }, "x402Guard proxy connected successfully");
    } catch (error: unknown) {
      if (error instanceof ProxyUnreachableError) {
        throw new Error(
          `x402Guard proxy unreachable at ${proxyUrl} -- is docker compose up running?`,
        );
      }
      throw error;
    }
  },

  actions: [guardedPaymentAction],
  providers: [x402guardProvider],
};
