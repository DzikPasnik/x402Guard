# Security Policy

## Reporting Vulnerabilities

x402Guard handles real money for autonomous DeFi agents. We take security reports seriously.

**Contact:** security@x402guard.dev

**Process:**

1. Email security@x402guard.dev with a description of the vulnerability, steps to reproduce, and potential impact.
2. You will receive acknowledgment within 48 hours.
3. We will work with you on a remediation timeline based on severity.
4. Do not disclose the vulnerability publicly until a fix has been released and coordinated with you.

We do not have a formal bug bounty program at this time, but we will credit reporters in release notes unless you prefer anonymity.

---

## Security Model

x402Guard is a **non-custodial** proxy. It never holds private keys, funds, or signing authority. Its threat model is:

- **Non-custodial by design.** The proxy enforces spend limits and guardrails by intercepting x402 payment flows before they reach the agent. Keys remain with the agent operator.
- **Fail-closed on errors.** Any internal error, validation failure, or missing configuration causes the request to be denied. There is no fallback to permissive mode.
- **Defense in depth.** Multiple independent layers: API key authentication, row-level security in the database, ownership assertions in application logic, nonce tracking, and on-chain program checks.
- **Immutable audit log.** The audit table has no UPDATE or DELETE operations in application code, backed by a database trigger that prevents modification after insert.

---

## Completed Security Audit

An internal security audit was conducted on this codebase. Six CRITICAL vulnerabilities were identified and resolved before public release.

### CRITICAL-1: TOCTOU Race Condition in Daily Spend Tracking

**Description:** The daily spend check and update were two separate database operations. Concurrent requests from the same agent could both pass the limit check before either recorded its spend, allowing the limit to be exceeded.

**Fix:** Replaced the check-then-update pattern with a single atomic `INSERT ... ON CONFLICT ... DO UPDATE` statement (`record_spend_atomic()`). The limit check and increment now occur in one serialized database transaction.

---

### CRITICAL-2: Missing API Key Authentication on Management Routes

**Description:** The API key middleware was not applied to management routes (agent registration, guardrail rule creation, session key management). Any caller with network access could create or modify agent configurations.

**Fix:** Applied fail-closed API key middleware to all management routes. Requests without a valid `MANAGEMENT_API_KEY` are rejected with 401 before reaching any handler.

---

### CRITICAL-3: Dashboard IDOR — No Agent Ownership Check

**Description:** Dashboard server actions accepted an `agentId` parameter from the client and operated on that agent without verifying the authenticated user owned that agent. Any authenticated user could read or modify any other user's agent configuration.

**Fix:** Added `assertAgentOwnership(userId, agentId)` to all server actions that operate on agent resources. This function queries the database to confirm the agent belongs to the session user and throws before any operation if it does not.

---

### CRITICAL-4: No Row-Level Security on Supabase Tables

**Description:** All five Supabase tables (agents, guardrail_rules, session_keys, audit_logs, daily_spend) had RLS disabled. Any Supabase client with the anon or service key could read or write any row.

**Fix:** Enabled RLS on all five tables. Policies restrict row access to the owning user based on the authenticated JWT subject. The audit log and daily spend tables are additionally protected against client-side writes.

---

### CRITICAL-5: No USDC Mint Validation in Solana Program

**Description:** The Solana x402-guard program accepted any SPL token mint address as the payment token. An attacker could substitute a worthless token mint to pass payment validation while delivering no real value.

**Fix:** Hardcoded the canonical USDC mint addresses for Solana devnet and mainnet. The program rejects any payment instruction that does not reference one of these two known mints.

---

### CRITICAL-6: Incomplete Whitelist Check in Solana Program

**Description:** The on-chain whitelist check only verified the transaction authority, not the destination address. A whitelisted authority could route funds to any address, bypassing the intended destination restrictions.

**Fix:** The whitelist check now validates both the signing authority and the destination token account address. Both must appear in the whitelist entry for a transaction to be approved.

---

## Known Limitations

The following issues are documented as HIGH or MEDIUM severity. They are not believed to enable funds loss in current deployments but should be addressed before production use at scale.

**CORS hardening not complete for production.**
The current CORS configuration is permissive for development. Production deployments must restrict `Access-Control-Allow-Origin` to known frontend origins.

**Rate limiting not tuned for production load.**
Per-agent rate limits are implemented but the default thresholds have not been validated under production traffic patterns. Operators should tune these values for their expected load before deploying publicly.

**DNS rebinding protection not implemented.**
The proxy does not validate the `Host` header. A DNS rebinding attack could allow a compromised browser context to make requests to the proxy as if it were a local service. Mitigation: deploy behind a reverse proxy that enforces an allowlist of valid `Host` values.

**SIWE authentication flow not fully tested with real wallets.**
The Sign-In with Ethereum flow for the dashboard has been implemented but has known issues with chain switching and has not been validated against a broad set of wallet clients. The `DEV_SKIP_AUTH=true` environment variable is available for development but must never be set in production.

---

## Security Best Practices for Deployers

The following steps are required for a secure production deployment.

**Set a strong management API key.**
Generate a cryptographically random value for `MANAGEMENT_API_KEY`. All management endpoints require this key. Do not reuse keys across environments.

```
MANAGEMENT_API_KEY=$(openssl rand -hex 32)
```

**Set log level to warn or error.**
Do not run with `RUST_LOG=debug` or `RUST_LOG=trace` in production. These levels can log request bodies and internal state. Use `RUST_LOG=warn`.

**Enable RLS on all Supabase tables.**
Row-level security must be enabled before the service is exposed to external traffic. Confirm RLS status in the Supabase dashboard under Authentication > Policies for every table.

**Rotate API keys on schedule.**
Rotate `MANAGEMENT_API_KEY` and any Supabase service role keys at least every 90 days, or immediately if a key may have been exposed.

**Enforce HTTPS.**
The proxy and dashboard must be served over TLS only. Do not expose HTTP endpoints to the internet. Use a reverse proxy (nginx, Caddy, Cloudflare) to terminate TLS and enforce HTTPS redirects.

**Never set DEV_SKIP_AUTH in production.**
The `DEV_SKIP_AUTH=true` environment variable bypasses all wallet authentication. It must not be present in any production environment configuration.

**Validate USDC mint addresses.**
If deploying to a network other than mainnet or devnet, review the hardcoded mint addresses in the Solana program and update them to match the correct USDC deployment for that network.
