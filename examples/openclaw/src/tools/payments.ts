/**
 * Tools: x402guard_proxy_payment, x402guard_proxy_solana_payment
 *
 * The core payment proxy tools — these route x402 payments through
 * the guardrail engine before they hit the blockchain.
 */

import type { ToolDescriptor } from "../openclaw.js";
import {
  X402GuardClient,
  GuardrailViolationError,
  ProxyUnreachableError,
} from "@x402guard/core";

export function proxyPaymentTool(
  getClient: () => X402GuardClient,
  defaultAgentId?: string,
): ToolDescriptor {
  return {
    name: "x402guard_proxy_payment",
    description:
      "Make a guarded EVM (Base) payment through x402Guard. " +
      "The proxy validates all guardrail rules before forwarding the transaction. " +
      "If any rule is violated, the payment is blocked and the violation details are returned.",
    inputSchema: {
      type: "object",
      properties: {
        target_url: {
          type: "string",
          description: "URL of the x402-enabled service to pay",
        },
        x402_payment: {
          type: "string",
          description: "Base64url-encoded x402 payment payload",
        },
        x402_requirements: {
          type: "string",
          description: "Base64url-encoded x402 requirements from the server",
        },
        agent_id: {
          type: "string",
          description: "Agent UUID. If omitted, uses the configured default.",
        },
        session_key_id: {
          type: "string",
          description: "Optional session key UUID for delegated signing",
        },
      },
      required: ["target_url", "x402_payment", "x402_requirements"],
      additionalProperties: false,
    },
    handler: async (input) => {
      const agentId = (input.agent_id as string | undefined) ?? defaultAgentId;
      const client = getClient();

      try {
        const response = await client.proxyPayment({
          targetUrl: input.target_url as string,
          x402Payment: input.x402_payment as string,
          x402Requirements: input.x402_requirements as string,
          agentId,
          sessionKeyId: input.session_key_id as string | undefined,
        });
        return {
          success: true,
          txHash: response.txHash,
          message: response.message,
        };
      } catch (error: unknown) {
        if (error instanceof GuardrailViolationError) {
          return {
            success: false,
            blocked: true,
            ruleType: error.ruleType,
            limit: error.limit,
            actual: error.actual,
            message: error.message,
          };
        }
        if (error instanceof ProxyUnreachableError) {
          return { success: false, error: `Proxy unreachable: ${error.message}` };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      }
    },
  };
}

export function proxySolanaPaymentTool(
  getClient: () => X402GuardClient,
): ToolDescriptor {
  return {
    name: "x402guard_proxy_solana_payment",
    description:
      "Make a guarded Solana payment through x402Guard. " +
      "Routes the transaction through the Solana vault program with guardrail enforcement.",
    inputSchema: {
      type: "object",
      properties: {
        target_url: {
          type: "string",
          description: "URL of the x402-enabled Solana service to pay",
        },
        network: {
          type: "string",
          description: "Solana network: 'devnet' or 'mainnet-beta'",
          enum: ["devnet", "mainnet-beta"],
        },
        vault_owner: {
          type: "string",
          description: "Solana public key of the vault owner",
        },
        amount: {
          type: "number",
          description: "Payment amount in lamports",
        },
        x402_payment: {
          type: "string",
          description: "Base64url-encoded x402 payment payload",
        },
        destination_program: {
          type: "string",
          description: "Optional Solana program ID to interact with",
        },
      },
      required: ["target_url", "network", "vault_owner", "amount", "x402_payment"],
      additionalProperties: false,
    },
    handler: async (input) => {
      const client = getClient();

      try {
        const response = await client.proxySolanaPayment({
          targetUrl: input.target_url as string,
          network: input.network as string,
          vaultOwner: input.vault_owner as string,
          amount: input.amount as number,
          x402Payment: input.x402_payment as string,
          destinationProgram: input.destination_program as string | undefined,
        });
        return {
          success: true,
          message: response.message,
          vaultPda: response.vaultPda,
          remainingDailyCapacity: response.remainingDailyCapacity,
        };
      } catch (error: unknown) {
        if (error instanceof GuardrailViolationError) {
          return {
            success: false,
            blocked: true,
            ruleType: error.ruleType,
            limit: error.limit,
            actual: error.actual,
            message: error.message,
          };
        }
        if (error instanceof ProxyUnreachableError) {
          return { success: false, error: `Proxy unreachable: ${error.message}` };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      }
    },
  };
}
