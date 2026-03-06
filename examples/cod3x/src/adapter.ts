/**
 * X402GuardCod3xAdapter -- Cod3x ToolChain protocol adapter for x402Guard.
 *
 * Wraps X402GuardClient with Cod3x-specific convenience methods and
 * provides integration with the Cod3x SDK security worker pattern.
 *
 * No code duplication with @x402guard/core: all HTTP logic is delegated
 * to X402GuardClient. This adapter only adds Cod3x-specific framing.
 */

import {
  X402GuardClient,
  createLogger,
  type Agent,
  type CreateRuleRequest,
  type GuardrailRule,
  type RevokeAllRequest,
  type RuleType,
  type SolanaProxyRequest,
  type SolanaProxyResponse,
} from "@x402guard/core";

import type {
  Cod3xGuardedResponse,
  Cod3xPaymentRequest,
  Cod3xSecurityWorkerConfig,
  X402GuardCod3xAdapterConfig,
} from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Logger = { info: (...args: any[]) => void; error: (...args: any[]) => void; warn: (...args: any[]) => void; debug: (...args: any[]) => void };

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Cod3x ToolChain protocol adapter for x402Guard.
 *
 * Wraps the core X402GuardClient to provide a Cod3x-friendly API surface
 * for guarded DeFi payments. Supports two integration patterns:
 *
 * 1. **Direct usage:** Call `guardedExecute()` to route Cod3x payment
 *    requests through x402Guard's guardrail layer.
 *
 * 2. **Security worker:** Call `toSecurityWorker()` to get a Cod3x SDK
 *    compatible security worker that injects x402Guard agent headers.
 *
 * @example
 * ```ts
 * import { X402GuardCod3xAdapter } from "@x402guard/cod3x-adapter";
 *
 * const adapter = new X402GuardCod3xAdapter({
 *   proxyUrl: "http://localhost:3402",
 *   agentId: "my-agent-uuid",
 * });
 *
 * // Direct usage
 * const result = await adapter.guardedExecute({
 *   targetUrl: "https://api.example.com/pay",
 *   x402Payment: paymentBase64,
 *   x402Requirements: requirementsBase64,
 * });
 *
 * // Security worker integration
 * const workerConfig = adapter.toSecurityWorker();
 * ```
 */
export class X402GuardCod3xAdapter {
  private readonly client: X402GuardClient;
  private readonly config: Readonly<X402GuardCod3xAdapterConfig>;
  private readonly logger: Logger;

  /**
   * Create a new Cod3x adapter.
   *
   * @param config - Adapter configuration. Falls back to environment
   *   variables X402GUARD_PROXY_URL and X402GUARD_AGENT_ID.
   * @throws ZodError if the underlying X402GuardClient config validation fails
   *   (e.g., missing proxyUrl with no env var fallback).
   *
   * @example
   * ```ts
   * const adapter = new X402GuardCod3xAdapter({
   *   proxyUrl: "http://localhost:3402",
   *   agentId: "agent-uuid",
   *   logLevel: "debug",
   * });
   * ```
   */
  constructor(config: X402GuardCod3xAdapterConfig = {}) {
    // Freeze config -- immutability rule
    this.config = Object.freeze({ ...config });

    this.logger = createLogger(
      "x402guard-cod3x",
      this.config.logLevel,
    );

    // Delegate to core client -- all HTTP logic lives there
    this.client = new X402GuardClient({
      proxyUrl: this.config.proxyUrl,
      agentId: this.config.agentId,
      logLevel: this.config.logLevel as "info" | "debug" | "warn" | "error" | "silent" | undefined,
      maxRetries: this.config.maxRetries,
    });

    this.logger.info("Cod3x adapter initialized");
  }

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  /**
   * Check if the x402Guard proxy is reachable.
   *
   * @returns true if the proxy responds to health check
   * @throws ProxyUnreachableError if the proxy is down
   *
   * @example
   * ```ts
   * const isUp = await adapter.healthCheck();
   * console.log(`Proxy status: ${isUp ? "UP" : "DOWN"}`);
   * ```
   */
  async healthCheck(): Promise<boolean> {
    this.logger.debug("Performing health check");
    return this.client.healthCheck();
  }

  // -----------------------------------------------------------------------
  // Guarded execution
  // -----------------------------------------------------------------------

  /**
   * Execute a Cod3x payment through x402Guard's guardrail layer.
   *
   * Routes the payment request through the x402Guard proxy, which
   * validates it against all registered guardrail rules before forwarding
   * to the target API.
   *
   * @param request - Cod3x payment request (extends ProxyRequest with
   *   optional cod3xSessionId for tracking)
   * @returns Cod3xGuardedResponse with `guardedBy: "x402guard"` marker
   * @throws GuardrailViolationError if any guardrail rule blocks the payment
   * @throws ProxyUnreachableError if the proxy is down
   *
   * @example
   * ```ts
   * try {
   *   const result = await adapter.guardedExecute({
   *     targetUrl: "https://api.example.com/pay",
   *     x402Payment: paymentBase64,
   *     x402Requirements: requirementsBase64,
   *     agentId: "my-agent-uuid",
   *     cod3xSessionId: "session-123",
   *   });
   *   // Payment passed guardrails and was forwarded
   * } catch (error) {
   *   if (error instanceof GuardrailViolationError) {
   *     // Payment blocked by guardrail
   *   }
   * }
   * ```
   */
  async guardedExecute(
    request: Cod3xPaymentRequest,
  ): Promise<Cod3xGuardedResponse> {
    this.logger.info(
      { targetUrl: request.targetUrl, cod3xSessionId: request.cod3xSessionId },
      "Executing guarded Cod3x payment",
    );

    // Strip Cod3x-specific fields before passing to core client
    const { cod3xSessionId: _sessionId, ...proxyRequest } = request;

    const response = await this.client.proxyPayment(proxyRequest);

    // Wrap response with Cod3x provenance marker
    return {
      ...response,
      guardedBy: "x402guard" as const,
    };
  }

  /**
   * Execute a Solana payment through x402Guard's guardrail layer.
   *
   * Routes the Solana payment request through the x402Guard proxy for
   * vault-based guardrail validation (PDA vaults with per-tx and daily limits).
   *
   * @param request - Solana proxy request
   * @returns SolanaProxyResponse with vault status
   * @throws GuardrailViolationError if vault guardrails block the payment
   * @throws ProxyUnreachableError if the proxy is down
   *
   * @example
   * ```ts
   * const result = await adapter.guardedSolanaExecute({
   *   targetUrl: "https://api.example.com/solana-pay",
   *   network: "devnet",
   *   vaultOwner: "SoLaNaPubKey...",
   *   amount: 1000000,
   *   x402Payment: paymentBase64,
   * });
   * ```
   */
  async guardedSolanaExecute(
    request: SolanaProxyRequest,
  ): Promise<SolanaProxyResponse> {
    this.logger.info(
      { targetUrl: request.targetUrl, network: request.network },
      "Executing guarded Solana payment",
    );

    return this.client.proxySolanaPayment(request);
  }

  // -----------------------------------------------------------------------
  // Agent management
  // -----------------------------------------------------------------------

  /**
   * Register a new agent with x402Guard.
   *
   * @param name - Human-readable agent name
   * @param ownerAddress - Ethereum address of the agent owner
   * @returns Created Agent object with generated UUID
   *
   * @example
   * ```ts
   * const agent = await adapter.createAgent(
   *   "cod3x-trading-bot",
   *   "0x1234567890abcdef1234567890abcdef12345678",
   * );
   * ```
   */
  async createAgent(name: string, ownerAddress: string): Promise<Agent> {
    this.logger.info({ name, ownerAddress }, "Creating agent");
    return this.client.createAgent({ name, owner_address: ownerAddress });
  }

  // -----------------------------------------------------------------------
  // Guardrail management
  // -----------------------------------------------------------------------

  /**
   * Create a guardrail rule for an agent.
   *
   * @param agentId - UUID of the agent to add the rule to
   * @param ruleType - Guardrail rule type with parameters
   * @returns Created GuardrailRule object
   *
   * @example
   * ```ts
   * const rule = await adapter.createGuardrail("agent-uuid", {
   *   type: "MaxSpendPerTx",
   *   params: { limit: 1_000_000 },
   * });
   * ```
   */
  async createGuardrail(
    agentId: string,
    ruleType: RuleType,
  ): Promise<GuardrailRule> {
    this.logger.info({ agentId, ruleType }, "Creating guardrail rule");
    const rule: CreateRuleRequest = { rule_type: ruleType };
    return this.client.createRule(agentId, rule);
  }

  // -----------------------------------------------------------------------
  // Revocation
  // -----------------------------------------------------------------------

  /**
   * Revoke all session keys and deactivate an agent.
   *
   * This is an emergency kill-switch that atomically revokes all session
   * keys and deactivates the agent, preventing any further payments.
   *
   * @param agentId - UUID of the agent to revoke
   * @param ownerAddress - Ethereum address of the agent owner (for auth)
   *
   * @example
   * ```ts
   * await adapter.revokeAllKeys("agent-uuid", "0xOwnerAddress...");
   * ```
   */
  async revokeAllKeys(
    agentId: string,
    ownerAddress: string,
  ): Promise<void> {
    this.logger.warn({ agentId }, "Revoking all keys and deactivating agent");
    const req: RevokeAllRequest = { owner_address: ownerAddress };
    await this.client.revokeAll(agentId, req);
  }

  // -----------------------------------------------------------------------
  // Cod3x SDK integration
  // -----------------------------------------------------------------------

  /**
   * Generate a Cod3x SDK compatible security worker configuration.
   *
   * Returns an object with a `securityWorker` function that injects
   * the x402Guard agent ID into request headers. This can be passed
   * directly to the Cod3x SDK constructor for automatic agent
   * identification on all API calls.
   *
   * @returns Cod3xSecurityWorkerConfig compatible with @cod3x/sdk
   *
   * @example
   * ```ts
   * const workerConfig = adapter.toSecurityWorker();
   *
   * // Use with Cod3x SDK:
   * // const sdk = new CodexSDK({
   * //   ...workerConfig,
   * //   baseUrl: "https://api.cod3x.com",
   * // });
   *
   * // Or call directly:
   * const result = await workerConfig.securityWorker(undefined);
   * // => { headers: { "X-Agent-Id": "my-agent-uuid" } }
   * ```
   */
  toSecurityWorker(): Cod3xSecurityWorkerConfig {
    const agentId = this.config.agentId ?? "";
    this.logger.debug({ agentId }, "Generating Cod3x security worker");

    return {
      securityWorker: async (
        _data: unknown,
      ): Promise<{
        readonly headers: Readonly<Record<string, string>>;
      }> => {
        return {
          headers: Object.freeze({
            "X-Agent-Id": agentId,
          }),
        };
      },
    };
  }
}
