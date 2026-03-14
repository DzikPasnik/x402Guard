/**
 * Tool: x402guard_revoke_all
 *
 * Emergency revocation — deactivates the agent, revokes ALL session keys,
 * and optionally revokes on-chain EIP-7702 authorization.
 * This is the "big red button" for when an agent is compromised.
 */

import type { ToolDescriptor } from "../openclaw.js";
import { X402GuardClient } from "@x402guard/core";

export function revokeAllTool(
  getClient: () => X402GuardClient,
  defaultAgentId?: string,
): ToolDescriptor {
  return {
    name: "x402guard_revoke_all",
    description:
      "EMERGENCY: Revoke ALL session keys and deactivate an agent. " +
      "Use this if the agent is compromised or behaving unexpectedly. " +
      "This action cannot be undone — the agent must be re-registered.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent UUID to revoke. If omitted, uses the configured default.",
        },
        owner_address: {
          type: "string",
          description: "Owner wallet address (0x...) for authorization",
        },
        chain_id: {
          type: "number",
          description: "EVM chain ID (e.g. 8453 for Base) for on-chain revocation",
        },
      },
      required: ["owner_address"],
      additionalProperties: false,
    },
    handler: async (input) => {
      const agentId = (input.agent_id as string | undefined) ?? defaultAgentId;
      if (!agentId) {
        return { success: false, error: "agent_id is required (no default configured)" };
      }
      const client = getClient();
      const result = await client.revokeAll(agentId, {
        owner_address: input.owner_address as string,
        chain_id: input.chain_id as number | undefined,
      });
      return {
        success: true,
        keysRevoked: result.keys_revoked,
        agentDeactivated: result.agent_deactivated,
        onChainAuthorization: result.on_chain_authorization,
      };
    },
  };
}
