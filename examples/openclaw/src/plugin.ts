/**
 * x402Guard OpenClaw Plugin
 *
 * Registers 10 AI agent tools covering the full x402Guard API:
 * - Health check
 * - Agent management (create, get)
 * - Guardrail rules (create, list)
 * - Session keys (create, list, revoke)
 * - Guarded payments (EVM, Solana)
 * - Emergency revocation
 *
 * Configuration (in openclaw.json):
 *   plugins.entries.x402guard.config.proxyUrl = "https://..."
 *   plugins.entries.x402guard.config.agentId  = "uuid"       (optional)
 *   plugins.entries.x402guard.config.apiKey    = "key"        (optional)
 *
 * Or via environment variables:
 *   X402GUARD_PROXY_URL, X402GUARD_AGENT_ID
 */

import type { PluginApi } from "./openclaw.js";
import { X402GuardClient } from "@x402guard/core";

// Tool factories
import { healthCheckTool } from "./tools/health.js";
import { createAgentTool, getAgentTool } from "./tools/agents.js";
import { createRuleTool, listRulesTool } from "./tools/rules.js";
import {
  createSessionKeyTool,
  listSessionKeysTool,
  revokeSessionKeyTool,
} from "./tools/sessionKeys.js";
import { proxyPaymentTool, proxySolanaPaymentTool } from "./tools/payments.js";
import { revokeAllTool } from "./tools/revoke.js";

/**
 * Resolve proxy URL from plugin config or environment variables.
 * Fail-closed: throws if no URL is available.
 */
function resolveProxyUrl(config: Readonly<Record<string, unknown>>): string {
  const url =
    (config.proxyUrl as string | undefined) ??
    process.env.X402GUARD_PROXY_URL;

  if (!url) {
    throw new Error(
      "x402Guard: proxyUrl not configured. " +
      "Set it in openclaw.json (plugins.entries.x402guard.config.proxyUrl) " +
      "or via X402GUARD_PROXY_URL environment variable.",
    );
  }

  return url;
}

/**
 * Resolve optional agent ID from plugin config or environment variables.
 */
function resolveAgentId(config: Readonly<Record<string, unknown>>): string | undefined {
  return (
    (config.agentId as string | undefined) ??
    process.env.X402GUARD_AGENT_ID ??
    undefined
  );
}

/**
 * Resolve optional API key from plugin config or environment variables.
 */
function resolveApiKey(config: Readonly<Record<string, unknown>>): string | undefined {
  return (
    (config.apiKey as string | undefined) ??
    process.env.X402GUARD_API_KEY ??
    undefined
  );
}

/**
 * x402Guard plugin registration function.
 *
 * Creates a lazy-initialized X402GuardClient and registers all tools
 * with the OpenClaw plugin API.
 */
export default function register(api: PluginApi): void {
  const proxyUrl = resolveProxyUrl(api.config);
  const defaultAgentId = resolveAgentId(api.config);
  const apiKey = resolveApiKey(api.config);

  api.logger.info(`x402Guard plugin initializing (proxy: ${proxyUrl})`);

  // Lazy client — created once on first tool call
  let client: X402GuardClient | undefined;

  const getClient = (): X402GuardClient => {
    if (!client) {
      client = new X402GuardClient({
        proxyUrl,
        agentId: defaultAgentId,
        apiKey,
      });
    }
    return client;
  };

  // Register all tools
  const tools = [
    healthCheckTool(getClient),
    createAgentTool(getClient),
    getAgentTool(getClient, defaultAgentId),
    createRuleTool(getClient, defaultAgentId),
    listRulesTool(getClient, defaultAgentId),
    createSessionKeyTool(getClient, defaultAgentId),
    listSessionKeysTool(getClient, defaultAgentId),
    revokeSessionKeyTool(getClient, defaultAgentId),
    proxyPaymentTool(getClient, defaultAgentId),
    proxySolanaPaymentTool(getClient),
    revokeAllTool(getClient, defaultAgentId),
  ];

  for (const tool of tools) {
    api.registerTool(tool);
  }

  api.logger.info(
    `x402Guard plugin registered ${tools.length} tools` +
    (defaultAgentId ? ` (default agent: ${defaultAgentId})` : ""),
  );
}
