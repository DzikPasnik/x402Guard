/**
 * Typed error hierarchy for the x402Guard SDK.
 *
 * Maps directly to the proxy's HTTP error responses:
 * - 403 with guardrail violation string -> GuardrailViolationError
 * - Network failures -> ProxyUnreachableError
 * - 429 Too Many Requests -> RateLimitedError
 * - Session key expired -> SessionKeyExpiredError
 */

import type { ErrorResponse } from "./types.js";

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

export class X402GuardError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "X402GuardError";
    this.statusCode = statusCode;
    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Guardrail violation (403)
// ---------------------------------------------------------------------------

/**
 * Thrown when the proxy returns 403 for a guardrail rule violation.
 *
 * The proxy error string format examples:
 *   "MaxSpendPerTx exceeded: payment 2000000 > limit 1000000"
 *   "MaxSpendPerDay exceeded: daily total 11000000 > limit 10000000"
 *   "AllowedContracts: target 0xddd... not in whitelist"
 *   "MaxLeverage exceeded: 10 > max 5"
 *   "MaxSlippage exceeded: 100 bps > max 50 bps"
 */
export class GuardrailViolationError extends X402GuardError {
  readonly ruleType: string;
  readonly limit: number | string;
  readonly actual: number | string;

  constructor(
    message: string,
    ruleType: string,
    limit: number | string,
    actual: number | string,
  ) {
    super(message, 403);
    this.name = "GuardrailViolationError";
    this.ruleType = ruleType;
    this.limit = limit;
    this.actual = actual;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Parse the proxy's 403 error body into a structured GuardrailViolationError.
   *
   * Expected body shapes:
   *   { "error": "MaxSpendPerTx exceeded: payment 2000000 > limit 1000000", "code": 403 }
   *   { "error": "guardrail violated: MaxSpendPerTx exceeded: ...", "code": 403 }
   *
   * Parsing strategy:
   * 1. Extract rule type from the PascalCase prefix (MaxSpendPerTx, MaxSpendPerDay, etc.)
   * 2. Extract numeric values using regex patterns for known formats
   * 3. Fall back to raw strings if parsing fails
   */
  static fromApiResponse(body: ErrorResponse): GuardrailViolationError {
    const errorStr = body.error ?? "";

    // Strip the optional "guardrail violated: " prefix added by AppError::GuardrailViolation
    const cleaned = errorStr.replace(/^guardrail violated:\s*/i, "");

    // Extract rule type — first PascalCase word (e.g. "MaxSpendPerTx")
    const ruleTypeMatch = cleaned.match(
      /^(MaxSpendPerTx|MaxSpendPerDay|AllowedContracts|MaxLeverage|MaxSlippage)/,
    );
    const ruleType = ruleTypeMatch?.[1] ?? "Unknown";

    // Try to extract limit and actual values based on known formats
    let limit: number | string = "unknown";
    let actual: number | string = "unknown";

    // Format: "MaxSpendPerTx exceeded: payment {actual} > limit {limit}"
    const spendTxMatch = cleaned.match(
      /payment\s+(\d+)\s*>\s*limit\s+(\d+)/,
    );
    if (spendTxMatch) {
      actual = parseInt(spendTxMatch[1], 10);
      limit = parseInt(spendTxMatch[2], 10);
      return new GuardrailViolationError(errorStr, ruleType, limit, actual);
    }

    // Format: "MaxSpendPerDay exceeded: daily total {actual} > limit {limit}"
    const spendDayMatch = cleaned.match(
      /daily total\s+(\d+)\s*>\s*limit\s+(\d+)/,
    );
    if (spendDayMatch) {
      actual = parseInt(spendDayMatch[1], 10);
      limit = parseInt(spendDayMatch[2], 10);
      return new GuardrailViolationError(errorStr, ruleType, limit, actual);
    }

    // Format: "MaxLeverage exceeded: {actual} > max {limit}"
    const leverageMatch = cleaned.match(/(\d+)\s*>\s*max\s+(\d+)/);
    if (leverageMatch) {
      actual = parseInt(leverageMatch[1], 10);
      limit = parseInt(leverageMatch[2], 10);
      return new GuardrailViolationError(errorStr, ruleType, limit, actual);
    }

    // Format: "MaxSlippage exceeded: {actual} bps > max {limit} bps"
    const slippageMatch = cleaned.match(
      /(\d+)\s*bps\s*>\s*max\s+(\d+)\s*bps/,
    );
    if (slippageMatch) {
      actual = parseInt(slippageMatch[1], 10);
      limit = parseInt(slippageMatch[2], 10);
      return new GuardrailViolationError(errorStr, ruleType, limit, actual);
    }

    // Format: "AllowedContracts: target {addr} not in whitelist"
    const contractMatch = cleaned.match(/target\s+(\S+)\s+not in whitelist/);
    if (contractMatch) {
      actual = contractMatch[1];
      limit = "whitelist";
      return new GuardrailViolationError(errorStr, ruleType, limit, actual);
    }

    // Fallback — could not parse specifics
    return new GuardrailViolationError(errorStr, ruleType, limit, actual);
  }
}

// ---------------------------------------------------------------------------
// Proxy unreachable (network error)
// ---------------------------------------------------------------------------

export class ProxyUnreachableError extends X402GuardError {
  constructor(proxyUrl: string, cause?: Error) {
    super(
      `Proxy unreachable at ${proxyUrl} -- is docker compose up running?`,
      undefined,
    );
    this.name = "ProxyUnreachableError";
    if (cause) {
      this.cause = cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Session key expired
// ---------------------------------------------------------------------------

export class SessionKeyExpiredError extends X402GuardError {
  constructor(keyId: string) {
    super(`Session key ${keyId} has expired`, 403);
    this.name = "SessionKeyExpiredError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Rate limited (429)
// ---------------------------------------------------------------------------

export class RateLimitedError extends X402GuardError {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super(`Rate limited -- retry after ${retryAfter}s`, 429);
    this.name = "RateLimitedError";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
