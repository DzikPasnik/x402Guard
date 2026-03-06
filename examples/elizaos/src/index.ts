/**
 * @elizaos/plugin-x402guard
 *
 * ElizaOS plugin for x402Guard guardrail proxy integration.
 *
 * Re-exports the plugin, action, provider, and all types from @x402guard/core.
 */

// Plugin
export { x402guardPlugin } from "./plugin.js";

// Action
export { guardedPaymentAction } from "./actions/guardedPayment.js";

// Provider
export { x402guardProvider } from "./providers/x402guard.js";

// Re-export all types and utilities from @x402guard/core
export {
  X402GuardClient,
  GuardrailViolationError,
  ProxyUnreachableError,
  SessionKeyExpiredError,
  RateLimitedError,
  X402GuardError,
  createLogger,
  fetchWithRetry,
  x402GuardConfigSchema,
} from "@x402guard/core";

export type {
  Agent,
  ApiListResponse,
  ApiResponse,
  CreateAgentRequest,
  CreateRuleRequest,
  CreateSessionKeyRequest,
  ErrorResponse,
  GuardrailRule,
  ProxyRequest,
  ProxyResponse,
  RevokeAllRequest,
  RevokeAllResponse,
  RuleType,
  SessionKey,
  SolanaProxyRequest,
  SolanaProxyResponse,
  UpdateRuleRequest,
  X402GuardConfig,
  RetryConfig,
} from "@x402guard/core";
