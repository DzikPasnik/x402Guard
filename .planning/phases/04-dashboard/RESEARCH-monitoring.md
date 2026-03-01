# Phase 4: Audit Log Viewer and Spend Monitoring - Research

**Researched:** 2026-03-01
**Domain:** Next.js 16 + Supabase JS 2.97 + shadcn/ui (new-york style) + Radix UI + Tailwind CSS 4
**Confidence:** HIGH (verified against installed packages in `dashboard/node_modules/`)

---

## Summary

The x402Guard dashboard needs two interactive features built on the existing Next.js 16 + Supabase stack:
**audit log viewer** (FR-6.5, FR-7.3) and **real-time spend monitoring with alerts** (FR-7.2, FR-7.8).

The project already has `@supabase/supabase-js@2.97.0`, `radix-ui@1.4.3` (which includes Popover, Select,
Toast, Progress, Dropdown, Checkbox), and the `shadcn` CLI. No charting library is installed; one needs
to be added. All Supabase query builders (`gte`, `lte`, `in`, `order`, `range`) and Realtime
(`channel().on('postgres_changes', ...)`) are confirmed present in the installed package types.

The key design choices are: cursor-based pagination on `audit_log` (append-only, no offset drift),
client-side Supabase Realtime subscription on `spend_ledger` for real-time spend updates, and a
**pure CSS progress bar** (using Radix `@radix-ui/react-progress` already installed) plus Tailwind
color classes for the spend alert indicator. No charting library is required for the MVP threshold
indicator — add Recharts only if a spend-over-time mini-chart is desired.

**Primary recommendation:** Use Supabase client-side filtering with cursor pagination for audit log,
Supabase Realtime for spend ledger inserts, `@radix-ui/react-progress` for spend bars, and
install `recharts@2.x` only if time-series mini-charts are in scope.

---

## Standard Stack

### Core (already installed — verified from node_modules)

| Library | Version | Purpose | Confirmed |
|---------|---------|---------|-----------|
| `@supabase/supabase-js` | 2.97.0 | DB queries + Realtime subscriptions | `node_modules/@supabase/supabase-js/package.json` |
| `@supabase/postgrest-js` | 2.97.0 | Query builder: `.gte()`, `.lte()`, `.in()`, `.order()`, `.range()` | Type file confirms all methods |
| `@supabase/realtime-js` | bundled | Realtime: `channel().on('postgres_changes', ...)` | Channel type confirms INSERT filter |
| `radix-ui` | 1.4.3 | UI primitives (Popover, Select, Toast, Progress, Checkbox) | `radix-ui/src/index.ts` confirms exports |
| `@radix-ui/react-progress` | 1.1.7 | Spend bar progress indicator | `node_modules/@radix-ui/react-progress/package.json` |
| `@radix-ui/react-toast` | 1.2.15 | Alert toasts when spend > 80% | `node_modules/@radix-ui/react-toast/package.json` |
| `@radix-ui/react-select` | installed | Event type multi-select filter | confirmed in `node_modules/@radix-ui/` |
| `@radix-ui/react-popover` | installed | Date range picker trigger | confirmed |
| `@radix-ui/react-checkbox` | installed | Multi-select checkboxes in filters | confirmed |
| `lucide-react` | 0.575.0 | Icons (AlertTriangle, Filter, Clock, etc.) | confirmed |
| `class-variance-authority` | 0.7.1 | Badge variants for spend status | confirmed |
| `zod` | 4.3.6 | Query param validation | confirmed |

### Needs Installation

| Library | Recommended Version | Purpose | Why |
|---------|---------------------|---------|-----|
| `recharts` | `^2.15` | Spend-over-time mini-charts (optional) | Only if FR-7.2 requires time-series chart |
| `date-fns` | `^3.6` | Date formatting + range calculation | No date utility installed; used by shadcn Calendar component |
| `react-day-picker` | `^8.10` | shadcn Calendar (date range picker) | shadcn Calendar component peer dep |

> **Note:** If mini-charts are deferred, only `date-fns` + `react-day-picker` are strictly needed
> for the date range picker. Recharts is only for the optional time-series spend chart.

**Installation:**
```bash
# Minimal (audit log + spend monitoring without charts)
npm install date-fns react-day-picker

# Full (with optional spend-over-time chart)
npm install date-fns react-day-picker recharts
```

### Alternatives Considered

| Standard | Alternative | Tradeoff |
|----------|-------------|----------|
| Recharts | Chart.js | Chart.js has no tree-shaking; Recharts is React-native, SSR-safe with `"use client"` |
| Recharts | shadcn Charts (built on Recharts) | shadcn Charts = thin wrapper over Recharts — install shadcn chart component instead of raw Recharts if using shadcn CLI |
| `react-day-picker` | `@radix-ui/react-calendar` | Radix has no calendar primitive; shadcn Calendar uses react-day-picker |
| Supabase Realtime | SWR polling | Realtime is already included in supabase-js; polling adds complexity with no benefit |
| Cursor pagination | Offset pagination | Offset drifts on append-only tables as new rows arrive mid-page; cursor is stable |

---

## Architecture Patterns

### Recommended Project Structure

```
dashboard/src/
├── app/
│   ├── agents/
│   │   └── [id]/
│   │       ├── page.tsx              # Agent detail — spend + audit for one agent
│   │       └── audit/
│   │           └── page.tsx          # Full audit log for agent
│   ├── audit/
│   │   └── page.tsx                  # Global audit log viewer (all agents)
│   └── monitoring/
│       └── page.tsx                  # Spend monitoring overview
├── components/
│   ├── audit/
│   │   ├── AuditLogTable.tsx         # Table with rows + metadata expansion
│   │   ├── AuditLogFilters.tsx       # Agent, event type, date range filters
│   │   ├── AuditCursorPaginator.tsx  # Prev/next cursor buttons
│   │   ├── EventTypeBadge.tsx        # Color-coded badge per event type
│   │   └── MetadataViewer.tsx        # JSON metadata display
│   ├── spend/
│   │   ├── AgentSpendCard.tsx        # Per-agent card: bar + amount + alert
│   │   ├── SpendProgressBar.tsx      # Radix Progress with color coding
│   │   ├── SpendAlertBadge.tsx       # Badge: green/yellow/red based on %
│   │   └── SpendRealtimeProvider.tsx # Client component: Realtime subscription
│   └── ui/
│       ├── (existing: alert, badge, button, card, input, table)
│       ├── progress.tsx              # shadcn Progress (wraps @radix-ui/react-progress)
│       ├── toast.tsx                 # shadcn Toast
│       ├── select.tsx                # shadcn Select (event type filter)
│       ├── popover.tsx               # shadcn Popover (date picker wrapper)
│       └── calendar.tsx             # shadcn Calendar (react-day-picker based)
├── lib/
│   ├── supabase.ts                   # (existing) createClient
│   ├── supabase-server.ts            # Server-side client (for RSC)
│   ├── audit-queries.ts              # Typed query functions for audit_log
│   ├── spend-queries.ts              # Typed query functions for spend_ledger
│   └── format.ts                    # USDC amount formatting (bigint / 1_000_000)
└── hooks/
    ├── useAuditLog.ts               # Client hook: fetch + paginate audit log
    └── useSpendRealtime.ts          # Client hook: Realtime spend_ledger subscription
```

---

## Pattern 1: Audit Log Client-Side Filtering (Supabase postgrest-js)

**What:** All filter params passed as PostgREST query modifiers on `supabase.from('audit_log')`.
**When to use:** For datasets < 100k rows where index-backed queries are fast enough without stored procedures.

```typescript
// Source: @supabase/postgrest-js 2.97.0 dist/index.d.mts — confirmed types
// File: dashboard/src/lib/audit-queries.ts

import { supabase } from './supabase'

export type AuditEventType =
  | 'proxy_request_received'
  | 'proxy_request_forwarded'
  | 'proxy_request_failed'
  | 'guardrail_violation'
  | 'session_key_created'
  | 'session_key_used'
  | 'session_key_revoked'
  | 'all_session_keys_revoked'
  | 'agent_created'
  | 'agent_deactivated'
  | 'solana_vault_queried'
  | 'solana_withdraw_submitted'
  | 'solana_withdraw_confirmed'
  | 'solana_withdraw_failed'

export interface AuditLogFilters {
  agentId?: string
  eventTypes?: AuditEventType[]
  fromDate?: string    // ISO 8601 e.g. "2026-03-01T00:00:00Z"
  toDate?: string
  cursorId?: string    // UUID of last row seen (for cursor pagination)
  pageSize?: number    // default 50
}

export interface AuditRow {
  id: string
  agent_id: string | null
  session_key_id: string | null
  event_type: AuditEventType
  metadata: Record<string, unknown>
  created_at: string
}

export async function fetchAuditLog(filters: AuditLogFilters): Promise<AuditRow[]> {
  const { agentId, eventTypes, fromDate, toDate, cursorId, pageSize = 50 } = filters

  // Start with base query
  let query = supabase
    .from('audit_log')
    .select('id, agent_id, session_key_id, event_type, metadata, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })   // tie-break for stable cursor
    .limit(pageSize + 1)                 // fetch one extra to detect hasMore

  // Agent filter — uses idx_audit_log_agent_time
  if (agentId) {
    query = query.eq('agent_id', agentId)
  }

  // Event type multi-select — uses idx_audit_log_event_type_time when single type
  if (eventTypes && eventTypes.length > 0) {
    query = query.in('event_type', eventTypes)
  }

  // Date range — combined with agent index
  if (fromDate) {
    query = query.gte('created_at', fromDate)
  }
  if (toDate) {
    query = query.lte('created_at', toDate)
  }

  // Cursor-based pagination: filter rows "older than" the cursor row
  // Uses composite (created_at DESC, id DESC) ordering
  if (cursorId) {
    // Step 1: fetch the cursor row's created_at
    const { data: cursorRow } = await supabase
      .from('audit_log')
      .select('created_at')
      .eq('id', cursorId)
      .single()

    if (cursorRow) {
      // Step 2: rows with created_at < cursor, OR same timestamp with id < cursor
      query = query.or(
        `created_at.lt.${cursorRow.created_at},` +
        `and(created_at.eq.${cursorRow.created_at},id.lt.${cursorId})`
      )
    }
  }

  const { data, error } = await query
  if (error) throw new Error(`Audit log query failed: ${error.message}`)
  return (data ?? []) as AuditRow[]
}
```

**Cursor pagination notes:**
- The `created_at + id` composite cursor is stable even when new rows arrive (unlike offset).
- The `+ 1` extra row trick lets the caller detect `hasNextPage` without a separate COUNT query.
- `COUNT(*)` on large append-only tables is slow (no row estimate without vacuum stats); avoid it.

---

## Pattern 2: Spend Aggregation SQL (via Supabase RPC)

**What:** PostgreSQL function exposed as Supabase RPC to compute rolling 24h spend per agent.
**Why RPC:** Aggregation with `NOW() - INTERVAL '24 hours'` cannot be expressed via PostgREST filter
alone and requires a server-side function. This avoids pulling all ledger rows to the client.

```sql
-- Add to a new migration: 004_spend_aggregation_rpc.sql
-- Returns current 24h spend and limit for each agent belonging to owner_address.

CREATE OR REPLACE FUNCTION get_agent_spend_summary(p_owner_address TEXT)
RETURNS TABLE (
    agent_id        UUID,
    agent_name      TEXT,
    is_active       BOOLEAN,
    spend_24h       BIGINT,
    max_spend_rule  BIGINT,   -- from guardrail_rules WHERE rule_type = 'MaxSpendPerDay'
    pct_used        NUMERIC   -- 0.0 to 1.0 (NULL if no MaxSpendPerDay rule)
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        a.id                          AS agent_id,
        a.name                        AS agent_name,
        a.is_active                   AS is_active,
        COALESCE(SUM(sl.amount), 0)   AS spend_24h,
        gr.daily_limit                AS max_spend_rule,
        CASE
            WHEN gr.daily_limit IS NULL OR gr.daily_limit = 0 THEN NULL
            ELSE ROUND(COALESCE(SUM(sl.amount), 0)::NUMERIC / gr.daily_limit, 4)
        END                           AS pct_used
    FROM agents a
    -- Rolling 24h spend
    LEFT JOIN spend_ledger sl
        ON sl.agent_id = a.id
        AND sl.created_at >= NOW() - INTERVAL '24 hours'
    -- Daily limit from guardrail rules
    LEFT JOIN LATERAL (
        SELECT (rule_params->>'limit')::BIGINT AS daily_limit
        FROM guardrail_rules
        WHERE agent_id = a.id
          AND rule_type = 'MaxSpendPerDay'
          AND is_active = true
        LIMIT 1
    ) gr ON true
    WHERE a.owner_address = p_owner_address
    GROUP BY a.id, a.name, a.is_active, gr.daily_limit
    ORDER BY a.created_at
$$;
```

**Calling from TypeScript:**
```typescript
// Source: supabase-js 2.97.0 .rpc() method
// File: dashboard/src/lib/spend-queries.ts

import { supabase } from './supabase'

export interface AgentSpendSummary {
  agent_id: string
  agent_name: string
  is_active: boolean
  spend_24h: number        // bigint returned as number by supabase-js
  max_spend_rule: number | null
  pct_used: number | null  // 0.0 to 1.0
}

export async function fetchAgentSpendSummary(ownerAddress: string): Promise<AgentSpendSummary[]> {
  const { data, error } = await supabase.rpc('get_agent_spend_summary', {
    p_owner_address: ownerAddress
  })
  if (error) throw new Error(`Spend summary failed: ${error.message}`)
  return data ?? []
}

// USDC amount display: amounts are stored as raw uint64 (6 decimal places)
export function formatUsdc(rawAmount: number): string {
  return (rawAmount / 1_000_000).toFixed(2) + ' USDC'
}
```

**Note on bigint/number:** Supabase JS returns PostgreSQL `BIGINT` as JavaScript `number`. For amounts
up to ~9.007 × 10^15 micro-USDC (9 billion USDC), this is safe since `Number.MAX_SAFE_INTEGER` is
~9 × 10^15. The project's `amount > 0` constraint and per-tx limits mean no realistic overflow.

---

## Pattern 3: Supabase Realtime for spend_ledger INSERTs

**What:** Client subscribes to `postgres_changes` on `spend_ledger` filtered by `agent_id`.
**When to use:** Agent detail page needs live spend update without polling.

```typescript
// Source: @supabase/realtime-js RealtimeChannel.d.ts — confirmed types
// File: dashboard/src/hooks/useSpendRealtime.ts
'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export interface SpendLedgerInsert {
  id: string
  agent_id: string
  session_key_id: string | null
  amount: number
  tx_nonce: string
  created_at: string
}

export function useSpendRealtime(
  agentId: string,
  onInsert: (row: SpendLedgerInsert) => void
) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    // SECURITY: filter by agent_id at the channel level to avoid cross-agent data leakage
    const channel = supabase
      .channel(`spend_ledger:${agentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'spend_ledger',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          onInsert(payload.new as SpendLedgerInsert)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [agentId, onInsert])
}
```

**Realtime prerequisites (Supabase dashboard configuration):**
- Enable Realtime on `spend_ledger` table in Supabase dashboard (or via SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE spend_ledger`).
- Row-Level Security (RLS) must allow reads — or the subscription will return empty payloads silently.
- `filter: 'agent_id=eq.{uuid}'` requires the column to be indexed (it is: `idx_spend_ledger_agent_time`).

**Security concern:** Without RLS on `spend_ledger`, any authenticated user can subscribe to any
agent's ledger. For Phase 4 scope (single-owner dashboard), this is acceptable. Add RLS in Phase 5.

---

## Pattern 4: Spend Alert Indicator (FR-7.8)

**What:** Color-coded status computed from `pct_used` threshold, rendered as badge + progress bar.
**Thresholds:**
- `pct_used < 0.50` → green (`bg-green-500`)
- `0.50 <= pct_used < 0.80` → yellow (`bg-yellow-500`)
- `pct_used >= 0.80` → red (`bg-destructive`) + alert toast

```typescript
// File: dashboard/src/components/spend/SpendProgressBar.tsx
'use client'

import * as Progress from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

interface SpendProgressBarProps {
  pctUsed: number | null    // 0.0 to 1.0, null if no limit set
  className?: string
}

type AlertLevel = 'safe' | 'warning' | 'critical'

function getAlertLevel(pct: number): AlertLevel {
  if (pct >= 0.80) return 'critical'
  if (pct >= 0.50) return 'warning'
  return 'safe'
}

const INDICATOR_COLORS: Record<AlertLevel, string> = {
  safe:     'bg-green-500',
  warning:  'bg-yellow-500',
  critical: 'bg-destructive',
}

export function SpendProgressBar({ pctUsed, className }: SpendProgressBarProps) {
  if (pctUsed === null) {
    return <span className="text-muted-foreground text-sm">No limit set</span>
  }

  const pct = Math.min(pctUsed, 1.0)   // cap at 100% for display
  const level = getAlertLevel(pct)

  return (
    <Progress.Root
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      value={Math.round(pct * 100)}
    >
      <Progress.Indicator
        className={cn('h-full transition-all', INDICATOR_COLORS[level])}
        style={{ transform: `translateX(-${100 - pct * 100}%)` }}
      />
    </Progress.Root>
  )
}
```

```typescript
// File: dashboard/src/components/spend/SpendAlertBadge.tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'

interface SpendAlertBadgeProps {
  pctUsed: number | null
}

export function SpendAlertBadge({ pctUsed }: SpendAlertBadgeProps) {
  if (pctUsed === null) return null

  if (pctUsed >= 0.80) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" />
        {Math.round(pctUsed * 100)}% used
      </Badge>
    )
  }
  if (pctUsed >= 0.50) {
    return (
      <Badge variant="secondary" className="gap-1 border-yellow-500 text-yellow-700 dark:text-yellow-400">
        {Math.round(pctUsed * 100)}% used
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 text-green-700 dark:text-green-400">
      {Math.round(pctUsed * 100)}% used
    </Badge>
  )
}
```

---

## Pattern 5: JSONB Metadata Viewer

**What:** The `audit_log.metadata` column is JSONB with varying structure per event type.
**Approach:** Render as a formatted pre block, with optional key-value expansion.

```typescript
// File: dashboard/src/components/audit/MetadataViewer.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface MetadataViewerProps {
  metadata: Record<string, unknown>
}

export function MetadataViewer({ metadata }: MetadataViewerProps) {
  const [expanded, setExpanded] = useState(false)
  const isEmpty = Object.keys(metadata).length === 0

  if (isEmpty) return <span className="text-muted-foreground text-xs">—</span>

  // Show top-level keys as summary
  const summaryKeys = Object.keys(metadata).slice(0, 3)
  const summary = summaryKeys.map(k => `${k}: ${JSON.stringify(metadata[k])}`).join(', ')

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
          {summary}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
      </div>
      {expanded && (
        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40 font-mono">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
  )
}
```

**Known metadata shapes per event type:**
```
proxy_request_received:  { target_url, amount_usdc, agent_id }
proxy_request_forwarded: { target_url, amount_usdc, tx_hash? }
proxy_request_failed:    { target_url, reason, error_code }
guardrail_violation:     { rule_type, rule_id, amount, limit }
session_key_created:     { public_key, max_spend, expires_at }
session_key_used:        { public_key, amount, remaining }
session_key_revoked:     { public_key, reason }
all_session_keys_revoked:{ agent_id, count }
agent_created:           { name, owner_address }
agent_deactivated:       { agent_id, reason }
solana_vault_queried:    { owner_pubkey, vault_pda }
solana_withdraw_*:       { owner_pubkey, amount, tx_signature? }
```

---

## Pattern 6: Event Type Color Coding

```typescript
// File: dashboard/src/components/audit/EventTypeBadge.tsx
import { Badge } from '@/components/ui/badge'
import { AuditEventType } from '@/lib/audit-queries'

const EVENT_COLORS: Record<AuditEventType, string> = {
  proxy_request_received:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  proxy_request_forwarded:   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  proxy_request_failed:      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  guardrail_violation:       'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  session_key_created:       'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  session_key_used:          'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  session_key_revoked:       'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  all_session_keys_revoked:  'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  agent_created:             'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  agent_deactivated:         'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  solana_vault_queried:      'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  solana_withdraw_submitted: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  solana_withdraw_confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  solana_withdraw_failed:    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

const EVENT_LABELS: Record<AuditEventType, string> = {
  proxy_request_received:    'Request In',
  proxy_request_forwarded:   'Forwarded',
  proxy_request_failed:      'Failed',
  guardrail_violation:       'Violation',
  session_key_created:       'Key Created',
  session_key_used:          'Key Used',
  session_key_revoked:       'Key Revoked',
  all_session_keys_revoked:  'All Revoked',
  agent_created:             'Agent Created',
  agent_deactivated:         'Deactivated',
  solana_vault_queried:      'Vault Query',
  solana_withdraw_submitted: 'SOL Submit',
  solana_withdraw_confirmed: 'SOL Confirmed',
  solana_withdraw_failed:    'SOL Failed',
}

export function EventTypeBadge({ eventType }: { eventType: AuditEventType }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_COLORS[eventType]}`}>
      {EVENT_LABELS[eventType]}
    </span>
  )
}
```

---

## Pattern 7: Date Range Picker (shadcn Calendar + Radix Popover)

**What:** Install `react-day-picker` + `date-fns` and use shadcn CLI to add the Calendar component.
**Approach:** Radix Popover trigger opens a shadcn Calendar with range selection.

```bash
# Install deps
npm install react-day-picker date-fns

# Add shadcn components via CLI
npx shadcn add calendar popover
```

```typescript
// File: dashboard/src/components/audit/DateRangePicker.tsx
'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  value?: DateRange
  onChange: (range: DateRange | undefined) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-[240px] justify-start text-left font-normal',
            !value && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value?.from ? (
            value.to ? (
              `${format(value.from, 'MMM d')} – ${format(value.to, 'MMM d, yyyy')}`
            ) : (
              format(value.from, 'MMM d, yyyy')
            )
          ) : (
            'Select date range'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  )
}
```

---

## Pattern 8: Optional Mini-Chart (Recharts)

**What:** Spend-over-time area chart per agent, showing 24h rolling spend trend.
**When to use:** Only add if FR-7.2 explicitly requires visual trend (not just current value).

```typescript
// File: dashboard/src/components/spend/SpendMiniChart.tsx
// Requires: npm install recharts
'use client'

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { formatUsdc } from '@/lib/spend-queries'

interface SpendDataPoint {
  hour: string    // e.g. "14:00"
  amount: number  // cumulative spend for that hour bucket
}

interface SpendMiniChartProps {
  data: SpendDataPoint[]
  height?: number
}

export function SpendMiniChart({ data, height = 60 }: SpendMiniChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="hour" hide />
        <YAxis hide />
        <Tooltip
          formatter={(value: number) => [formatUsdc(value), 'Spend']}
          contentStyle={{ fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          fill="url(#spendGradient)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

**SQL for hourly bucketed data (Supabase RPC):**
```sql
CREATE OR REPLACE FUNCTION get_agent_spend_hourly(p_agent_id UUID, p_hours INT DEFAULT 24)
RETURNS TABLE (hour_bucket TIMESTAMPTZ, amount BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT
    date_trunc('hour', created_at) AS hour_bucket,
    SUM(amount)                    AS amount
  FROM spend_ledger
  WHERE agent_id = p_agent_id
    AND created_at >= NOW() - (p_hours || ' hours')::INTERVAL
  GROUP BY 1
  ORDER BY 1
$$;
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar with accessible semantics | `<div>` with inline width style | `@radix-ui/react-progress` (already installed) | aria-valuenow/valuemin/valuemax, keyboard support, SSR-safe |
| Toast notifications | Custom z-index portal + state | `@radix-ui/react-toast` (already installed) | Handles viewport stacking, ARIA live region, swipe-to-dismiss |
| Date range picker | Native `<input type="date">` fields | `react-day-picker` + shadcn Calendar | Range selection, disabled dates, locale formatting |
| Event type multi-select | Checkbox list with manual state | `@radix-ui/react-dropdown-menu` with checkboxes (installed) | ARIA, keyboard nav, popover positioning |
| Realtime polling | `setInterval` + refetch | Supabase Realtime subscription | WebSocket-based, no polling overhead, instant updates |
| Cursor pagination | URL `?page=N` offset | `?cursor=<uuid>` with `created_at+id` composite key | Append-only table — offset drifts as rows arrive |
| USDC formatting | Raw bigint display | `(amount / 1_000_000).toFixed(2) + ' USDC'` | Amounts are stored in micro-USDC (6 decimal places) |
| Chart from scratch | Canvas drawing | Recharts (if needed) | SSR-compatible with `"use client"`, tree-shakeable |

**Key insight:** The Radix UI primitives via `radix-ui@1.4.3` expose Progress and Toast which are
exactly what spend alerts need. Resist building custom animated divs — Radix handles accessibility
and animation for free.

---

## Common Pitfalls

### Pitfall 1: Server Components + Supabase Realtime
**What goes wrong:** Realtime subscriptions (`channel().on(...)`) require browser WebSockets. Using
them in a React Server Component crashes at build time.
**Why it happens:** Next.js App Router defaults to RSC; `useEffect` is not available.
**How to avoid:** Any component using `useSpendRealtime` or `supabase.channel()` must have `'use client'`
at the top. Create a `SpendRealtimeProvider.tsx` (client) that wraps a server-rendered parent.
**Warning signs:** `Error: Event handlers cannot be passed to Client Component props` or
`useEffect is not a function` in server context.

### Pitfall 2: Supabase Realtime Silent Failures
**What goes wrong:** Subscription subscribes but never fires — no error is thrown.
**Why it happens:** Three causes: (a) Realtime not enabled for the table in Supabase dashboard,
(b) RLS policy blocks the row, (c) wrong `schema` (should be `'public'`).
**How to avoid:** Subscribe to the `.subscribe()` callback's status arg:
```typescript
.subscribe((status, err) => {
  if (status === 'SUBSCRIBED') console.log('Realtime ready')
  if (err) console.error('Realtime error:', err)
})
```
Check Supabase dashboard → Database → Replication → `spend_ledger` is listed.
**Warning signs:** `status === 'CHANNEL_ERROR'` or 30s timeout with no events.

### Pitfall 3: Offset Pagination on Append-Only Table
**What goes wrong:** User on page 2 sees duplicate rows or misses rows as new data arrives.
**Why it happens:** `LIMIT 50 OFFSET 50` shifts when 5 new rows prepend between page loads.
**How to avoid:** Always use cursor-based pagination with `created_at` + `id` composite cursor.
The `ORDER BY created_at DESC, id DESC` with `WHERE (created_at, id) < (cursor_ts, cursor_id)` is
stable regardless of new inserts.
**Warning signs:** "I already saw that row" feedback from users, or gap rows in the middle.

### Pitfall 4: bigint Arithmetic in JavaScript
**What goes wrong:** `amount / 1_000_000` gives floating point imprecision for large amounts.
**Why it happens:** JavaScript `number` cannot represent all 64-bit integers exactly.
**How to avoid:** Supabase JS returns PostgreSQL BIGINT as `number`. For amounts up to ~9 billion
USDC (9 × 10^15 micro-USDC), `Number.MAX_SAFE_INTEGER` is not exceeded. Safe for x402Guard's use
case. Document this assumption; add validation if amounts could exceed 9 × 10^9 USDC.
**Warning signs:** Amounts like `10000.00` display as `9999.999999999998`.

### Pitfall 5: Realtime Filter Requires Published Table
**What goes wrong:** Filter `agent_id=eq.{uuid}` fails silently or returns all rows.
**Why it happens:** Row-level filters in Realtime require `filter` to reference a column that is
in the publication's replica identity. By default, this is only the primary key.
**How to avoid:** Either (a) use full replica identity: `ALTER TABLE spend_ledger REPLICA IDENTITY FULL`,
or (b) filter client-side in the callback:
```typescript
(payload) => {
  if (payload.new.agent_id === agentId) onInsert(payload.new)
}
```
The client-side filter is simpler and avoids the ALTER TABLE change.

### Pitfall 6: Multiple Supabase Realtime Channels per Page
**What goes wrong:** Opening a channel per agent card in a list of 10 agents creates 10 WebSocket
channels, hitting Supabase's concurrent channel limit (100 per client by default).
**How to avoid:** For a list view, subscribe to ALL inserts on `spend_ledger` with no filter,
then dispatch to each card's state via a context or reducer:
```typescript
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'spend_ledger' }, handler)
```
Use one channel for the monitoring overview page; use agent-specific channels only on agent detail pages.

### Pitfall 7: USDC Decimal Precision in Display
**What goes wrong:** Guardrail limits like `max_spend = 100_000_000` (100 USDC) display as `100.000000`.
**Why it happens:** Amounts stored as micro-USDC (6 decimal places).
**How to avoid:**
```typescript
// Correct: toFixed(2) for display, no trailing zeros for whole amounts
function formatUsdc(raw: number): string {
  const usdc = raw / 1_000_000
  return usdc % 1 === 0 ? `${usdc} USDC` : `${usdc.toFixed(2)} USDC`
}
```

---

## Audit Log Viewer Component Sketch

```
┌─────────────────────────────────────────────────────────────┐
│  Audit Log                                    [Export CSV?]  │
│                                                              │
│  [Agent: All ▼] [Event Type: All ▼] [Date Range: Select ▼] │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Timestamp    │ Event         │ Agent   │ Metadata  │   │ │
│  ├──────────────┼───────────────┼─────────┼───────────┼───┤ │
│  │ 14:32:01     │ [Forwarded]   │ MyAgent │ 1.50 USDC │ ▼ │ │
│  │ 14:31:58     │ [Request In]  │ MyAgent │ target_url│ ▼ │ │
│  │ 14:28:12     │ [Violation]   │ MyAgent │ MaxSpend  │ ▼ │ │
│  │ 14:25:04     │ [Key Used]    │ MyAgent │ 0.50 USDC │ ▼ │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [← Previous]                        [Next →]               │
└─────────────────────────────────────────────────────────────┘
```

---

## Spend Monitoring Component Sketch

```
┌─────────────────────────────────────────────────────────────┐
│  Spend Monitoring                  [Last updated: 14:32:01]  │
│                                                              │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │ MyAgent                  │  │ TradingBot               │  │
│  │ ● Active                 │  │ ● Active [!85% used]     │  │
│  │                          │  │                          │  │
│  │ 24h Spend: 42.50 USDC   │  │ 24h Spend: 85.00 USDC   │  │
│  │ Limit: 100 USDC          │  │ Limit: 100 USDC          │  │
│  │ ████████░░░░ 42%         │  │ ████████████████████ 85% │  │
│  │ [42% used]               │  │ [85% used] ⚠             │  │
│  │                          │  │                          │  │
│  │ [View Audit Log →]       │  │ [View Audit Log →]       │  │
│  └─────────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Charts Analysis (FR-7.2 Optional)

| Library | Bundle Size | React 19 Support | SSR Safe | Recommendation |
|---------|-------------|------------------|----------|----------------|
| Recharts 2.x | ~400KB | Yes (via `"use client"`) | Yes with client boundary | USE if charts needed |
| Chart.js 4.x | ~300KB + react-chartjs-2 | Yes | Needs dynamic import | AVOID: extra wrapper |
| shadcn Charts | ~400KB (Recharts) | Yes | Yes | USE if already on shadcn CLI — wraps Recharts with shadcn tokens |
| Victory 37.x | ~500KB | Yes | Partial | AVOID: large bundle |
| Visx (Airbnb) | ~200KB (modular) | Yes | Yes | CONSIDER if minimal footprint needed |

**Decision:** Install `recharts@^2.15`. The shadcn Charts component (`npx shadcn add chart`) wraps
Recharts and inherits CSS variable color tokens, making it the lowest-friction option given the
project already uses shadcn. Add only if time-series spend chart is explicitly required.

```bash
# Add shadcn chart component (uses recharts internally)
npm install recharts
npx shadcn add chart
```

---

## shadcn Components to Add via CLI

These components need to be added since only `alert`, `badge`, `button`, `card`, `input`, `table` exist:

```bash
# Needed for audit log viewer
npx shadcn add select       # Event type filter dropdown
npx shadcn add popover      # Date range picker wrapper
npx shadcn add calendar     # Date range picker (installs react-day-picker)

# Needed for spend monitoring
npx shadcn add progress     # Spend bar (wraps @radix-ui/react-progress)
npx shadcn add toast        # 80% alert notification

# Optional for layout
npx shadcn add separator    # Section dividers
npx shadcn add tabs         # Audit/Spend tab navigation on agent page
npx shadcn add dropdown-menu  # Multi-select event type checkboxes
```

---

## SQL Indexes Verification

The existing indexes from migrations support the query patterns above:

| Index | Columns | Supports |
|-------|---------|---------|
| `idx_audit_log_agent_time` | `(agent_id, created_at DESC)` | Agent filter + date-ordered pagination |
| `idx_audit_log_event_type_time` | `(event_type, created_at DESC)` | Single event type filter + ordered |
| `idx_audit_log_session_key` | `(session_key_id, created_at DESC) WHERE session_key_id IS NOT NULL` | Session key filtering |
| `idx_spend_ledger_agent_time` | `(agent_id, created_at)` | 24h spend aggregation + Realtime filter |

**Gap:** No index supports combined `agent_id + event_type` filtering (two filter columns). For the
common "show guardrail_violations for agent X" query, PostgreSQL will use the `agent_id` index and
filter `event_type` in memory. This is acceptable for Phase 4 data volumes. Add a composite index
`(agent_id, event_type, created_at DESC)` if query performance is degraded with real data.

```sql
-- Optional future migration (if needed):
CREATE INDEX idx_audit_log_agent_event_time
  ON audit_log (agent_id, event_type, created_at DESC);
```

---

## State Management Pattern (No Zustand Needed)

For Phase 4's read-heavy dashboard, React `useState` + `useReducer` in client components is sufficient.
No global state manager is needed. Filters flow down as props; Realtime updates flow up via callbacks.

```typescript
// Audit log filter state — keep in the page component, pass to AuditLogFilters
interface AuditLogState {
  agentId: string | undefined
  eventTypes: AuditEventType[]
  dateRange: { from?: Date; to?: Date } | undefined
  cursor: string | undefined   // UUID of last-seen row
}
```

---

## Open Questions

1. **Supabase Auth integration**
   - What we know: FR-7.1 requires Supabase Auth (wallet connect). `owner_address` is the identity key.
   - What's unclear: Phase 4 scope — does the spend summary RPC need to take `owner_address` from
     the JWT session, or is it passed explicitly? Without RLS, any client can query any owner's data.
   - Recommendation: For Phase 4, pass `owner_address` explicitly. Add RLS + JWT claims in Phase 5.

2. **Realtime publication for audit_log**
   - What we know: The audit_log immutability trigger blocks UPDATE/DELETE. INSERT is allowed.
   - What's unclear: Whether to subscribe Realtime to `audit_log` (live event feed on agent detail).
   - Recommendation: Add Realtime on `audit_log` for the agent audit page — new events appear live.
     Requires enabling the publication in Supabase dashboard.

3. **Supabase project URL / RLS policies**
   - What we know: `supabase.ts` reads from `NEXT_PUBLIC_SUPABASE_URL` env var.
   - What's unclear: Whether RLS is enabled on the tables. If yes, the anon key queries will fail
     without proper `SELECT` policies.
   - Recommendation: Verify RLS status before implementing. If RLS is OFF, proceed with anon key.
     If ON, add service-role key for server-side queries or create appropriate policies.

4. **Export CSV requirement**
   - What we know: Not in the requirements (FR-6.5, FR-7.3) but commonly expected for audit logs.
   - What's unclear: Whether to add it to Phase 4 scope.
   - Recommendation: Defer. Can be done client-side with `data.map(r => ...).join('\n')` if needed.

---

## Sources

### Primary (HIGH confidence — verified from installed packages)
- `D:/x402Guard/dashboard/node_modules/@supabase/postgrest-js/dist/index.d.mts` — All filter/pagination methods confirmed: `.eq()`, `.gte()`, `.lte()`, `.in()`, `.order()`, `.range()`, `.limit()`, `.or()`
- `D:/x402Guard/dashboard/node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.d.ts` — `RealtimePostgresChangesFilter`, `POSTGRES_CHANGES`, `INSERT` event type, `filter` string field, `.subscribe()` confirmed
- `D:/x402Guard/dashboard/node_modules/radix-ui/src/index.ts` — Full primitive list: Popover, Select, Progress, Toast, Checkbox, DropdownMenu confirmed present
- `D:/x402Guard/proxy/migrations/` — Exact column names, types, constraints, and indexes confirmed from migration SQL files

### Secondary (MEDIUM confidence — verified package existence, API from training knowledge)
- `recharts@2.x` — SSR compatibility with `"use client"` boundary, confirmed in training data; package not installed but widely documented
- `react-day-picker@8.x` — DateRange type, `mode="range"` API; shadcn Calendar is the canonical wrapper
- shadcn CLI component list (`calendar`, `popover`, `progress`, `toast`, `select`) — confirmed via shadcn CLI at `node_modules/shadcn`

### Tertiary (LOW confidence — from training knowledge, unverified against live docs)
- Supabase Realtime `filter` string format (`agent_id=eq.{uuid}`) — standard PostgREST filter syntax applied to Realtime; confirmed from type signature but exact string format not verified live
- PostgreSQL `REPLICA IDENTITY FULL` requirement for column-filtered Realtime — standard Supabase behavior; recommend testing with client-side filter fallback

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from `node_modules/`
- Query patterns: HIGH — method signatures confirmed from PostgREST type file
- Realtime: MEDIUM — API confirmed from type file; `filter` string format is LOW (test first)
- Charts: MEDIUM — Recharts is not installed but is the ecosystem standard
- SQL aggregation: HIGH — written against confirmed schema from migration files

**Research date:** 2026-03-01
**Valid until:** 2026-06-01 (Supabase JS and shadcn are stable; re-verify if upgrading beyond 2.97)
