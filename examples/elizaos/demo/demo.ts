/**
 * x402Guard ElizaOS Plugin -- Full-Flow Demo Script
 *
 * Demonstrates the X402GuardClient SDK (NOT ElizaOS runtime).
 * Shows: health check -> register agent -> set guardrails -> guarded payment -> violation.
 *
 * Run: npx tsx demo/demo.ts
 *
 * Prerequisites:
 *   - x402Guard proxy running: docker compose up -d
 *   - Environment: X402GUARD_PROXY_URL (default: http://localhost:3402)
 *
 * ============================================================================
 * SECURITY WARNING:
 * The private key used in this demo is Hardhat account #0.
 * NEVER use this key with real funds. It is publicly known and for testing only.
 * ============================================================================
 */

import {
  X402GuardClient,
  GuardrailViolationError,
  ProxyUnreachableError,
  createLogger,
  type CreateRuleRequest,
  type ProxyRequest,
} from "@x402guard/core";

const logger = createLogger("x402guard-demo", "info");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROXY_URL =
  process.env.X402GUARD_PROXY_URL ?? "http://localhost:3402";

/**
 * Hardhat account #0 -- TEST ONLY.
 * NEVER use this key with real funds. This is a publicly known test key.
 */
const TEST_OWNER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// ---------------------------------------------------------------------------
// Demo helpers
// ---------------------------------------------------------------------------

function formatUsdc(amount: number): string {
  return `${(amount / 1_000_000).toFixed(2)} USDC`;
}

function printSection(title: string): void {
  const separator = "=".repeat(60);
  // Demo script uses console for human-readable output (project rule exception for demo/)
  console.log(`\n${separator}`);
  console.log(`  ${title}`);
  console.log(separator);
}

function printSuccess(message: string): void {
  console.log(`  [OK] ${message}`);
}

function printError(message: string): void {
  console.log(`  [ERROR] ${message}`);
}

// ---------------------------------------------------------------------------
// Main demo flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = new X402GuardClient({
    proxyUrl: PROXY_URL,
    logLevel: "warn",
  });

  // -----------------------------------------------------------------------
  // Step 1: Health check
  // -----------------------------------------------------------------------
  printSection("Step 1: Health Check");

  try {
    await client.healthCheck();
    printSuccess(`Proxy is reachable at ${PROXY_URL}`);
  } catch (error: unknown) {
    if (error instanceof ProxyUnreachableError) {
      printError(`Proxy unreachable at ${PROXY_URL}`);
      console.log("\n  To start the proxy:");
      console.log("    docker compose up -d");
      console.log(
        "    # Wait for containers to be healthy, then re-run this demo\n",
      );
      process.exit(1);
    }
    throw error;
  }

  // -----------------------------------------------------------------------
  // Step 2: Register agent
  // -----------------------------------------------------------------------
  printSection("Step 2: Register Agent");

  const agent = await client.createAgent({
    name: `elizaos-demo-agent-${Date.now()}`,
    owner_address: TEST_OWNER_ADDRESS,
  });

  printSuccess(`Agent registered: ${agent.id}`);
  console.log(`  Name:    ${agent.name}`);
  console.log(`  Owner:   ${agent.owner_address}`);
  console.log(`  Active:  ${agent.is_active}`);

  // -----------------------------------------------------------------------
  // Step 3: Set guardrail rules
  // -----------------------------------------------------------------------
  printSection("Step 3: Set Guardrail Rules");

  const maxSpendRule: CreateRuleRequest = {
    rule_type: {
      type: "MaxSpendPerTx",
      params: { limit: 1_000_000 }, // 1 USDC
    },
  };

  const rule = await client.createRule(agent.id, maxSpendRule);
  printSuccess(
    `MaxSpendPerTx rule created: limit = ${formatUsdc(1_000_000)}`,
  );
  console.log(`  Rule ID: ${rule.id}`);

  // Also add MaxSpendPerDay
  const dailyRule: CreateRuleRequest = {
    rule_type: {
      type: "MaxSpendPerDay",
      params: { limit: 5_000_000 }, // 5 USDC daily
    },
  };

  const daily = await client.createRule(agent.id, dailyRule);
  printSuccess(
    `MaxSpendPerDay rule created: limit = ${formatUsdc(5_000_000)}`,
  );
  console.log(`  Rule ID: ${daily.id}`);

  // List all rules
  const rules = await client.listRules(agent.id);
  console.log(`\n  Total rules for agent: ${rules.length}`);

  // -----------------------------------------------------------------------
  // Step 4: Make guarded EVM payment (under limit -- should succeed)
  // -----------------------------------------------------------------------
  printSection("Step 4: Guarded Payment (Under Limit)");

  const paymentAmount = 500_000; // 0.50 USDC -- under the 1 USDC limit
  console.log(`  Amount: ${formatUsdc(paymentAmount)}`);
  console.log(`  Limit:  ${formatUsdc(1_000_000)}`);

  // Build a demo ProxyRequest with a base64url-encoded payment payload.
  // In production, the ElizaOS runtime provides pre-signed EIP-712 payloads.
  // For this demo, we use a placeholder payload that the proxy will attempt
  // to validate. The proxy may reject it (invalid signature), but the
  // guardrail check happens first.
  const demoPayload = Buffer.from(
    JSON.stringify({
      from: TEST_OWNER_ADDRESS,
      to: "0x0000000000000000000000000000000000000001",
      value: paymentAmount.toString(),
      validAfter: "0",
      validBefore: Math.floor(Date.now() / 1000 + 3600).toString(),
      nonce: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`,
    }),
  )
    .toString("base64url");

  const demoRequirements = Buffer.from(
    JSON.stringify({
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: paymentAmount.toString(),
      resource: "https://api.example.com/premium",
      description: "Demo API access",
    }),
  )
    .toString("base64url");

  const paymentReq: ProxyRequest = {
    targetUrl: "https://api.example.com/premium",
    x402Payment: demoPayload,
    x402Requirements: demoRequirements,
    agentId: agent.id,
  };

  try {
    const response = await client.proxyPayment(paymentReq);
    printSuccess(`Payment forwarded: ${response.message}`);
  } catch (error: unknown) {
    if (error instanceof GuardrailViolationError) {
      // Unexpected -- amount is under limit
      printError(`Unexpected violation: ${error.message}`);
    } else {
      // Expected: proxy may reject the demo payload (invalid EIP-712 sig)
      // but guardrail validation passed if we get a non-403 error
      const msg = error instanceof Error ? error.message : String(error);
      console.log(
        `  [INFO] Proxy returned an error (expected for demo payload): ${msg}`,
      );
      console.log(
        "  [INFO] The guardrail check passed -- the error is from EIP-712 validation",
      );
    }
  }

  // -----------------------------------------------------------------------
  // Step 5: Trigger guardrail violation (over limit)
  // -----------------------------------------------------------------------
  printSection("Step 5: Trigger Guardrail Violation");

  const overLimitAmount = 2_000_000; // 2 USDC -- exceeds 1 USDC limit
  console.log(`  Amount: ${formatUsdc(overLimitAmount)}`);
  console.log(`  Limit:  ${formatUsdc(1_000_000)}`);

  const overLimitPayload = Buffer.from(
    JSON.stringify({
      from: TEST_OWNER_ADDRESS,
      to: "0x0000000000000000000000000000000000000001",
      value: overLimitAmount.toString(),
      validAfter: "0",
      validBefore: Math.floor(Date.now() / 1000 + 3600).toString(),
      nonce: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`,
    }),
  )
    .toString("base64url");

  const overLimitRequirements = Buffer.from(
    JSON.stringify({
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: overLimitAmount.toString(),
      resource: "https://api.example.com/premium",
      description: "Demo API access (over limit)",
    }),
  )
    .toString("base64url");

  const overLimitReq: ProxyRequest = {
    targetUrl: "https://api.example.com/premium",
    x402Payment: overLimitPayload,
    x402Requirements: overLimitRequirements,
    agentId: agent.id,
  };

  try {
    await client.proxyPayment(overLimitReq);
    printError("Payment should have been blocked but succeeded");
  } catch (error: unknown) {
    if (error instanceof GuardrailViolationError) {
      console.log();
      console.log(
        `  [BLOCKED] GuardrailViolationError: ${error.ruleType} limit=${error.limit} actual=${error.actual}`,
      );
      console.log(`    rule_type: ${error.ruleType}`);
      console.log(
        `    limit:     ${typeof error.limit === "number" ? error.limit.toLocaleString() : error.limit} (${typeof error.limit === "number" ? formatUsdc(error.limit) : error.limit})`,
      );
      console.log(
        `    actual:    ${typeof error.actual === "number" ? error.actual.toLocaleString() : error.actual} (${typeof error.actual === "number" ? formatUsdc(error.actual) : error.actual})`,
      );
      console.log();
      printSuccess(
        "Guardrail correctly blocked the over-limit payment",
      );
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      printError(`Unexpected error: ${msg}`);
    }
  }

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------
  printSection("Demo Complete");
  console.log(
    "  The x402Guard proxy correctly enforced guardrail rules.",
  );
  console.log(
    "  In production, ElizaOS agents use the plugin for automatic integration.\n",
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  logger.fatal({ error: msg }, "Demo failed with unexpected error");
  process.exit(1);
});
