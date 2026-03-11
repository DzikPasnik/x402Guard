# Lessons Learned

## 2026-02-27: Talk vs Action Loop
- **Problem**: Spent 4 prompts saying "I'll call ExitPlanMode" without calling it
- **Rule**: NEVER describe what you'll do next. Just DO IT. Tool call first, explanation second.
- **Rule**: If you say you'll call a tool, the SAME message must contain that tool call.
- **Rule**: "No response requested" is NEVER acceptable when there's pending work.
- **Rule**: After writing a plan file, call ExitPlanMode IMMEDIATELY in the SAME message. No separate message.
- **Rule**: If in plan mode and plan is ready, the ONLY valid next action is ExitPlanMode tool call. Nothing else.

## 2026-03-10: PostgreSQL SUM(BIGINT) returns NUMERIC
- **Problem**: `SUM(amount)` where `amount BIGINT` returns PostgreSQL `NUMERIC` type, not BIGINT. sqlx decodes as `(i64,)` → "mismatched type" error at runtime.
- **Root cause**: PostgreSQL promotes SUM(BIGINT) to NUMERIC to prevent overflow on aggregation.
- **Fix**: Always cast: `SELECT COALESCE(SUM(amount), 0)::BIGINT FROM ...`
- **Rule**: When using sqlx with aggregate functions (SUM, AVG, COUNT) on BIGINT columns, ALWAYS add `::BIGINT` cast.
- **Rule**: Test aggregate queries against a real Postgres (not just unit tests with mocked data).

## 2026-03-10: AllowedContracts guardrail checks pay_to, not asset
- **Problem**: Test whitelisted USDC contract address, but guardrails engine checks `requirements.pay_to` (the service wallet), not the asset mint.
- **Root cause**: `check_allowed_contracts` falls back to `requirements.pay_to` when no `contract` in `extra`.
- **Fix**: Whitelist must include SERVICE_WALLET address (the payment recipient).
- **Rule**: Read the actual guardrail implementation before writing test assertions.

## 2026-03-10: Railway 500 debugging — add tracing BEFORE map_err
- **Problem**: `AppError::Internal` swallows errors for security (generic "internal server error"). No logs → impossible to diagnose.
- **Fix**: Add `tracing::error!` with actual error message BEFORE `.map_err(AppError::Internal)?`.
- **Rule**: Every `.map_err(AppError::Internal)?` MUST be preceded by a `tracing::error!` log. Security-safe error masking requires server-side logging.

## 2026-03-10: Railway build queue can stall — don't trust "Waiting for build" UI
- **Problem**: Railway deploy showed "Initializing - Waiting for build to start..." for 15+ minutes. The UI was stale — the build was actually running but the status label didn't update.
- **Fix**: Removed stuck deploy, pushed empty commit to trigger fresh build. Fresh build completed in ~2 minutes.
- **Rule**: If Railway shows "Waiting for build to start" for >5 min, check Build Logs tab (it may already be building). If truly stuck, remove the deploy and push a new commit.
- **Rule**: Don't confuse "deploy not yet active" with "code not deployed". My curl test hit old code (signature validation failed before reaching the bug) — the 401 response was misleading because it never reached the fixed code path.

## 2026-03-10: Dummy signatures bypass later code paths — test what you intend
- **Problem**: Curl test with dummy signature (0x00...00) got 401 "signature recovery failed" instead of 500. Concluded the fix was deployed when it wasn't.
- **Root cause**: The proxy verifies EIP-3009 signatures BEFORE evaluating guardrails. Dummy signature fails at step 5, never reaching step 7 (where the BIGINT bug lives).
- **Rule**: When testing a fix, ensure the test payload reaches the code path being fixed. Use the actual test script, not a simplified curl.
