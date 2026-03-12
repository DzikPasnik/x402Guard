/**
 * AI Agent API route — streaming chat with x402Guard tools.
 *
 * Uses Vercel AI SDK + Anthropic Claude to create an agent that can:
 * - Check proxy health
 * - List guardrail rules for an agent
 * - List session keys for an agent
 * - Simulate a payment through x402Guard proxy
 * - Query audit logs
 */

import { streamText, type ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase admin client (server-side only)
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

const PROXY_URL = "https://x402guard-production.up.railway.app";

async function proxyFetch(path: string, options?: RequestInit) {
  const url = `${PROXY_URL}/api/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Agent tools — plain objects (AI SDK tool() is identity fn, Zod v4 types
// conflict with AI SDK generics so we define tools directly)
// ---------------------------------------------------------------------------

const agentTools: ToolSet = {
  check_proxy_health: {
    description:
      "Check if the x402Guard proxy is online and responding. Call this first to verify connectivity.",
    inputSchema: z.object({
      _unused: z.string().optional().describe("Not used"),
    }),
    execute: async () => {
      try {
        const res = await fetch(`${PROXY_URL}/health`);
        const data = await res.json();
        return { status: "online", ...data };
      } catch {
        return { status: "offline", error: "Proxy unreachable" };
      }
    },
  },

  list_agents: {
    description:
      "List all registered agents from the database. Returns agent names, IDs, and active status.",
    inputSchema: z.object({
      _unused: z.string().optional().describe("Not used"),
    }),
    execute: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, owner_address, is_active, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) return { error: error.message };
      return { agents: data ?? [] };
    },
  },

  get_guardrail_rules: {
    description:
      "Get all active guardrail rules for a specific agent. Shows spend limits, allowed contracts, leverage limits, etc.",
    inputSchema: z.object({
      agent_id: z.string().describe("The UUID of the agent to query"),
    }),
    execute: async ({ agent_id }: { agent_id: string }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("guardrail_rules")
        .select("id, rule_type, is_active, created_at")
        .eq("agent_id", agent_id)
        .eq("is_active", true);

      if (error) return { error: error.message };
      return { rules: data ?? [] };
    },
  },

  get_session_keys: {
    description:
      "List session keys for an agent. Shows spending allowances, expiration, and revocation status.",
    inputSchema: z.object({
      agent_id: z.string().describe("The UUID of the agent to query"),
    }),
    execute: async ({ agent_id }: { agent_id: string }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("session_keys")
        .select(
          "id, public_key, max_spend, spent, allowed_contracts, expires_at, is_revoked, created_at",
        )
        .eq("agent_id", agent_id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) return { error: error.message };
      return { session_keys: data ?? [] };
    },
  },

  get_spend_summary: {
    description:
      "Get today's spending summary for an agent — total spent, number of transactions, and daily limit remaining.",
    inputSchema: z.object({
      agent_id: z.string().describe("The UUID of the agent to query"),
    }),
    execute: async ({ agent_id }: { agent_id: string }) => {
      const supabase = getSupabase();

      // Get today's spend from ledger
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const { data: spendData, error: spendError } = await supabase
        .from("spend_ledger")
        .select("amount")
        .eq("agent_id", agent_id)
        .gte("created_at", todayStart.toISOString());

      if (spendError) return { error: spendError.message };

      const totalSpent = (spendData ?? []).reduce(
        (sum: number, row: { amount: number }) => sum + Number(row.amount),
        0,
      );

      // Get daily limit from rules
      const { data: rules } = await supabase
        .from("guardrail_rules")
        .select("rule_type")
        .eq("agent_id", agent_id)
        .eq("is_active", true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dailyLimitRule = (rules ?? []).find(
        (r: any) => r.rule_type?.type === "MaxSpendPerDay",
      );

      const dailyLimit = dailyLimitRule?.rule_type?.params?.limit ?? "No limit set";

      return {
        today_spent_usdc: totalSpent / 1_000_000,
        transaction_count: spendData?.length ?? 0,
        daily_limit_usdc:
          typeof dailyLimit === "number" ? dailyLimit / 1_000_000 : dailyLimit,
        remaining_usdc:
          typeof dailyLimit === "number"
            ? (dailyLimit - totalSpent) / 1_000_000
            : "Unlimited",
      };
    },
  },

  simulate_payment: {
    description:
      "Simulate a payment through x402Guard proxy. This sends a real request to the production proxy to test guardrail enforcement. The proxy will check all active rules and either allow or block the payment. Use a mock target URL for testing.",
    inputSchema: z.object({
      agent_id: z.string().describe("The UUID of the agent making the payment"),
      amount_usdc: z
        .number()
        .describe("Payment amount in USDC (e.g. 0.50 for fifty cents)"),
      target_url: z
        .string()
        .default("https://mock-service-one.vercel.app/api/premium")
        .describe("The target service URL to pay"),
    }),
    execute: async ({
      agent_id,
      amount_usdc,
      target_url,
    }: {
      agent_id: string;
      amount_usdc: number;
      target_url: string;
    }) => {
      try {
        const result = await proxyFetch("/proxy", {
          method: "POST",
          body: JSON.stringify({
            targetUrl: target_url,
            x402Payment: "simulated-payment-header",
            x402Requirements: JSON.stringify({
              scheme: "exact",
              network: "base-sepolia",
              maxAmountRequired: String(Math.round(amount_usdc * 1_000_000)),
              resource: target_url,
              description: `AI agent payment: ${amount_usdc} USDC`,
            }),
            agentId: agent_id,
          }),
        });

        return {
          result,
          interpretation:
            result.error && result.error.includes("guardrail")
              ? "BLOCKED by guardrails — the payment violated a rule"
              : result.success
                ? "ALLOWED — payment passed all guardrail checks"
                : `Proxy response: ${result.error || result.message || "Unknown"}`,
        };
      } catch (error) {
        return {
          error: `Failed to reach proxy: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  },

  get_audit_log: {
    description:
      "Query the immutable audit log. Shows recent events like payments, guardrail violations, key revocations, etc.",
    inputSchema: z.object({
      agent_id: z
        .string()
        .optional()
        .describe("Optional: filter by agent UUID"),
      limit: z
        .number()
        .default(10)
        .describe("Number of recent events to return"),
    }),
    execute: async ({
      agent_id,
      limit,
    }: {
      agent_id?: string;
      limit: number;
    }) => {
      const supabase = getSupabase();

      let query = supabase
        .from("audit_events")
        .select("id, event_type, agent_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (agent_id) {
        query = query.eq("agent_id", agent_id);
      }

      const { data, error } = await query;

      if (error) return { error: error.message };
      return { events: data ?? [] };
    },
  },
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are x402Guard Assistant — an AI agent that demonstrates the x402Guard security proxy for autonomous DeFi agents.

You have tools to interact with the LIVE production x402Guard system:
- Check proxy health
- List registered agents and their guardrail rules
- View session keys and spending limits
- Simulate payments to test guardrail enforcement
- Query the immutable audit log

Your personality:
- Security-focused, professional but friendly
- Explain guardrails clearly — users may be new to x402/DeFi
- When demonstrating, walk through each step and explain what's happening
- Highlight how guardrails PROTECT agents from overspending or interacting with unauthorized contracts

When users ask you to demonstrate x402Guard:
1. First check proxy health
2. List available agents
3. Show their guardrail rules
4. Simulate a payment and show how rules are enforced
5. Show the audit trail

Amounts in the database are in micro-USDC (1 USDC = 1,000,000 micro-USDC). Always display human-readable USDC values.

Keep responses concise. Use formatting (bold, lists) for clarity.`;

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const { messages } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages,
    tools: agentTools,
    maxSteps: 8,
  } as Parameters<typeof streamText>[0]);

  return result.toUIMessageStreamResponse();
}
