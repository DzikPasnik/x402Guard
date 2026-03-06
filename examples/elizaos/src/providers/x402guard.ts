/**
 * ElizaOS Provider: X402GUARD_STATUS
 *
 * Injects x402Guard proxy health status into the ElizaOS agent context.
 * This allows the agent to check if the guardrail proxy is reachable
 * before attempting payments.
 *
 * Required runtime settings:
 * - X402GUARD_PROXY_URL: URL of the x402Guard proxy
 */

import type { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";
import {
  X402GuardClient,
  ProxyUnreachableError,
  createLogger,
} from "@x402guard/core";

const logger = createLogger("elizaos-x402guard-provider");

/**
 * ElizaOS Provider that reports x402Guard proxy connection status.
 *
 * When queried, creates an X402GuardClient and calls healthCheck().
 * Returns structured data indicating whether the proxy is reachable,
 * which the agent can use to decide whether to attempt payments.
 */
export const x402guardProvider: Provider = {
  name: "X402GUARD_STATUS",
  description:
    "Provides x402Guard proxy connection status and agent info to context",

  /**
   * Check proxy health and return status.
   *
   * @returns Object with text description and structured data
   */
  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ): Promise<{ text: string; data?: unknown }> => {
    const proxyUrl = runtime.getSetting("X402GUARD_PROXY_URL");

    if (!proxyUrl) {
      logger.warn("X402GUARD_PROXY_URL not configured");
      return {
        text: "x402Guard proxy not configured -- set X402GUARD_PROXY_URL in character settings",
        data: { healthy: false, configured: false },
      };
    }

    const logLevel = runtime.getSetting("X402GUARD_LOG_LEVEL");

    try {
      const client = new X402GuardClient({
        proxyUrl,
        logLevel: logLevel as "info" | "debug" | "warn" | "error" | undefined,
      });

      await client.healthCheck();

      logger.info({ proxyUrl }, "x402Guard proxy is healthy");
      return {
        text: `x402Guard proxy is reachable at ${proxyUrl}`,
        data: { healthy: true, proxyUrl },
      };
    } catch (error: unknown) {
      if (error instanceof ProxyUnreachableError) {
        logger.warn({ proxyUrl }, "x402Guard proxy unreachable");
        return {
          text: `x402Guard proxy unreachable at ${proxyUrl}`,
          data: { healthy: false, proxyUrl },
        };
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, proxyUrl }, "Health check failed");
      return {
        text: `x402Guard proxy health check failed: ${errorMessage}`,
        data: { healthy: false, proxyUrl, error: errorMessage },
      };
    }
  },
};
