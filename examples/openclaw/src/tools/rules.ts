/**
 * Tools: x402guard_create_rule, x402guard_list_rules
 *
 * Guardrail rule management — the core safety mechanism of x402Guard.
 * Rules enforce spend limits, contract whitelists, leverage caps, and slippage limits.
 */

import type { ToolDescriptor } from "../openclaw.js";
import { X402GuardClient } from "@x402guard/core";
import type { RuleType } from "@x402guard/core";

/** Map user-friendly rule type names to structured RuleType objects. */
function parseRuleType(input: Record<string, unknown>): RuleType {
  const ruleType = input.rule_type as string;

  switch (ruleType) {
    case "MaxSpendPerTx":
      return { type: "MaxSpendPerTx", params: { limit: input.limit as number } };
    case "MaxSpendPerDay":
      return { type: "MaxSpendPerDay", params: { limit: input.limit as number } };
    case "AllowedContracts":
      return {
        type: "AllowedContracts",
        params: { addresses: input.addresses as readonly string[] },
      };
    case "MaxLeverage":
      return { type: "MaxLeverage", params: { max: input.max as number } };
    case "MaxSlippage":
      return { type: "MaxSlippage", params: { bps: input.bps as number } };
    default:
      throw new Error(`Unknown rule type: ${ruleType}`);
  }
}

export function createRuleTool(
  getClient: () => X402GuardClient,
  defaultAgentId?: string,
): ToolDescriptor {
  return {
    name: "x402guard_create_rule",
    description:
      "Create a guardrail rule for an agent. Available rule types:\n" +
      "- MaxSpendPerTx: Max USDC per single transaction (set 'limit' in micro-USDC, e.g. 1000000 = $1)\n" +
      "- MaxSpendPerDay: Max USDC spend per 24h rolling window\n" +
      "- AllowedContracts: Whitelist of contract addresses the agent can interact with\n" +
      "- MaxLeverage: Maximum leverage multiplier for DeFi positions\n" +
      "- MaxSlippage: Maximum allowed slippage in basis points (100 bps = 1%)",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent UUID. If omitted, uses the configured default.",
        },
        rule_type: {
          type: "string",
          description: "Rule type: MaxSpendPerTx, MaxSpendPerDay, AllowedContracts, MaxLeverage, or MaxSlippage",
          enum: ["MaxSpendPerTx", "MaxSpendPerDay", "AllowedContracts", "MaxLeverage", "MaxSlippage"],
        },
        limit: {
          type: "number",
          description: "Spend limit in micro-USDC (for MaxSpendPerTx, MaxSpendPerDay)",
        },
        addresses: {
          type: "object",
          description: "Array of allowed contract addresses (for AllowedContracts)",
        },
        max: {
          type: "number",
          description: "Maximum leverage multiplier (for MaxLeverage)",
        },
        bps: {
          type: "number",
          description: "Maximum slippage in basis points (for MaxSlippage)",
        },
      },
      required: ["rule_type"],
      additionalProperties: false,
    },
    handler: async (input) => {
      const agentId = (input.agent_id as string | undefined) ?? defaultAgentId;
      if (!agentId) {
        return { success: false, error: "agent_id is required (no default configured)" };
      }
      const client = getClient();
      const ruleType = parseRuleType(input);
      const rule = await client.createRule(agentId, { rule_type: ruleType });
      return { success: true, rule };
    },
  };
}

export function listRulesTool(
  getClient: () => X402GuardClient,
  defaultAgentId?: string,
): ToolDescriptor {
  return {
    name: "x402guard_list_rules",
    description:
      "List all active guardrail rules for an agent. " +
      "Shows rule types, limits, and whether each rule is active.",
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
      const rules = await client.listRules(agentId);
      return { success: true, rules, count: rules.length };
    },
  };
}
