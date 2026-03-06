/**
 * Retry logic with exponential backoff for the x402Guard SDK.
 *
 * Retries on:
 * - 429 Too Many Requests (using Retry-After header)
 * - Network errors (TypeError from fetch)
 *
 * Does NOT retry on other 4xx/5xx status codes.
 */

import type pino from "pino";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 3 */
  readonly maxRetries: number;
  /** Base delay in milliseconds for exponential backoff. Default: 1000 */
  readonly retryBaseMs: number;
  /** Pino logger instance for retry warnings */
  readonly logger: pino.Logger;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry on 429 and network errors.
 *
 * Retry delay calculation:
 * - On 429: retryAfterSeconds * 1000 * 2^attempt
 * - On network error: retryBaseMs * 2^attempt
 *
 * @throws The last error or Response after maxRetries exhausted
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  config: RetryConfig,
): Promise<Response> {
  let lastError: unknown = undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.status === 429 && attempt < config.maxRetries) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterSecs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : 1;
        const delayMs =
          (isNaN(retryAfterSecs) ? 1 : retryAfterSecs) *
          1000 *
          Math.pow(2, attempt);

        config.logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: config.maxRetries,
            delayMs,
            retryAfterHeader,
          },
          "Rate limited (429), retrying after delay",
        );

        await sleep(delayMs);
        continue;
      }

      // All other status codes — return immediately (no retry for 4xx/5xx)
      return response;
    } catch (error: unknown) {
      // Network errors (TypeError from fetch) — retry with backoff
      if (error instanceof TypeError && attempt < config.maxRetries) {
        const delayMs = config.retryBaseMs * Math.pow(2, attempt);

        config.logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: config.maxRetries,
            delayMs,
            error: (error as Error).message,
          },
          "Network error, retrying after delay",
        );

        lastError = error;
        await sleep(delayMs);
        continue;
      }

      // Non-TypeError or final attempt — rethrow
      throw error;
    }
  }

  // All retries exhausted — throw last error
  if (lastError) {
    throw lastError;
  }

  // Should not reach here, but TypeScript needs this
  throw new Error("fetchWithRetry: max retries exhausted");
}
