/**
 * Cod3x Adapter Demo -- Full-flow demonstration script.
 *
 * Demonstrates how a Cod3x ToolChain agent integrates x402Guard for
 * guarded DeFi payments using the X402GuardCod3xAdapter.
 *
 * Prerequisites:
 *   1. x402Guard proxy running: docker compose up -d
 *   2. Set X402GUARD_PROXY_URL=http://localhost:3402
 *
 * Run: npx tsx demo/demo.ts
 *
 * SECURITY: The private key used below is Hardhat account #0 -- TEST ONLY.
 * Never use this key for real transactions.
 */

import { createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  X402GuardCod3xAdapter,
  GuardrailViolationError,
  createLogger,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROXY_URL =
  process.env.X402GUARD_PROXY_URL ?? "http://localhost:3402";
const LOG_LEVEL = process.env.X402GUARD_LOG_LEVEL ?? "info";

/**
 * TEST ONLY -- Hardhat account #0 private key.
 * NEVER use this key for real transactions on mainnet.
 */
const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const logger = createLogger("cod3x-demo", LOG_LEVEL);

// ---------------------------------------------------------------------------
// EIP-712 signing helper
// ---------------------------------------------------------------------------

/**
 * Generate an EIP-712 TransferWithAuthorization signature using viem.
 *
 * This creates a valid x402 payment payload that the proxy can verify.
 */
async function signTransferWithAuthorization(params: {
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: bigint;
  readonly validAfter: bigint;
  readonly validBefore: bigint;
  readonly nonce: `0x${string}`;
}): Promise<string> {
  const account = privateKeyToAccount(TEST_PRIVATE_KEY as `0x${string}`);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: BigInt(baseSepolia.id),
    verifyingContract: USDC_BASE_SEPOLIA as `0x${string}`,
  } as const;

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const;

  const signature = await client.signTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message: params,
  });

  // Encode as base64url payment payload (simplified for demo)
  const payloadJson = JSON.stringify({
    signature,
    authorization: {
      from: params.from,
      to: params.to,
      value: params.value.toString(),
      validAfter: params.validAfter.toString(),
      validBefore: params.validBefore.toString(),
      nonce: params.nonce,
    },
  });

  return Buffer.from(payloadJson).toString("base64url");
}

// ---------------------------------------------------------------------------
// Demo flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.info("=== Cod3x x402Guard Adapter Demo ===");
  logger.info({ proxyUrl: PROXY_URL }, "Configuration");

  // -----------------------------------------------------------------------
  // Step 1: Initialize adapter & health check
  // -----------------------------------------------------------------------

  logger.info("--- Step 1: Health Check ---");

  const adapter = new X402GuardCod3xAdapter({
    proxyUrl: PROXY_URL,
    logLevel: LOG_LEVEL,
  });

  try {
    const isHealthy = await adapter.healthCheck();
    logger.info({ healthy: isHealthy }, "Proxy health check");
  } catch (error: unknown) {
    logger.error({ error }, "Proxy is not reachable. Is docker compose up?");
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // Step 2: Register agent
  // -----------------------------------------------------------------------

  logger.info("--- Step 2: Register Agent ---");

  const account = privateKeyToAccount(TEST_PRIVATE_KEY as `0x${string}`);
  const agent = await adapter.createAgent(
    "cod3x-demo-agent",
    account.address,
  );
  logger.info(
    { agentId: agent.id, name: agent.name, owner: agent.owner_address },
    "Agent registered",
  );

  // -----------------------------------------------------------------------
  // Step 3: Set guardrail (MaxSpendPerTx = 1 USDC = 1_000_000)
  // -----------------------------------------------------------------------

  logger.info("--- Step 3: Set Guardrail ---");

  const rule = await adapter.createGuardrail(agent.id, {
    type: "MaxSpendPerTx",
    params: { limit: 1_000_000 },
  });
  logger.info(
    { ruleId: rule.id, ruleType: rule.rule_type },
    "Guardrail created: MaxSpendPerTx = 1.00 USDC",
  );

  // -----------------------------------------------------------------------
  // Step 4: Make guarded payment (under limit -- should succeed)
  // -----------------------------------------------------------------------

  logger.info("--- Step 4: Guarded Payment (Under Limit) ---");

  const nonce = toHex(
    crypto.getRandomValues(new Uint8Array(32)),
  ) as `0x${string}`;
  const now = BigInt(Math.floor(Date.now() / 1000));

  const paymentPayload = await signTransferWithAuthorization({
    from: account.address,
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
    value: 500_000n, // 0.50 USDC -- under limit
    validAfter: 0n,
    validBefore: now + 3600n,
    nonce,
  });

  const requirementsPayload = Buffer.from(
    JSON.stringify({
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "500000",
      resource: "https://api.example.com/resource",
      description: "Demo payment",
      mimeType: "application/json",
      payToAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      maxTimeoutSeconds: 3600,
      asset: USDC_BASE_SEPOLIA,
    }),
  ).toString("base64url");

  try {
    const result = await adapter.guardedExecute({
      targetUrl: "https://api.example.com/resource",
      x402Payment: paymentPayload,
      x402Requirements: requirementsPayload,
      agentId: agent.id,
      cod3xSessionId: "demo-session-001",
    });
    logger.info(
      {
        success: result.success,
        guardedBy: result.guardedBy,
        message: result.message,
      },
      "Payment result",
    );
  } catch (error: unknown) {
    // In demo mode without a real target API, the proxy may return an error
    // after guardrail validation passes. This is expected.
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Payment forwarding failed (expected in demo without real target API)",
    );
  }

  // -----------------------------------------------------------------------
  // Step 5: Trigger guardrail violation (over limit)
  // -----------------------------------------------------------------------

  logger.info("--- Step 5: Trigger Guardrail Violation ---");

  const nonce2 = toHex(
    crypto.getRandomValues(new Uint8Array(32)),
  ) as `0x${string}`;

  const violationPayload = await signTransferWithAuthorization({
    from: account.address,
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
    value: 2_000_000n, // 2.00 USDC -- over limit
    validAfter: 0n,
    validBefore: now + 3600n,
    nonce: nonce2,
  });

  const violationRequirements = Buffer.from(
    JSON.stringify({
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "2000000",
      resource: "https://api.example.com/resource",
      description: "Demo violation payment",
      mimeType: "application/json",
      payToAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      maxTimeoutSeconds: 3600,
      asset: USDC_BASE_SEPOLIA,
    }),
  ).toString("base64url");

  try {
    await adapter.guardedExecute({
      targetUrl: "https://api.example.com/resource",
      x402Payment: violationPayload,
      x402Requirements: violationRequirements,
      agentId: agent.id,
      cod3xSessionId: "demo-session-002",
    });
    logger.error("Expected guardrail violation but payment succeeded!");
  } catch (error: unknown) {
    if (error instanceof GuardrailViolationError) {
      logger.info("[BLOCKED] GuardrailViolationError: %s", error.message);
      logger.info("  rule_type: %s", error.ruleType);
      logger.info(
        "  limit:     %s (%s USDC)",
        typeof error.limit === "number"
          ? error.limit.toLocaleString()
          : error.limit,
        typeof error.limit === "number"
          ? (error.limit / 1_000_000).toFixed(2)
          : "N/A",
      );
      logger.info(
        "  actual:    %s (%s USDC)",
        typeof error.actual === "number"
          ? error.actual.toLocaleString()
          : error.actual,
        typeof error.actual === "number"
          ? (error.actual / 1_000_000).toFixed(2)
          : "N/A",
      );
    } else {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Unexpected error (not a guardrail violation)",
      );
    }
  }

  // -----------------------------------------------------------------------
  // Step 6: Security worker integration point
  // -----------------------------------------------------------------------

  logger.info("--- Step 6: Security Worker Integration ---");

  // Create adapter with agent ID for security worker
  const adapterWithAgent = new X402GuardCod3xAdapter({
    proxyUrl: PROXY_URL,
    agentId: agent.id,
    logLevel: LOG_LEVEL,
  });

  const workerConfig = adapterWithAgent.toSecurityWorker();
  const workerResult = await workerConfig.securityWorker(undefined);

  logger.info(
    { securityWorkerHeaders: workerResult.headers },
    "Security worker configuration for Cod3x SDK",
  );
  logger.info(
    "Use this with Cod3x SDK: new CodexSDK({ securityWorker: ... })",
  );

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------

  logger.info("=== Demo Complete ===");
  process.exit(0);
}

main().catch((error: unknown) => {
  const logger2 = createLogger("cod3x-demo", LOG_LEVEL);
  logger2.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Demo failed with unexpected error",
  );
  process.exit(1);
});
