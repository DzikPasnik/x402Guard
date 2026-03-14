/**
 * @x402guard/openclaw-plugin
 *
 * OpenClaw AI agent plugin for the x402Guard DeFi safety proxy.
 * Provides 10 tools for managing agents, guardrail rules, session keys,
 * and making guarded payments on EVM (Base) and Solana.
 *
 * @example
 * ```json5
 * // openclaw.json
 * {
 *   plugins: {
 *     entries: {
 *       "x402guard": {
 *         enabled: true,
 *         config: {
 *           proxyUrl: "https://x402guard-production.up.railway.app",
 *           agentId: "your-agent-uuid"
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 */

// Plugin entry point — OpenClaw expects `export default function(api)`
export { default } from "./plugin.js";

// Re-export tool factories for advanced usage (e.g. custom plugin composition)
export { healthCheckTool } from "./tools/health.js";
export { createAgentTool, getAgentTool } from "./tools/agents.js";
export { createRuleTool, listRulesTool } from "./tools/rules.js";
export {
  createSessionKeyTool,
  listSessionKeysTool,
  revokeSessionKeyTool,
} from "./tools/sessionKeys.js";
export { proxyPaymentTool, proxySolanaPaymentTool } from "./tools/payments.js";
export { revokeAllTool } from "./tools/revoke.js";

// Re-export core types for consumers
export type {
  Agent,
  GuardrailRule,
  RuleType,
  SessionKey,
  ProxyRequest,
  ProxyResponse,
  SolanaProxyRequest,
  SolanaProxyResponse,
  CreateAgentRequest,
  CreateRuleRequest,
  CreateSessionKeyRequest,
  RevokeAllRequest,
  RevokeAllResponse,
  X402GuardConfig,
} from "@x402guard/core";

export {
  X402GuardClient,
  GuardrailViolationError,
  ProxyUnreachableError,
  X402GuardError,
} from "@x402guard/core";

// Re-export OpenClaw types
export type {
  PluginApi,
  ToolDescriptor,
  OpenClawPlugin,
} from "./openclaw.js";
