/**
 * Structured logger for the x402Guard SDK.
 *
 * Uses pino for structured JSON logging. Never uses console.log (project rule).
 * Default log level is read from X402GUARD_LOG_LEVEL env var, falling back to "info".
 */

import pino from "pino";

/**
 * Create a named pino logger instance.
 *
 * @param name - Logger name (appears in log output)
 * @param level - Log level override. Defaults to X402GUARD_LOG_LEVEL env var or "info"
 */
export function createLogger(
  name: string,
  level?: string,
): pino.Logger {
  const resolvedLevel =
    level ?? process.env.X402GUARD_LOG_LEVEL ?? "info";

  return pino({
    name,
    level: resolvedLevel,
  });
}
