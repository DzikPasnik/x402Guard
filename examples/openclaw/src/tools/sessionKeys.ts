/**
 * Tools: x402guard_create_session_key, x402guard_list_session_keys, x402guard_revoke_session_key
 *
 * EIP-7702 session key management — temporary delegated signing authority
 * with spend limits and contract restrictions.
 */

import type { ToolDescriptor } from "../openclaw.js";
import { X402GuardClient } from "@x402guard/core";

export function createSessionKeyTool(
  getClient: () => X402GuardClient,
  defaultAgentId?: string,
): ToolDescriptor {
  return {
    name: "x402guard_create_session_key",
    description:
      "Create a temporary session key for an agent with a spend limit, " +
      "allowed contract whitelist, and expiration time. " +
      "Session keys enable delegated signing without exposing the main wallet.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent UUID. If omitted, uses the configured default.",
        },
        public_key: {
          type: "string",
          description: "Public key (0x...) of the session key signer",
        },
        max_spend: {
          type: "number",
          description: "Maximum spend in micro-USDC (e.g. 5000000 = $5)",
        },
        allowed_contracts: {
          type: "object",
          description: "Array of contract addresses this key can interact with",
        },
        expires_at: {
          type: "string",
          description: "ISO-8601 expiration timestamp (e.g. '2026-12-31T23:59:59Z')",
        },
      },
      required: ["public_key", "max_spend", "allowed_contracts", "expires_at"],
      additionalProperties: false,
    },
    handler: async (input) => {
      const agentId = (input.agent_id as string | undefined) ?? defaultAgentId;
      if (!agentId) {
        return { success: false, error: "agent_id is required (no default configured)" };
      }
      const client = getClient();
      const sessionKey = await client.createSessionKey(agentId, {
        public_key: input.public_key as string,
        max_spend: input.max_spend as number,
        allowed_contracts: input.allowed_contracts as readonly string[],
        expires_at: input.expires_at as string,
      });
      return { success: true, sessionKey };
    },
  };
}

export function listSessionKeysTool(
  getClient: () => X402GuardClient,
  defaultAgentId?: string,
): ToolDescriptor {
  return {
    name: "x402guard_list_session_keys",
    description:
      "List all session keys for an agent, including spent/remaining amounts " +
      "and revocation status.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent UUID. If omitted, uses the configured default.",
        },
      },
      additionalProperties: false,
    },
    handler: async (input) => {
      const agentId = (input.agent_id as string | undefined) ?? defaultAgentId;
      if (!agentId) {
        return { success: false, error: "agent_id is required (no default configured)" };
      }
      const client = getClient();
      const keys = await client.listSessionKeys(agentId);
      return { success: true, sessionKeys: keys, count: keys.length };
    },
  };
}

export function revokeSessionKeyTool(
  getClient: () => X402GuardClient,
  defaultAgentId?: string,
): ToolDescriptor {
  return {
    name: "x402guard_revoke_session_key",
    description:
      "Immediately revoke a specific session key, blocking any further " +
      "transactions using this key.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent UUID. If omitted, uses the configured default.",
        },
        key_id: {
          type: "string",
          description: "Session key UUID to revoke",
        },
      },
      required: ["key_id"],
      additionalProperties: false,
    },
    handler: async (input) => {
      const agentId = (input.agent_id as string | undefined) ?? defaultAgentId;
      if (!agentId) {
        return { success: false, error: "agent_id is required (no default configured)" };
      }
      const client = getClient();
      await client.revokeSessionKey(agentId, input.key_id as string);
      return { success: true, message: `Session key ${input.key_id} revoked` };
    },
  };
}
