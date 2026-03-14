/**
 * Tool: x402guard_health_check
 *
 * Checks whether the x402Guard proxy is online and reachable.
 * Returns { online: true, proxyUrl } on success.
 */

import type { ToolDescriptor } from "../openclaw.js";
import { X402GuardClient, ProxyUnreachableError } from "@x402guard/core";

export function healthCheckTool(getClient: () => X402GuardClient): ToolDescriptor {
  return {
    name: "x402guard_health_check",
    description:
      "Check if the x402Guard DeFi safety proxy is online and reachable. " +
      "Call this before making payments to verify connectivity.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async () => {
      try {
        const client = getClient();
        await client.healthCheck();
        return { online: true };
      } catch (error: unknown) {
        if (error instanceof ProxyUnreachableError) {
          return { online: false, error: error.message };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { online: false, error: message };
      }
    },
  };
}
