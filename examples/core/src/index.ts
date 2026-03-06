/**
 * @x402guard/core — TypeScript SDK for x402Guard proxy.
 *
 * Re-exports types, errors, logger, client, and retry utilities.
 */

// Types
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
} from "./types.js";

export { x402GuardConfigSchema } from "./types.js";

// Errors
export {
  GuardrailViolationError,
  ProxyUnreachableError,
  RateLimitedError,
  SessionKeyExpiredError,
  X402GuardError,
} from "./errors.js";

// Logger
export { createLogger } from "./logger.js";

// Client
export { X402GuardClient } from "./client.js";

// Retry
export { fetchWithRetry } from "./retry.js";
export type { RetryConfig } from "./retry.js";
