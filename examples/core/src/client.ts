/**
 * X402GuardClient — typed HTTP client for the x402Guard proxy REST API.
 *
 * All methods return typed responses (never raw Response objects).
 * Config is frozen after construction (immutability rule).
 * Uses fetchWithRetry for automatic 429/network error handling.
 */

import { createLogger } from "./logger.js";
import {
  GuardrailViolationError,
  ProxyUnreachableError,
  X402GuardError,
} from "./errors.js";
import { fetchWithRetry } from "./retry.js";
import type { RetryConfig } from "./retry.js";
import {
  x402GuardConfigSchema,
  type Agent,
  type ApiListResponse,
  type ApiResponse,
  type CreateAgentRequest,
  type CreateRuleRequest,
  type CreateSessionKeyRequest,
  type ErrorResponse,
  type GuardrailRule,
  type ProxyRequest,
  type ProxyResponse,
  type RevokeAllRequest,
  type RevokeAllResponse,
  type SessionKey,
  type SolanaProxyRequest,
  type SolanaProxyResponse,
  type X402GuardConfig,
} from "./types.js";

import type pino from "pino";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class X402GuardClient {
  private readonly config: Readonly<X402GuardConfig>;
  private readonly baseUrl: string;
  private readonly logger: pino.Logger;
  private readonly retryConfig: RetryConfig;

  /**
   * Create a new X402GuardClient.
   *
   * @param config - Client configuration. Falls back to env vars:
   *   - X402GUARD_PROXY_URL for proxyUrl
   *   - X402GUARD_AGENT_ID for agentId
   *
   * @throws ZodError if config validation fails
   */
  constructor(config: Partial<X402GuardConfig> = {}) {
    const merged = {
      proxyUrl: config.proxyUrl ?? process.env.X402GUARD_PROXY_URL,
      agentId: config.agentId ?? process.env.X402GUARD_AGENT_ID,
      apiKey: config.apiKey ?? process.env.X402GUARD_API_KEY,
      logLevel: config.logLevel,
      maxRetries: config.maxRetries,
      retryBaseMs: config.retryBaseMs,
    };

    // Validate and apply defaults via zod
    const validated = x402GuardConfigSchema.parse(merged);

    // Freeze config — immutability rule
    this.config = Object.freeze(validated);

    // Strip trailing slash from proxy URL
    this.baseUrl = this.config.proxyUrl.replace(/\/+$/, "");

    this.logger = createLogger("x402guard-client", this.config.logLevel);

    this.retryConfig = Object.freeze({
      maxRetries: this.config.maxRetries,
      retryBaseMs: this.config.retryBaseMs,
      logger: this.logger,
    });
  }

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  /**
   * Check if the proxy is reachable.
   *
   * @returns true if the proxy returns 200 on GET /health
   * @throws ProxyUnreachableError if the proxy is down or unreachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<{ status: string }>(
        "GET",
        "/health",
      );
      return response !== undefined;
    } catch (error: unknown) {
      if (error instanceof ProxyUnreachableError) {
        throw error;
      }
      // Wrap network errors as ProxyUnreachableError
      if (error instanceof TypeError) {
        throw new ProxyUnreachableError(
          this.baseUrl,
          error,
        );
      }
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Agents
  // -----------------------------------------------------------------------

  /** POST /api/v1/agents */
  async createAgent(req: CreateAgentRequest): Promise<Agent> {
    const body: ApiResponse<Agent> = await this.request(
      "POST",
      "/agents",
      req,
    );
    return body.data!;
  }

  /** GET /api/v1/agents/:id */
  async getAgent(id: string): Promise<Agent> {
    const body: ApiResponse<Agent> = await this.request(
      "GET",
      `/agents/${encodeURIComponent(id)}`,
    );
    return body.data!;
  }

  // -----------------------------------------------------------------------
  // Guardrail Rules
  // -----------------------------------------------------------------------

  /**
   * POST /api/v1/agents/:agentId/rules
   *
   * Note: The proxy expects the body as `{ rule_type: RuleType }`.
   */
  async createRule(
    agentId: string,
    rule: CreateRuleRequest,
  ): Promise<GuardrailRule> {
    const body: ApiResponse<GuardrailRule> = await this.request(
      "POST",
      `/agents/${encodeURIComponent(agentId)}/rules`,
      rule,
    );
    return body.data!;
  }

  /** GET /api/v1/agents/:agentId/rules */
  async listRules(agentId: string): Promise<readonly GuardrailRule[]> {
    const body: ApiListResponse<GuardrailRule> = await this.request(
      "GET",
      `/agents/${encodeURIComponent(agentId)}/rules`,
    );
    return body.data;
  }

  // -----------------------------------------------------------------------
  // Session Keys
  // -----------------------------------------------------------------------

  /** POST /api/v1/agents/:agentId/session-keys */
  async createSessionKey(
    agentId: string,
    req: CreateSessionKeyRequest,
  ): Promise<SessionKey> {
    const body: ApiResponse<SessionKey> = await this.request(
      "POST",
      `/agents/${encodeURIComponent(agentId)}/session-keys`,
      req,
    );
    return body.data!;
  }

  /** GET /api/v1/agents/:agentId/session-keys */
  async listSessionKeys(
    agentId: string,
  ): Promise<readonly SessionKey[]> {
    const body: ApiListResponse<SessionKey> = await this.request(
      "GET",
      `/agents/${encodeURIComponent(agentId)}/session-keys`,
    );
    return body.data;
  }

  /** GET /api/v1/agents/:agentId/session-keys/:keyId */
  async getSessionKey(
    agentId: string,
    keyId: string,
  ): Promise<SessionKey> {
    const body: ApiResponse<SessionKey> = await this.request(
      "GET",
      `/agents/${encodeURIComponent(agentId)}/session-keys/${encodeURIComponent(keyId)}`,
    );
    return body.data!;
  }

  /** DELETE /api/v1/agents/:agentId/session-keys/:keyId */
  async revokeSessionKey(
    agentId: string,
    keyId: string,
  ): Promise<void> {
    await this.request(
      "DELETE",
      `/agents/${encodeURIComponent(agentId)}/session-keys/${encodeURIComponent(keyId)}`,
    );
  }

  // -----------------------------------------------------------------------
  // Revocation
  // -----------------------------------------------------------------------

  /** POST /api/v1/agents/:agentId/revoke-all */
  async revokeAll(
    agentId: string,
    req: RevokeAllRequest,
  ): Promise<RevokeAllResponse> {
    return this.request<RevokeAllResponse>(
      "POST",
      `/agents/${encodeURIComponent(agentId)}/revoke-all`,
      req,
    );
  }

  // -----------------------------------------------------------------------
  // Proxy payments
  // -----------------------------------------------------------------------

  /** POST /api/v1/proxy */
  async proxyPayment(req: ProxyRequest): Promise<ProxyResponse> {
    return this.request<ProxyResponse>("POST", "/proxy", req);
  }

  /** POST /api/v1/proxy/solana */
  async proxySolanaPayment(
    req: SolanaProxyRequest,
  ): Promise<SolanaProxyResponse> {
    return this.request<SolanaProxyResponse>(
      "POST",
      "/proxy/solana",
      req,
    );
  }

  // -----------------------------------------------------------------------
  // Private HTTP helper
  // -----------------------------------------------------------------------

  /**
   * Generic JSON request method.
   *
   * Handles:
   * - JSON serialization / Content-Type header
   * - Retry delegation via fetchWithRetry
   * - 403 -> GuardrailViolationError parsing
   * - Other non-2xx -> X402GuardError
   * - Network errors -> ProxyUnreachableError
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.config.apiKey) {
      headers["X-Api-Key"] = this.config.apiKey;
    }

    const init: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetchWithRetry(url, init, this.retryConfig);
    } catch (error: unknown) {
      if (error instanceof TypeError) {
        throw new ProxyUnreachableError(this.baseUrl, error);
      }
      throw error;
    }

    // Parse response body
    const responseBody = await response.json() as T & ErrorResponse;

    // Handle error responses
    if (!response.ok) {
      if (response.status === 403) {
        throw GuardrailViolationError.fromApiResponse(
          responseBody as ErrorResponse,
        );
      }

      const errorMessage =
        (responseBody as ErrorResponse).error ??
        `HTTP ${response.status}`;

      throw new X402GuardError(errorMessage, response.status);
    }

    return responseBody as T;
  }
}
