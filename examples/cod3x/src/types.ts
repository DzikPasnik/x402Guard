/**
 * Cod3x-specific type extensions for x402Guard integration.
 *
 * These types extend the core @x402guard/core types with Cod3x ToolChain
 * specific fields and configuration options.
 */

import type { ProxyRequest, ProxyResponse } from "@x402guard/core";

// ---------------------------------------------------------------------------
// Cod3x payment request (extends core ProxyRequest)
// ---------------------------------------------------------------------------

/**
 * Payment request extended with optional Cod3x session tracking.
 *
 * @example
 * ```ts
 * const request: Cod3xPaymentRequest = {
 *   targetUrl: "https://api.example.com/pay",
 *   x402Payment: "base64url-encoded-payment",
 *   x402Requirements: "base64url-encoded-requirements",
 *   agentId: "agent-uuid",
 *   cod3xSessionId: "cod3x-session-abc123",
 * };
 * ```
 */
export interface Cod3xPaymentRequest extends ProxyRequest {
  /** Optional Cod3x session ID for tracking across ToolChain workflows. */
  readonly cod3xSessionId?: string;
}

// ---------------------------------------------------------------------------
// Cod3x guarded response (extends core ProxyResponse)
// ---------------------------------------------------------------------------

/**
 * Payment response with x402Guard provenance marker.
 *
 * The `guardedBy` field is always set to `"x402guard"` to indicate
 * the payment was validated through the x402Guard guardrail layer.
 */
export interface Cod3xGuardedResponse extends ProxyResponse {
  /** Provenance marker indicating x402Guard validation. Always "x402guard". */
  readonly guardedBy: "x402guard";
}

// ---------------------------------------------------------------------------
// Adapter configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the X402GuardCod3xAdapter.
 *
 * Mirrors X402GuardConfig but provides Cod3x-specific documentation.
 * All fields are optional -- the adapter reads defaults from environment
 * variables (X402GUARD_PROXY_URL, X402GUARD_AGENT_ID).
 *
 * @example
 * ```ts
 * const config: X402GuardCod3xAdapterConfig = {
 *   proxyUrl: "http://localhost:3402",
 *   agentId: "my-cod3x-agent-uuid",
 *   logLevel: "debug",
 *   maxRetries: 3,
 * };
 * ```
 */
export interface X402GuardCod3xAdapterConfig {
  /**
   * URL of the x402Guard proxy.
   * Falls back to X402GUARD_PROXY_URL env var.
   */
  readonly proxyUrl?: string;

  /**
   * Agent ID registered with x402Guard.
   * Falls back to X402GUARD_AGENT_ID env var.
   */
  readonly agentId?: string;

  /**
   * Log level for the adapter logger.
   * One of: fatal, error, warn, info, debug, trace, silent.
   */
  readonly logLevel?: string;

  /**
   * Maximum number of retries on 429/network errors.
   * @default 3
   */
  readonly maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Cod3x security worker configuration
// ---------------------------------------------------------------------------

/**
 * Configuration object compatible with Cod3x SDK's security worker pattern.
 *
 * The Cod3x SDK accepts a `securityWorker` function that returns
 * request headers. This type models that interface for x402Guard
 * agent identification.
 *
 * @example
 * ```ts
 * const workerConfig = adapter.toSecurityWorker();
 * // Pass to Cod3x SDK:
 * // const sdk = new CodexSDK({ ...workerConfig });
 * ```
 */
export interface Cod3xSecurityWorkerConfig {
  readonly securityWorker: (
    data: unknown,
  ) => Promise<{ readonly headers: Readonly<Record<string, string>> }>;
}
