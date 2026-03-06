/**
 * TypeScript types mirroring the x402Guard Rust proxy models.
 *
 * IMPORTANT: These types match the Rust serde serialization format EXACTLY.
 * - RuleType uses PascalCase discriminant with nested `params` object
 *   (Rust: #[serde(tag = "type", content = "params")])
 * - ProxyRequest/ProxyResponse use camelCase fields
 *   (Rust: #[serde(rename_all = "camelCase")])
 * - All UUIDs are strings (not a UUID type)
 * - All timestamps are ISO-8601 strings (from chrono serde)
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Agent (proxy/src/models/agent.rs)
// ---------------------------------------------------------------------------

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly owner_address: string;
  readonly created_at: string;
  readonly is_active: boolean;
}

// ---------------------------------------------------------------------------
// GuardrailRule + RuleType (proxy/src/models/guardrail.rs)
// ---------------------------------------------------------------------------

/**
 * Discriminated union matching Rust's `#[serde(tag = "type", content = "params")]`.
 *
 * Serialized JSON example:
 *   { "type": "MaxSpendPerTx", "params": { "limit": 1000000 } }
 */
export type RuleType =
  | { readonly type: "MaxSpendPerTx"; readonly params: { readonly limit: number } }
  | { readonly type: "MaxSpendPerDay"; readonly params: { readonly limit: number } }
  | { readonly type: "AllowedContracts"; readonly params: { readonly addresses: readonly string[] } }
  | { readonly type: "MaxLeverage"; readonly params: { readonly max: number } }
  | { readonly type: "MaxSlippage"; readonly params: { readonly bps: number } };

export interface GuardrailRule {
  readonly id: string;
  readonly agent_id: string;
  readonly rule_type: RuleType;
  readonly is_active: boolean;
}

// ---------------------------------------------------------------------------
// SessionKey (proxy/src/models/session_key.rs)
// ---------------------------------------------------------------------------

export interface SessionKey {
  readonly id: string;
  readonly agent_id: string;
  readonly public_key: string;
  readonly max_spend: number;
  readonly spent: number;
  readonly allowed_contracts: readonly string[];
  readonly expires_at: string;
  readonly is_revoked: boolean;
  readonly created_at: string;
}

// ---------------------------------------------------------------------------
// Proxy request/response (proxy/src/handlers/proxy.rs)
// camelCase fields — Rust: #[serde(rename_all = "camelCase")]
// ---------------------------------------------------------------------------

export interface ProxyRequest {
  readonly targetUrl: string;
  readonly x402Payment: string;
  readonly x402Requirements: string;
  readonly agentId?: string;
  readonly sessionKeyId?: string;
}

export interface ProxyResponse {
  readonly success: boolean;
  readonly txHash?: string;
  readonly message: string;
  readonly data?: unknown;
}

export interface SolanaProxyRequest {
  readonly targetUrl: string;
  readonly network: string;
  readonly vaultOwner: string;
  readonly amount: number;
  readonly destinationProgram?: string;
  readonly x402Payment: string;
}

export interface SolanaProxyResponse {
  readonly success: boolean;
  readonly message: string;
  readonly vaultPda?: string;
  readonly remainingDailyCapacity?: number;
  readonly data?: unknown;
}

// ---------------------------------------------------------------------------
// API request types (proxy/src/handlers/)
// ---------------------------------------------------------------------------

export interface CreateAgentRequest {
  readonly name: string;
  readonly owner_address: string;
}

export interface CreateRuleRequest {
  readonly rule_type: RuleType;
}

export interface UpdateRuleRequest {
  readonly rule_type: RuleType;
  readonly is_active: boolean;
}

export interface CreateSessionKeyRequest {
  readonly public_key: string;
  readonly max_spend: number;
  readonly allowed_contracts: readonly string[];
  readonly expires_at: string;
}

export interface RevokeAllRequest {
  readonly owner_address: string;
  readonly chain_id?: number;
  readonly eoa_nonce_hint?: number;
}

// ---------------------------------------------------------------------------
// API response envelopes
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export interface ApiListResponse<T> {
  readonly success: boolean;
  readonly data: readonly T[];
}

export interface RevokeAllResponse {
  readonly success: boolean;
  readonly keys_revoked: number;
  readonly agent_deactivated: boolean;
  readonly on_chain_authorization?: unknown;
}

/**
 * Error response body from the proxy (used on 4xx/5xx).
 * Shape: { error: string, code: number }
 */
export interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export const x402GuardConfigSchema = z.object({
  proxyUrl: z
    .string()
    .url("proxyUrl must be a valid URL"),
  agentId: z.string().optional(),
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  maxRetries: z.number().int().min(0).default(3),
  retryBaseMs: z.number().int().min(100).default(1000),
});

export type X402GuardConfig = z.infer<typeof x402GuardConfigSchema>;
