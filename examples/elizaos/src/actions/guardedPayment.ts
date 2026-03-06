/**
 * ElizaOS Action: GUARDED_PAYMENT
 *
 * Makes an x402 payment through the x402Guard guardrail proxy.
 * Supports both EVM (Base) and Solana networks.
 *
 * Required runtime settings:
 * - X402GUARD_PROXY_URL: URL of the x402Guard proxy (e.g. http://localhost:3402)
 * - X402GUARD_AGENT_ID: UUID of the registered agent (optional for proxy)
 *
 * The handler extracts payment parameters from the message content
 * and delegates to X402GuardClient.proxyPayment or proxySolanaPayment.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import {
  X402GuardClient,
  GuardrailViolationError,
  ProxyUnreachableError,
  createLogger,
  type ProxyRequest,
  type SolanaProxyRequest,
} from "@x402guard/core";

const logger = createLogger("elizaos-guarded-payment");

/**
 * Payment parameters extracted from ElizaOS message content.
 */
interface PaymentParams {
  readonly targetUrl: string;
  readonly amount: number;
  readonly network?: string;
  readonly x402Payment: string;
  readonly x402Requirements?: string;
  readonly sessionKeyId?: string;
  readonly vaultOwner?: string;
  readonly destinationProgram?: string;
}

/**
 * Extract payment parameters from the message content.
 *
 * Expects message.content to contain payment-related fields
 * alongside the text prompt.
 */
function extractPaymentParams(message: Memory): PaymentParams | undefined {
  const content = message.content;

  const targetUrl = content.targetUrl as string | undefined;
  const x402Payment = content.x402Payment as string | undefined;
  const amount = content.amount as number | undefined;

  if (!targetUrl || !x402Payment) {
    return undefined;
  }

  return {
    targetUrl,
    amount: amount ?? 0,
    network: content.network as string | undefined,
    x402Payment,
    x402Requirements: content.x402Requirements as string | undefined,
    sessionKeyId: content.sessionKeyId as string | undefined,
    vaultOwner: content.vaultOwner as string | undefined,
    destinationProgram: content.destinationProgram as string | undefined,
  };
}

/**
 * Build an X402GuardClient from ElizaOS runtime settings.
 */
function buildClient(runtime: IAgentRuntime): X402GuardClient {
  const proxyUrl = runtime.getSetting("X402GUARD_PROXY_URL");
  const agentId = runtime.getSetting("X402GUARD_AGENT_ID");
  const logLevel = runtime.getSetting("X402GUARD_LOG_LEVEL");

  if (!proxyUrl) {
    throw new Error(
      "X402GUARD_PROXY_URL not configured in ElizaOS runtime settings",
    );
  }

  const maxRetries = runtime.getSetting("X402GUARD_MAX_RETRIES");

  return new X402GuardClient({
    proxyUrl,
    agentId,
    logLevel: logLevel as "info" | "debug" | "warn" | "error" | undefined,
    maxRetries: maxRetries ? parseInt(maxRetries, 10) : undefined,
  });
}

/**
 * ElizaOS Action for making guarded x402 payments via x402Guard proxy.
 *
 * The action validates that the proxy URL is configured, extracts payment
 * parameters from the message content, and routes to either the EVM or
 * Solana proxy endpoint based on the `network` field.
 *
 * On guardrail violations, the action returns structured violation details
 * (rule type, limit, actual value) so the agent can explain the rejection.
 */
export const guardedPaymentAction: Action = {
  name: "GUARDED_PAYMENT",
  description: "Make an x402 payment guarded by x402Guard guardrails",
  similes: ["PAY", "TRANSFER", "SEND_PAYMENT", "X402_PAY"],

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Pay 0.50 USDC to the API endpoint",
          targetUrl: "https://api.example.com/premium",
          amount: 500000,
          x402Payment: "base64url-encoded-payment-payload",
          x402Requirements: "base64url-encoded-requirements",
        },
      },
      {
        user: "{{agent}}",
        content: {
          text: "Payment of 0.50 USDC was successfully proxied through x402Guard.",
        },
      },
    ],
  ],

  /**
   * Validate that the proxy URL is configured.
   * Returns true if X402GUARD_PROXY_URL is set in runtime settings.
   */
  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    const proxyUrl = runtime.getSetting("X402GUARD_PROXY_URL");
    return proxyUrl !== undefined && proxyUrl.length > 0;
  },

  /**
   * Execute the guarded payment.
   *
   * Routes to EVM or Solana proxy based on the `network` field in message content.
   * Default network is "evm" if not specified.
   */
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<unknown> => {
    const params = extractPaymentParams(message);

    if (!params) {
      const errorText =
        "Missing payment parameters. Required: targetUrl, x402Payment";
      logger.warn({ message: message.content.text }, errorText);
      if (callback) {
        await callback({ text: errorText });
      }
      return { success: false, error: errorText };
    }

    try {
      const client = buildClient(runtime);
      const agentId = runtime.getSetting("X402GUARD_AGENT_ID");
      const network = params.network?.toLowerCase();

      if (network === "solana") {
        // Solana payment path
        if (!params.vaultOwner) {
          const errorText =
            "Solana payment requires vaultOwner in message content";
          if (callback) {
            await callback({ text: errorText });
          }
          return { success: false, error: errorText };
        }

        const solanaReq: SolanaProxyRequest = {
          targetUrl: params.targetUrl,
          network: "solana",
          vaultOwner: params.vaultOwner,
          amount: params.amount,
          destinationProgram: params.destinationProgram,
          x402Payment: params.x402Payment,
        };

        logger.info(
          { targetUrl: params.targetUrl, amount: params.amount },
          "Proxying Solana payment through x402Guard",
        );

        const response = await client.proxySolanaPayment(solanaReq);

        const successText = `Solana payment proxied successfully: ${response.message}`;
        if (callback) {
          await callback({ text: successText, data: response });
        }
        return { success: true, data: response };
      }

      // Default: EVM payment path
      const evmReq: ProxyRequest = {
        targetUrl: params.targetUrl,
        x402Payment: params.x402Payment,
        x402Requirements: params.x402Requirements ?? "",
        agentId,
        sessionKeyId: params.sessionKeyId,
      };

      logger.info(
        { targetUrl: params.targetUrl, agentId },
        "Proxying EVM payment through x402Guard",
      );

      const response = await client.proxyPayment(evmReq);

      const successText = `Payment proxied successfully: ${response.message}`;
      if (callback) {
        await callback({ text: successText, data: response });
      }
      return { success: true, data: response };
    } catch (error: unknown) {
      if (error instanceof GuardrailViolationError) {
        logger.warn(
          {
            ruleType: error.ruleType,
            limit: error.limit,
            actual: error.actual,
          },
          "Guardrail violation blocked payment",
        );

        const violationText = [
          `Payment blocked by guardrail: ${error.ruleType}`,
          `  Rule type: ${error.ruleType}`,
          `  Limit:     ${error.limit}`,
          `  Actual:    ${error.actual}`,
          `  Message:   ${error.message}`,
        ].join("\n");

        if (callback) {
          await callback({
            text: violationText,
            data: {
              violation: true,
              ruleType: error.ruleType,
              limit: error.limit,
              actual: error.actual,
            },
          });
        }
        return {
          success: false,
          violation: true,
          ruleType: error.ruleType,
          limit: error.limit,
          actual: error.actual,
        };
      }

      if (error instanceof ProxyUnreachableError) {
        logger.error(
          { error: error.message },
          "x402Guard proxy unreachable",
        );
        const errorText = `x402Guard proxy unreachable -- is docker compose up running? (${error.message})`;
        if (callback) {
          await callback({ text: errorText });
        }
        return { success: false, error: errorText };
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, "Payment failed");
      const errorText = `Payment failed: ${errorMessage}`;
      if (callback) {
        await callback({ text: errorText });
      }
      return { success: false, error: errorText };
    }
  },
};
