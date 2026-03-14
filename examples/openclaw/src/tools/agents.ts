/**
 * Tools: x402guard_create_agent, x402guard_get_agent
 *
 * Agent lifecycle management for the x402Guard proxy.
 */

import type { ToolDescriptor } from "../openclaw.js";
import { X402GuardClient } from "@x402guard/core";

export function createAgentTool(getClient: () => X402GuardClient): ToolDescriptor {
  return {
    name: "x402guard_create_agent",
    description:
      "Register a new AI agent with the x402Guard proxy. " +
      "Returns the agent's UUID which is needed for all subsequent operations.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable agent name (e.g. 'my-defi-agent')",
        },
        owner_address: {
          type: "string",
          description: "Ethereum address (0x...) of the agent's owner wallet",
        },
      },
      required: ["name", "owner_address"],
      additionalProperties: false,
    },
    handler: async (input) => {
      const client = getClient();
      const agent = await client.createAgent({
        name: input.name as string,
        owner_address: input.owner_address as string,
      });
      return { success: true, agent };
    },
  };
}

export function getAgentTool(
  getClient: () => X402GuardClient,
  defaultAgentId?: string,
): ToolDescriptor {
  return {
    name: "x402guard_get_agent",
    description:
      "Retrieve details of a registered agent by ID, " +
      "including its name, owner address, and active status.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent UUID. If omitted, uses the configured default agent.",
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
      const agent = await client.getAgent(agentId);
      return { success: true, agent };
    },
  };
}
