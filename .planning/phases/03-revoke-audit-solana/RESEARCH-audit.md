# Phase 3: Immutable Audit Log System - Research

**Researched:** 2026-02-28
**Domain:** PostgreSQL append-only audit logging, async Rust event pipelines, axum middleware integration
**Confidence:** HIGH (PostgreSQL patterns well-established; sqlx 0.8 and tokio channels are mature)

**Note on Sources:** WebSearch was unavailable. All findings are from training data (cutoff May 2025) cross-referenced against the existing codebase patterns (sqlx 0.8.6, axum 0.8, tokio 1.x). PostgreSQL audit log patterns are stable and well-documented. Tokio mpsc channels are a fundamental async primitive.

## Summary

The audit log system for x402Guard must capture every proxy request, guardrail violation, and session key lifecycle event in an immutable, append-only PostgreSQL table. The key architectural challenge is making audit writes **non-blocking** so they do not add latency to the proxy request hot path (NFR-1: p99 < 200ms).

The recommended approach uses three layers: (1) a PostgreSQL `audit_log` table with database-level immutability enforced via a `BEFORE UPDATE OR DELETE` trigger that raises an exception, (2) a `tokio::sync::mpsc` channel where the handler fires-and-forgets audit events to a background writer task, and (3) a `repo::audit_log` module following the existing repository pattern (`repo/spend_ledger.rs` as template). This architecture ensures zero additional latency on the proxy hot path while providing strong immutability guarantees at the database level.

**Primary recommendation:** Use a background `tokio::spawn` task consuming from an unbounded mpsc channel, with a PostgreSQL trigger enforcing immutability. Do NOT use axum middleware for audit logging -- use explicit calls at known control flow points in the handler to capture rich context (violation details, amounts, session key IDs).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FR-6.1 | Log every proxy request (agent, amount, target, timestamp, result) | Audit log table schema with `ProxyRequest` / `ProxyResponse` event types, JSONB metadata column for request-specific data |
| FR-6.2 | Log all guardrail violations | `GuardrailViolation` event type with structured metadata: rule_id, rule_type, rule_params, actual_value, limit_value |
| FR-6.3 | Log session key creation, usage, and revocation events | `SessionKeyCreated` / `SessionKeyUsed` / `SessionKeyRevoked` event types |
| FR-6.4 | Immutable append-only audit log | PostgreSQL trigger preventing UPDATE/DELETE, REVOKE UPDATE/DELETE from application role, `created_at` DEFAULT now() |
</phase_requirements>

## Standard Stack

### Core (already in workspace)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sqlx | 0.8.6 | PostgreSQL queries (runtime, not compile-time) | Already used for all DB access; runtime queries match existing pattern |
| tokio | 1.x | Async runtime, mpsc channels, spawn | Already the runtime; `tokio::sync::mpsc` is the standard async channel |
| serde / serde_json | 1.0.219 / 1.x | Event serialization, JSONB metadata | Already used throughout |
| chrono | 0.4 | Timestamps with timezone | Already used in all models |
| uuid | 1.x | Event IDs, foreign keys | Already used throughout |
| tracing | 0.1 | Structured logging for audit write failures | Already used throughout |

### No New Dependencies Required

The audit log system requires **zero new crates**. Everything needed is already in the workspace:
- `sqlx` for database writes
- `tokio::sync::mpsc` for the async channel (part of `tokio` with "full" features)
- `serde_json` for JSONB metadata serialization
- `chrono` for timestamps
- `uuid` for event IDs

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tokio mpsc channel | Direct INSERT in handler | Adds ~1-5ms latency per request; violates NFR-1 p99 target |
| tokio mpsc channel | Kafka/NATS event bus | Over-engineered; constraint says PostgreSQL only |
| JSONB metadata column | Separate columns per event type | Too many NULLable columns; JSONB is flexible and queryable |
| PostgreSQL trigger | Application-only enforcement | Can be bypassed via direct DB access; defense-in-depth requires DB-level protection |
| Unbounded channel | Bounded channel | Bounded risks backpressure blocking the handler; for audit logs, unbounded with monitoring is safer |

## Architecture Patterns

### Recommended Project Structure

```
proxy/src/
  models/
    audit_event.rs       # AuditEvent model, AuditEventType enum, AuditMetadata types
  repo/
    audit_log.rs         # insert_event(), query functions
  services/
    mod.rs               # pub mod audit_writer;
    audit_writer.rs      # AuditWriter: mpsc sender + background consumer task
  handlers/
    proxy.rs             # emit audit events at each control flow point
    session_keys.rs      # emit on create/revoke
  state.rs               # Add AuditWriter to AppState
  main.rs                # Spawn audit writer background task
proxy/migrations/
  002_create_audit_log.sql  # Table, trigger, indexes, REVOKE
```

### Pattern 1: Fire-and-Forget Audit Channel

**What:** A `tokio::sync::mpsc::UnboundedSender<AuditEvent>` held in `AppState`. Handlers send events without awaiting the DB write. A background task consumes events and inserts them.

**When to use:** When audit writes must not add latency to the hot path.

**Example:**

```rust
// services/audit_writer.rs

use tokio::sync::mpsc;
use sqlx::PgPool;
use crate::models::audit_event::AuditEvent;

#[derive(Clone)]
pub struct AuditWriter {
    tx: mpsc::UnboundedSender<AuditEvent>,
}

impl AuditWriter {
    /// Spawn the background writer and return the sender handle.
    pub fn spawn(pool: PgPool) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        tokio::spawn(Self::writer_loop(pool, rx));
        Self { tx }
    }

    /// Fire-and-forget: enqueue an audit event.
    /// Returns false if the channel is closed (writer crashed).
    pub fn emit(&self, event: AuditEvent) -> bool {
        self.tx.send(event).is_ok()
    }

    async fn writer_loop(
        pool: PgPool,
        mut rx: mpsc::UnboundedReceiver<AuditEvent>,
    ) {
        // Batch: collect up to 64 events or 10ms, whichever comes first
        let mut batch = Vec::with_capacity(64);

        loop {
            // Wait for at least one event
            match rx.recv().await {
                Some(event) => batch.push(event),
                None => break, // channel closed, exit
            }

            // Drain any additional available events (non-blocking)
            while batch.len() < 64 {
                match rx.try_recv() {
                    Ok(event) => batch.push(event),
                    Err(_) => break,
                }
            }

            // Batch insert
            if let Err(e) = crate::repo::audit_log::insert_batch(&pool, &batch).await {
                tracing::error!(
                    error = %e,
                    count = batch.len(),
                    "audit log batch insert failed — events lost"
                );
                // SECURITY: Log to stderr as fallback. In production,
                // consider a dead-letter queue or file-based fallback.
            }

            batch.clear();
        }

        tracing::warn!("audit writer loop exited — channel closed");
    }
}
```

### Pattern 2: Structured Audit Event Model

**What:** A single enum for all event types, with typed metadata per variant, serialized to JSONB.

**When to use:** When you need both type safety in Rust code and flexible querying in PostgreSQL.

**Example:**

```rust
// models/audit_event.rs

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// All audit event types in the system.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    // Proxy request lifecycle
    ProxyRequestReceived,
    ProxyRequestForwarded,
    ProxyRequestFailed,

    // Guardrail events
    GuardrailViolation,
    GuardrailsPassed,

    // Session key lifecycle
    SessionKeyCreated,
    SessionKeyUsed,
    SessionKeyRevoked,
    SessionKeyExpired,
    AllSessionKeysRevoked,

    // Agent lifecycle
    AgentCreated,
    AgentDeactivated,
}

impl AuditEventType {
    /// String representation for the TEXT column.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ProxyRequestReceived => "proxy_request_received",
            Self::ProxyRequestForwarded => "proxy_request_forwarded",
            Self::ProxyRequestFailed => "proxy_request_failed",
            Self::GuardrailViolation => "guardrail_violation",
            Self::GuardrailsPassed => "guardrails_passed",
            Self::SessionKeyCreated => "session_key_created",
            Self::SessionKeyUsed => "session_key_used",
            Self::SessionKeyRevoked => "session_key_revoked",
            Self::SessionKeyExpired => "session_key_expired",
            Self::AllSessionKeysRevoked => "all_session_keys_revoked",
            Self::AgentCreated => "agent_created",
            Self::AgentDeactivated => "agent_deactivated",
        }
    }
}

/// An immutable audit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub agent_id: Option<Uuid>,
    pub session_key_id: Option<Uuid>,
    pub event_type: AuditEventType,
    /// Structured metadata specific to the event type.
    /// Examples:
    ///   ProxyRequest: { "target_url": "...", "amount": 1000000, "nonce": "0x..." }
    ///   GuardrailViolation: { "rule_id": "...", "rule_type": "MaxSpendPerTx", "limit": 1000000, "actual": 2000000 }
    ///   SessionKeyCreated: { "public_key": "0x...", "max_spend": 5000000, "expires_at": "..." }
    pub metadata: serde_json::Value,
}
```

### Pattern 3: PostgreSQL Immutability Enforcement

**What:** Database-level trigger that raises an exception on any UPDATE or DELETE attempt, plus REVOKE of those privileges from the application role.

**When to use:** When append-only guarantee is a security requirement (Security Level 10).

**Example (migration):**

```sql
-- 002_create_audit_log.sql

-- Audit log: immutable, append-only.
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    session_key_id UUID REFERENCES session_keys(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IMMUTABILITY: Prevent any UPDATE or DELETE at the database level.
-- This trigger fires BEFORE the operation and raises an exception,
-- making it impossible for ANY client (including superusers in the trigger context)
-- to modify or delete audit records.
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is immutable: % operations are not allowed',
        TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION audit_log_immutable();

-- Query indexes: agent + time range is the primary query pattern (FR-6.5).
CREATE INDEX idx_audit_log_agent_time
    ON audit_log (agent_id, created_at DESC);

-- Event type filtering (for dashboard: "show me all violations").
CREATE INDEX idx_audit_log_event_type_time
    ON audit_log (event_type, created_at DESC);

-- Session key event lookup.
CREATE INDEX idx_audit_log_session_key
    ON audit_log (session_key_id, created_at DESC)
    WHERE session_key_id IS NOT NULL;

-- SECURITY: If using a separate application DB role, also REVOKE:
-- REVOKE UPDATE, DELETE ON audit_log FROM app_role;
-- This is defense-in-depth on top of the trigger.

-- Optional: Add a CHECK constraint on event_type for data integrity.
-- (Not strictly necessary since Rust enum serialization guarantees valid values,
-- but adds DB-level protection against direct SQL inserts with typos.)
ALTER TABLE audit_log ADD CONSTRAINT chk_audit_event_type CHECK (
    event_type IN (
        'proxy_request_received',
        'proxy_request_forwarded',
        'proxy_request_failed',
        'guardrail_violation',
        'guardrails_passed',
        'session_key_created',
        'session_key_used',
        'session_key_revoked',
        'session_key_expired',
        'all_session_keys_revoked',
        'agent_created',
        'agent_deactivated'
    )
);
```

### Pattern 4: Batch INSERT for Throughput

**What:** Use a single INSERT with multiple VALUES rows rather than individual INSERTs per event.

**When to use:** When the background writer processes batches of events.

**Example:**

```rust
// repo/audit_log.rs

use anyhow::Result;
use sqlx::PgPool;
use crate::models::audit_event::AuditEvent;

/// Insert a single audit event.
pub async fn insert_event(pool: &PgPool, event: &AuditEvent) -> Result<()> {
    sqlx::query(
        "INSERT INTO audit_log (agent_id, session_key_id, event_type, metadata) \
         VALUES ($1, $2, $3, $4)"
    )
    .bind(event.agent_id)
    .bind(event.session_key_id)
    .bind(event.event_type.as_str())
    .bind(&event.metadata)
    .execute(pool)
    .await?;
    Ok(())
}

/// Batch insert audit events using a single query with multiple rows.
/// Falls back to individual inserts if batch building fails.
pub async fn insert_batch(pool: &PgPool, events: &[AuditEvent]) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }
    if events.len() == 1 {
        return insert_event(pool, &events[0]).await;
    }

    // Build a dynamic multi-row INSERT.
    // sqlx doesn't have a built-in batch VALUES builder, so we construct it manually.
    // Each event contributes 4 bind parameters ($1..$4, $5..$8, etc.)
    let mut query_str = String::from(
        "INSERT INTO audit_log (agent_id, session_key_id, event_type, metadata) VALUES "
    );
    let mut args = sqlx::postgres::PgArguments::default();

    for (i, event) in events.iter().enumerate() {
        let offset = i * 4;
        if i > 0 {
            query_str.push_str(", ");
        }
        query_str.push_str(&format!(
            "(${}, ${}, ${}, ${})",
            offset + 1, offset + 2, offset + 3, offset + 4
        ));

        use sqlx::Arguments;
        args.add(event.agent_id)?;
        args.add(event.session_key_id)?;
        args.add(event.event_type.as_str())?;
        args.add(&event.metadata)?;
    }

    sqlx::query_with(&query_str, args)
        .execute(pool)
        .await?;
    Ok(())
}
```

**NOTE:** The dynamic batch approach with `PgArguments` may need adjustment. An alternative is to use UNNEST arrays (see "Code Examples" section). If the batch builder proves complex, falling back to sequential single-inserts within a transaction is acceptable for the initial implementation -- the background task already decouples from the hot path.

### Anti-Patterns to Avoid

- **Audit writes in the handler await chain:** Never `audit_repo::insert(&pool, event).await` in the proxy handler. This adds database latency to every request. Use the fire-and-forget channel.
- **Axum middleware for audit logging:** Middleware cannot access the parsed request body, agent_id, or violation details. Audit events must be emitted at specific points in the handler logic where context is available.
- **Mutable audit records:** Never add UPDATE endpoints for audit_log. The trigger prevents it at DB level, but do not even expose the concept in the API.
- **Audit log as authorization data:** Do NOT read from audit_log to make authorization decisions. It is a record of what happened, not a source of truth for what is allowed. Use `spend_ledger`, `session_keys`, etc. for that.
- **Storing secrets in metadata:** Never include raw session key private keys, API keys, or full payment signatures in audit metadata. Include identifiers (public key, tx nonce) not secrets.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Immutability enforcement | Application-level "don't call UPDATE" | PostgreSQL BEFORE trigger + REVOKE | DB-level enforcement cannot be bypassed by application bugs; Security Level 10 demands defense-in-depth |
| Async write pipeline | Custom thread pool or std channels | `tokio::sync::mpsc::unbounded_channel` | Tokio channels integrate with the runtime scheduler; no context-switching overhead |
| Event ID generation | Custom snowflake/sequence | `gen_random_uuid()` (PostgreSQL) | UUIDv4 is standard; generated server-side for consistency |
| Timestamp generation | `chrono::Utc::now()` in Rust | `DEFAULT now()` in PostgreSQL | DB-generated timestamps are consistent even under clock skew between proxy instances |
| JSON metadata serialization | Custom binary format | `serde_json::Value` + PostgreSQL JSONB | JSONB is indexed, queryable with `->`, `->>`, `@>` operators; no custom parser needed |
| Batch INSERT builder | Custom SQL string building | Single-insert-in-loop within background task (initial impl) | Premature optimization; batch inserts can be added in Phase 4 if throughput demands it |

**Key insight:** The audit log's immutability guarantee MUST be at the database level because Security Level 10 means we assume application code may have bugs. A trigger cannot be bypassed by a SQL injection or ORM misconfiguration.

## Common Pitfalls

### Pitfall 1: Channel Backpressure Causing Handler Blocking

**What goes wrong:** Using a bounded channel causes `.send()` to block when the channel is full (e.g., DB is slow), which adds latency to the proxy handler.
**Why it happens:** Bounded channels are the "safe" default, but for audit logging, dropping the handler's latency guarantee is worse than potentially using more memory.
**How to avoid:** Use `mpsc::unbounded_channel()`. Monitor channel depth with a periodic metric. If depth exceeds a threshold (e.g., 10,000), log a warning. In extreme cases, the background task's batch processing will catch up.
**Warning signs:** Proxy p99 latency spikes correlated with database slowness.

### Pitfall 2: Losing Audit Events on Shutdown

**What goes wrong:** `tokio::spawn` tasks are cancelled on runtime shutdown. Events still in the channel are lost.
**Why it happens:** The default `axum::serve` + Ctrl+C does not drain background tasks.
**How to avoid:** Implement graceful shutdown: close the sender side, then await the receiver task to drain remaining events. Use `tokio::signal` for shutdown notification.
**Warning signs:** Missing audit events for the last few requests before a restart.

```rust
// In main.rs, on shutdown signal:
// 1. Drop the AuditWriter (closes the sender)
// 2. Await the writer task handle to drain remaining events
// 3. Then shut down the HTTP server
```

### Pitfall 3: JSONB Metadata Schema Drift

**What goes wrong:** Over time, different code paths emit different metadata shapes for the same event type, making queries unreliable.
**Why it happens:** JSONB is schema-less; there is no compile-time check that metadata matches the event type.
**How to avoid:** Define typed metadata builder functions for each event type. Never construct raw `serde_json::json!({})` at the call site. Use helper functions like `AuditEvent::proxy_request(agent_id, target_url, amount, nonce)`.
**Warning signs:** Dashboard queries returning NULL for expected fields.

### Pitfall 4: Foreign Key ON DELETE Behavior

**What goes wrong:** If an agent is deleted, audit records referencing that agent lose their `agent_id` (SET NULL) or the DELETE is blocked (RESTRICT).
**Why it happens:** The FK relationship between `audit_log.agent_id` and `agents.id` needs careful consideration.
**How to avoid:** Use `ON DELETE SET NULL`. Audit records should survive agent deletion -- they are historical records. The agent_id becomes NULL but the metadata still contains the agent's name/address for forensic purposes.
**Warning signs:** CASCADE deleting audit records (catastrophic data loss).

### Pitfall 5: Index Bloat on High-Volume Tables

**What goes wrong:** With thousands of inserts per hour, B-tree indexes grow large and slow down inserts.
**Why it happens:** Every INSERT updates every index on the table.
**How to avoid:** (a) Use only the indexes you need for actual query patterns. (b) Consider table partitioning by month (`PARTITION BY RANGE (created_at)`) if volume exceeds ~10M rows/month. (c) For Phase 3, start without partitioning; add it in Phase 4 when dashboard query patterns are concrete.
**Warning signs:** INSERT latency increasing over time in the background task.

### Pitfall 6: Trigger Bypass via Superuser

**What goes wrong:** PostgreSQL superusers CAN disable triggers (`ALTER TABLE ... DISABLE TRIGGER`).
**Why it happens:** Triggers are not a cryptographic guarantee; they are an administrative control.
**How to avoid:** (a) The application DB role should NOT be a superuser. (b) In production, use Supabase's managed roles which prevent trigger manipulation. (c) Document that disabling the trigger is a security incident. (d) As a secondary defense, `REVOKE UPDATE, DELETE ON audit_log FROM <app_role>`.
**Warning signs:** N/A -- this is a deployment configuration concern, not a runtime issue.

## Code Examples

### Emitting Audit Events from the Proxy Handler

```rust
// In handlers/proxy.rs — after guardrails evaluation:

// Guardrails violation — log it
if let Err(e) = guardrails::evaluate(&rules, &verified, &requirements, daily_spent) {
    state.audit.emit(AuditEvent {
        agent_id: Some(aid),
        session_key_id,
        event_type: AuditEventType::GuardrailViolation,
        metadata: serde_json::json!({
            "target_url": req.target_url,
            "amount": payment_amount,
            "error": e.to_string(),
            // Include which rule triggered the violation:
            "rules_evaluated": rules.len(),
        }),
    });
    return Err(e);
}

// Successful proxy forward — log it
state.audit.emit(AuditEvent {
    agent_id,
    session_key_id,
    event_type: AuditEventType::ProxyRequestForwarded,
    metadata: serde_json::json!({
        "target_url": req.target_url,
        "amount": payment_amount,
        "nonce": nonce_hex,
        "upstream_status": status.as_u16(),
    }),
});
```

### Adding AuditWriter to AppState

```rust
// state.rs
use crate::services::audit_writer::AuditWriter;

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub redis: redis::Client,
    pub http_client: reqwest::Client,
    pub db: PgPool,
    pub audit: AuditWriter, // NEW
}
```

### Spawning the Audit Writer in main.rs

```rust
// In main.rs, after DB pool is created:
let audit = AuditWriter::spawn(db.clone());

let app_state = state::AppState {
    config: config.clone(),
    redis,
    http_client,
    db,
    audit, // NEW
};
```

### Session Key Event Logging

```rust
// In handlers/session_keys.rs — after successful create:
state.audit.emit(AuditEvent {
    agent_id: Some(agent_id),
    session_key_id: Some(session_key.id),
    event_type: AuditEventType::SessionKeyCreated,
    metadata: serde_json::json!({
        "public_key": session_key.public_key,
        "max_spend": session_key.max_spend,
        "allowed_contracts": session_key.allowed_contracts,
        "expires_at": session_key.expires_at.to_rfc3339(),
    }),
});

// In handlers/session_keys.rs — after successful revoke:
state.audit.emit(AuditEvent {
    agent_id: Some(agent_id),
    session_key_id: Some(key_id),
    event_type: AuditEventType::SessionKeyRevoked,
    metadata: serde_json::json!({
        "revoked_by": "api", // or "dashboard" in Phase 4
    }),
});
```

### Query Helpers for Phase 4 Dashboard

```rust
// repo/audit_log.rs — query functions (for FR-6.5, Phase 4)

pub async fn find_by_agent(
    pool: &PgPool,
    agent_id: Uuid,
    limit: i64,
    offset: i64,
) -> Result<Vec<AuditLogRow>> {
    let rows: Vec<AuditLogRow> = sqlx::query_as(
        "SELECT id, agent_id, session_key_id, event_type, metadata, created_at \
         FROM audit_log WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3"
    )
    .bind(agent_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn find_by_agent_and_type(
    pool: &PgPool,
    agent_id: Uuid,
    event_type: &str,
    since: DateTime<Utc>,
    limit: i64,
) -> Result<Vec<AuditLogRow>> {
    let rows: Vec<AuditLogRow> = sqlx::query_as(
        "SELECT id, agent_id, session_key_id, event_type, metadata, created_at \
         FROM audit_log WHERE agent_id = $1 AND event_type = $2 AND created_at >= $3 \
         ORDER BY created_at DESC LIMIT $4"
    )
    .bind(agent_id)
    .bind(event_type)
    .bind(since)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
```

## Design Decisions

### JSONB Metadata vs. Separate Columns

**Decision: Use JSONB.**

Rationale:
1. Event types have vastly different metadata shapes (proxy request has target_url + amount; guardrail violation has rule_id + rule_type + limit + actual; session key has public_key + max_spend + expires_at).
2. Adding a column per field would create a wide table with mostly NULL columns.
3. JSONB is indexable in PostgreSQL (`CREATE INDEX ON audit_log USING GIN (metadata)` if needed).
4. The existing codebase already uses JSONB for `guardrail_rules.rule_params` and `session_keys.allowed_contracts`.
5. Metadata schema is enforced at the Rust level via typed builder functions.

### Single Table vs. Separate Tables per Event Type

**Decision: Single `audit_log` table.**

Rationale:
1. All events share the same immutability constraint and query patterns (by agent + time).
2. A single table simplifies the immutability trigger (one trigger instead of N).
3. The `event_type` column + index provides efficient type-based filtering.
4. Phase 4 dashboard needs to show a unified timeline view across all event types.
5. Table partitioning by time range (if needed later) works cleanly on a single table.

### Unbounded vs. Bounded Channel

**Decision: Unbounded channel with monitoring.**

Rationale:
1. Bounded channels can cause handler blocking (unacceptable for NFR-1 p99 < 200ms).
2. Audit events are small (~200-500 bytes each). Even 10,000 queued events = ~5MB.
3. If the background writer falls behind, the channel grows but the handler stays fast.
4. Add a periodic metric logging channel depth for observability.
5. In the catastrophic case (DB down for minutes), the proxy should keep serving; losing some audit events is better than blocking all requests.

### LISTEN/NOTIFY for Real-Time Dashboard

**Decision: Defer to Phase 4.**

Rationale:
1. LISTEN/NOTIFY is a good fit for real-time dashboard updates (new audit events push to connected clients).
2. But Phase 3 scope is insert-only. Phase 4 is when the dashboard consumes these events.
3. Adding NOTIFY in the INSERT trigger now is low-cost but adds no value until Phase 4.
4. **Recommendation:** Do NOT add NOTIFY in Phase 3. Add it in Phase 4 when the consumer exists. This avoids wasted notification overhead.

### Retention / Archival Strategy

**Decision: Defer partitioning; implement soft time-based cleanup later.**

For Phase 3:
- No automatic deletion or archival. All events are retained.
- This is appropriate for an early-stage system with low volume.

For production (Phase 4+):
- Add table partitioning by month: `PARTITION BY RANGE (created_at)`.
- Old partitions can be detached and archived to cold storage without affecting query performance on recent data.
- Never DELETE from audit_log (the trigger prevents it anyway).
- Detaching partitions is the standard PostgreSQL archival pattern.

## Integration Points in Existing Code

### Where to Emit Events

| Location | Event Types | Notes |
|----------|-------------|-------|
| `handlers/proxy.rs` after input validation | `ProxyRequestReceived` | Log even if request later fails validation |
| `handlers/proxy.rs` after guardrails fail | `GuardrailViolation` | Include rule details in metadata |
| `handlers/proxy.rs` after guardrails pass | `GuardrailsPassed` | Optional; can be noisy. Consider omitting for high-volume deployments |
| `handlers/proxy.rs` after forward completes | `ProxyRequestForwarded` or `ProxyRequestFailed` | Based on upstream response status |
| `handlers/session_keys.rs` after create | `SessionKeyCreated` | Include key details (not private material) |
| `handlers/session_keys.rs` after revoke | `SessionKeyRevoked` | Include who/what triggered revocation |
| `handlers/session_keys.rs` after revoke_all | `AllSessionKeysRevoked` | Phase 3 revoke-all feature |
| `handlers/agents.rs` after create | `AgentCreated` | Include agent name and owner address |

### Changes Required to Existing Files

| File | Change | Scope |
|------|--------|-------|
| `state.rs` | Add `audit: AuditWriter` field | 1 line |
| `main.rs` | Spawn `AuditWriter`, pass to `AppState` | 2 lines |
| `handlers/proxy.rs` | Add `state.audit.emit(...)` at 3-4 points | ~20 lines |
| `handlers/session_keys.rs` | Add `state.audit.emit(...)` on create/revoke | ~15 lines |
| `handlers/agents.rs` | Add `state.audit.emit(...)` on create | ~5 lines |
| `models/mod.rs` | Add `pub mod audit_event;` | 1 line |
| `repo/mod.rs` | Add `pub mod audit_log;` | 1 line |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate audit DB (event sourcing) | Append-only table in same DB | N/A (PostgreSQL pattern) | Simpler deployment, transactional consistency |
| Application-level "never call UPDATE" | DB trigger + REVOKE | N/A (always best practice) | Cannot be bypassed by application bugs |
| Sync INSERT in handler | Async channel + background writer | Tokio 1.0+ (2020) | Zero latency impact on hot path |
| One INSERT per event | Batch INSERT in background task | Standard optimization | Reduces round trips; ~5-10x throughput improvement |

## Open Questions

1. **Should `GuardrailsPassed` be a separate event?**
   - What we know: Logging every successful guardrail check creates high-volume, low-value events.
   - What's unclear: Whether the dashboard in Phase 4 needs to show "guardrails passed" events or just "violations".
   - Recommendation: **Omit `GuardrailsPassed` in Phase 3.** The `ProxyRequestForwarded` event implicitly means guardrails passed. Add it later if the dashboard needs it.

2. **Should the audit writer use transactions for batches?**
   - What we know: A multi-row INSERT is atomic by default (all or nothing). No explicit transaction needed.
   - What's unclear: Whether partial failures within a batch should be retried individually.
   - Recommendation: Use a single INSERT statement (which is atomic). If it fails, log the error and continue. Do NOT retry -- audit log writes should not block the pipeline.

3. **What happens if the background writer panics?**
   - What we know: `tokio::spawn` catches panics; the JoinHandle returns `Err(JoinError)`.
   - What's unclear: Should the proxy continue serving without audit logging, or should it shut down?
   - Recommendation: **Continue serving.** Log a CRITICAL error. The proxy's primary job is payment forwarding; audit logging is important but not worth stopping the service. In Phase 4, add a health check that reports degraded status if the audit writer is down.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `proxy/src/repo/spend_ledger.rs` -- pattern for sqlx runtime queries with PgPool
- Existing codebase: `proxy/src/state.rs` -- AppState pattern for shared state
- Existing codebase: `proxy/migrations/001_create_tables.sql` -- migration pattern, JSONB usage
- Existing codebase: `proxy/src/handlers/proxy.rs` -- control flow points for audit emission
- PostgreSQL documentation: CREATE TRIGGER, BEFORE trigger functions (stable, well-documented feature)
- PostgreSQL documentation: JSONB type, GIN indexes (stable since PostgreSQL 9.4+)
- tokio documentation: `tokio::sync::mpsc` unbounded channels (stable since tokio 1.0)

### Secondary (MEDIUM confidence)
- PostgreSQL LISTEN/NOTIFY for real-time notifications (well-established but deferred to Phase 4)
- Table partitioning by RANGE (available since PostgreSQL 10; deferred to when volume demands it)

### Tertiary (LOW confidence)
- Dynamic batch INSERT with `PgArguments` -- API may need adjustment for sqlx 0.8.6 (verify at implementation time)
- Graceful shutdown pattern for background tasks -- may need `tokio::signal` integration testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies; all patterns match existing codebase
- Architecture (channel + background writer): HIGH -- standard tokio pattern, well-documented
- Immutability (trigger + REVOKE): HIGH -- PostgreSQL triggers are a 20+ year stable feature
- Batch INSERT implementation: MEDIUM -- sqlx dynamic query building needs implementation-time verification
- Pitfalls: HIGH -- based on well-known PostgreSQL and async Rust patterns

**Research date:** 2026-02-28
**Valid until:** 2026-04-28 (stable patterns; no rapidly moving parts)
