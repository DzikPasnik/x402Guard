---
phase: 04-dashboard
plan: 05
type: execute
wave: 2
depends_on: ["04-01", "04-02"]
files_modified:
  - proxy/migrations/004_spend_aggregation_rpc.sql
  - dashboard/src/lib/spend-queries.ts
  - dashboard/src/hooks/useSpendRealtime.ts
  - dashboard/src/components/spend/SpendProgressBar.tsx
  - dashboard/src/components/spend/SpendAlertBadge.tsx
  - dashboard/src/components/spend/SpendMonitor.tsx
  - dashboard/src/components/ui/progress.tsx
  - dashboard/src/components/ui/toast.tsx
  - dashboard/src/components/ui/toaster.tsx
  - dashboard/src/components/ui/sonner.tsx
  - dashboard/src/components/dashboard/AgentCard.tsx
  - dashboard/src/app/dashboard/page.tsx
  - dashboard/src/app/layout.tsx
autonomous: true
requirements: ["FR-7.2", "FR-7.8"]

must_haves:
  truths:
    - "Dashboard overview page shows each agent's 24h spend total and daily limit"
    - "Spend progress bar color-codes green (<50%), yellow (50-80%), red (>=80%)"
    - "Alert badge appears on agents at or above 80% spend utilization"
    - "Agents without a MaxSpendPerDay rule show 'No limit set' instead of a progress bar"
    - "Spend amounts display in human-readable USDC (e.g. '42.50 USDC') not raw micro-USDC"
    - "Realtime spend inserts update the displayed totals without page refresh"
    - "Toast notification fires when an agent crosses the 80% threshold via live update"
  artifacts:
    - path: "proxy/migrations/004_spend_aggregation_rpc.sql"
      provides: "get_agent_spend_summary PostgreSQL RPC function"
      contains: "CREATE OR REPLACE FUNCTION get_agent_spend_summary"
    - path: "dashboard/src/lib/spend-queries.ts"
      provides: "AgentSpendSummary type + fetchAgentSpendSummary + formatUsdc"
      exports: ["AgentSpendSummary", "fetchAgentSpendSummary", "formatUsdc"]
    - path: "dashboard/src/hooks/useSpendRealtime.ts"
      provides: "Supabase Realtime hook for spend_ledger INSERT events"
      exports: ["useSpendRealtime", "SpendLedgerInsert"]
    - path: "dashboard/src/components/spend/SpendProgressBar.tsx"
      provides: "Color-coded Radix Progress component"
      exports: ["SpendProgressBar"]
    - path: "dashboard/src/components/spend/SpendAlertBadge.tsx"
      provides: "Alert badge with threshold-based variant"
      exports: ["SpendAlertBadge"]
    - path: "dashboard/src/components/spend/SpendMonitor.tsx"
      provides: "Composite client widget with realtime + progress + badge + toast"
      exports: ["SpendMonitor"]
    - path: "dashboard/src/components/dashboard/AgentCard.tsx"
      provides: "Agent card with integrated spend monitoring"
      exports: ["AgentCard"]
    - path: "dashboard/src/app/dashboard/page.tsx"
      provides: "Agent overview page fetching spend summaries"
      min_lines: 30
  key_links:
    - from: "dashboard/src/app/dashboard/page.tsx"
      to: "supabase.rpc('get_agent_spend_summary')"
      via: "fetchAgentSpendSummary in spend-queries.ts"
      pattern: "fetchAgentSpendSummary"
    - from: "dashboard/src/components/spend/SpendMonitor.tsx"
      to: "spend_ledger Realtime channel"
      via: "useSpendRealtime hook"
      pattern: "useSpendRealtime"
    - from: "dashboard/src/components/spend/SpendMonitor.tsx"
      to: "SpendProgressBar + SpendAlertBadge"
      via: "computed pctUsed from initialSpent + live delta"
      pattern: "SpendProgressBar|SpendAlertBadge"
    - from: "dashboard/src/components/dashboard/AgentCard.tsx"
      to: "SpendMonitor"
      via: "passes initialSpent and dailyCap as props"
      pattern: "SpendMonitor"
---

<objective>
Implement real-time spend monitoring with alert indicators for the x402Guard dashboard.

Purpose: Users must see at a glance how much each agent has spent in the last 24 hours relative to its daily limit, with color-coded warnings and live updates as new transactions arrive (FR-7.2 spend monitoring, FR-7.8 alert indicators).

Output:
- PostgreSQL RPC function for efficient server-side spend aggregation
- Typed query layer and USDC formatting utility
- Supabase Realtime hook for live spend_ledger INSERTs
- SpendProgressBar (green/yellow/red), SpendAlertBadge, and SpendMonitor components
- AgentCard with integrated spend display
- Dashboard overview page showing all agents with spend status
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-dashboard/RESEARCH-monitoring.md

@proxy/migrations/001_create_tables.sql
@dashboard/src/lib/supabase.ts
@dashboard/src/lib/utils.ts
@dashboard/src/components/ui/badge.tsx
@dashboard/src/components/ui/card.tsx
@dashboard/src/app/layout.tsx
@dashboard/package.json

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From proxy/migrations/001_create_tables.sql:
```sql
-- spend_ledger schema
CREATE TABLE spend_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    session_key_id UUID REFERENCES session_keys(id) ON DELETE SET NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    tx_nonce TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spend_ledger_agent_time ON spend_ledger(agent_id, created_at);

-- agents schema
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- guardrail_rules schema (MaxSpendPerDay has rule_params: { "limit": <bigint> })
CREATE TABLE guardrail_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    rule_params JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

From dashboard/src/lib/supabase.ts:
```typescript
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

From dashboard/src/lib/utils.ts:
```typescript
export function cn(...inputs: ClassValue[]): string
```

From dashboard/src/components/ui/badge.tsx:
```typescript
export { Badge, badgeVariants }
// Badge variants: default, secondary, destructive, outline, ghost, link
```

From dashboard/src/components/ui/card.tsx:
```typescript
export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
```

shadcn uses "radix-ui" package (1.4.3) — NOT the older "@radix-ui/*" scope.
Import pattern: `import { Progress } from "radix-ui"` (for raw Radix),
but shadcn-generated components wrap Radix and export from `@/components/ui/progress`.

USDC amounts: stored as micro-USDC (BIGINT). Divide by 1_000_000 for display.
MaxSpendPerDay guardrail: rule_params JSONB has `{ "limit": <number> }` key.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB migration + query layer + shadcn components</name>
  <files>
    proxy/migrations/004_spend_aggregation_rpc.sql
    dashboard/src/lib/spend-queries.ts
    dashboard/src/hooks/useSpendRealtime.ts
    dashboard/src/components/ui/progress.tsx
    dashboard/src/components/ui/toast.tsx
    dashboard/src/components/ui/toaster.tsx
    dashboard/src/components/ui/sonner.tsx
  </files>
  <action>
**Step 1: Install shadcn progress and toast components.**

Run from `D:/x402Guard/dashboard`:
```bash
npx shadcn@latest add progress toast
```
This generates `progress.tsx` and toast-related files under `src/components/ui/`.
If the shadcn CLI prompts for overwrite, accept. If it also installs `sonner` as
the toast provider (shadcn v3.x uses sonner by default), that is fine.

**Step 2: Create the PostgreSQL RPC migration.**

Create `proxy/migrations/004_spend_aggregation_rpc.sql` with a single function:

```sql
-- Phase 4: Spend aggregation RPC for dashboard overview.
-- Returns 24h rolling spend + daily limit for each agent belonging to an owner.

CREATE OR REPLACE FUNCTION get_agent_spend_summary(p_owner_address TEXT)
RETURNS TABLE (
    agent_id        UUID,
    agent_name      TEXT,
    is_active       BOOLEAN,
    spend_24h       BIGINT,
    max_spend_rule  BIGINT,
    pct_used        NUMERIC
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
    LEFT JOIN spend_ledger sl
        ON sl.agent_id = a.id
        AND sl.created_at >= NOW() - INTERVAL '24 hours'
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

Key details:
- LANGUAGE sql STABLE (read-only, safe for Supabase RPC).
- Uses idx_spend_ledger_agent_time for the 24h window aggregation.
- LATERAL join fetches at most one MaxSpendPerDay rule per agent.
- pct_used is NULL when no daily limit exists (not 0).
- COALESCE(SUM(...), 0) so agents with no spend show 0 instead of NULL.

**Step 3: Create `dashboard/src/lib/spend-queries.ts`.**

```typescript
import { supabase } from './supabase'

export interface AgentSpendSummary {
  agent_id: string
  agent_name: string
  is_active: boolean
  spend_24h: number        // micro-USDC (raw BIGINT from Postgres)
  max_spend_rule: number | null  // micro-USDC, null if no MaxSpendPerDay rule
  pct_used: number | null  // 0.0 to 1.0, null if no limit
}

export async function fetchAgentSpendSummary(
  ownerAddress: string
): Promise<AgentSpendSummary[]> {
  const { data, error } = await supabase.rpc('get_agent_spend_summary', {
    p_owner_address: ownerAddress,
  })
  if (error) {
    throw new Error(`Spend summary query failed: ${error.message}`)
  }
  return (data ?? []) as AgentSpendSummary[]
}

/**
 * Format raw micro-USDC amount to human-readable string.
 * Example: 42_500_000 -> "42.50 USDC", 100_000_000 -> "100 USDC"
 */
export function formatUsdc(rawAmount: number): string {
  const usdc = rawAmount / 1_000_000
  return usdc % 1 === 0 ? `${usdc} USDC` : `${usdc.toFixed(2)} USDC`
}
```

**Step 4: Create `dashboard/src/hooks/useSpendRealtime.ts`.**

```typescript
'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface SpendLedgerInsert {
  id: string
  agent_id: string
  session_key_id: string | null
  amount: number
  tx_nonce: string
  created_at: string
}

/**
 * Subscribes to Realtime INSERT events on spend_ledger for a specific agent.
 * Calls onInsert with each new row. Cleans up channel on unmount.
 *
 * Uses client-side agent_id filter as fallback — Supabase Realtime column
 * filters require REPLICA IDENTITY FULL which may not be configured.
 */
export function useSpendRealtime(
  agentId: string | null,
  onInsert: (row: SpendLedgerInsert) => void
): void {
  const callbackRef = useRef(onInsert)
  callbackRef.current = onInsert

  const stableOnInsert = useCallback(
    (row: SpendLedgerInsert) => callbackRef.current(row),
    []
  )

  useEffect(() => {
    if (!agentId) return

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
          // Client-side filter fallback in case server filter is not active
          const row = payload.new as SpendLedgerInsert
          if (row.agent_id === agentId) {
            stableOnInsert(row)
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error(`Realtime subscription error for agent ${agentId}:`, err)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [agentId, stableOnInsert])
}
```

Important design notes embedded in action:
- `callbackRef` pattern prevents useEffect re-subscription on every render when parent
  passes an inline function.
- agentId=null guard means this hook is safe to call before data loads.
- Client-side `row.agent_id === agentId` check is the fallback for Pitfall 5 from research.
- Channel name includes agentId for uniqueness.
  </action>
  <verify>
    <automated>cd D:/x402Guard/dashboard && npx tsc --noEmit 2>&1 | head -30</automated>
    Verify: `004_spend_aggregation_rpc.sql` exists and contains `CREATE OR REPLACE FUNCTION get_agent_spend_summary`.
    Verify: `spend-queries.ts` exports AgentSpendSummary, fetchAgentSpendSummary, formatUsdc.
    Verify: `useSpendRealtime.ts` has 'use client' directive, exports useSpendRealtime.
    Verify: `progress.tsx` exists under `src/components/ui/`.
  </verify>
  <done>
    - Migration file exists at proxy/migrations/004_spend_aggregation_rpc.sql with correct SQL
    - spend-queries.ts compiles and exports AgentSpendSummary interface + fetchAgentSpendSummary + formatUsdc
    - useSpendRealtime.ts compiles with 'use client', proper cleanup, client-side filter fallback
    - shadcn progress and toast UI components installed and present
    - No TypeScript compilation errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Spend display components + AgentCard + dashboard page</name>
  <files>
    dashboard/src/components/spend/SpendProgressBar.tsx
    dashboard/src/components/spend/SpendAlertBadge.tsx
    dashboard/src/components/spend/SpendMonitor.tsx
    dashboard/src/components/dashboard/AgentCard.tsx
    dashboard/src/app/dashboard/page.tsx
    dashboard/src/app/layout.tsx
  </files>
  <action>
**Step 1: Create `dashboard/src/components/spend/SpendProgressBar.tsx`.**

'use client' component. Renders a Radix Progress bar with color coding based on pct_used.

Props: `pctUsed: number | null` (0.0 to 1.0), `className?: string`.

Color logic (AlertLevel type):
- `pct < 0.50` -> 'safe' -> indicator `bg-green-500`
- `0.50 <= pct < 0.80` -> 'warning' -> indicator `bg-yellow-500`
- `pct >= 0.80` -> 'critical' -> indicator `bg-destructive`
- `pctUsed === null` -> render `<span className="text-muted-foreground text-sm">No limit set</span>` instead of bar

Use shadcn's generated `@/components/ui/progress` component (which wraps `@radix-ui/react-progress` or the radix-ui package equivalent). If the shadcn progress component does not expose an `indicatorClassName` prop, use the Radix Progress primitives directly:

```typescript
import * as ProgressPrimitive from 'radix-ui' // or the correct import path
```

Check the generated `progress.tsx` to see the exact API. The indicator needs a dynamic background class based on alert level. If the shadcn Progress component only accepts `value` and `className`, either:
(a) Extend it to accept `indicatorClassName`, or
(b) Use the Radix primitive directly in SpendProgressBar.

Cap displayed percentage at 100% (`Math.min(pctUsed, 1.0)`) but allow pctUsed > 1.0 to still show 'critical' level.

**Step 2: Create `dashboard/src/components/spend/SpendAlertBadge.tsx`.**

'use client' component. Renders a Badge with contextual variant based on spend percentage.

Props: `pctUsed: number | null`.

Logic:
- `pctUsed === null` -> return null (no badge)
- `pctUsed >= 0.80` -> `<Badge variant="destructive">` with `<AlertTriangle className="size-3" />` icon and text `"{pct}% used"` where pct = `Math.round(pctUsed * 100)`
- `pctUsed >= 0.50` -> `<Badge variant="secondary" className="border-yellow-500 text-yellow-700 dark:text-yellow-400">` with text `"{pct}% used"`
- `pctUsed < 0.50` -> `<Badge variant="outline" className="text-green-700 dark:text-green-400">` with text `"{pct}% used"`

Import `AlertTriangle` from `lucide-react`, `Badge` from `@/components/ui/badge`.

**Step 3: Create `dashboard/src/components/spend/SpendMonitor.tsx`.**

'use client' composite widget that ties everything together for a single agent.

Props:
```typescript
interface SpendMonitorProps {
  agentId: string
  initialSpent: number       // micro-USDC from server render
  dailyCap: number | null    // micro-USDC, null if no MaxSpendPerDay rule
}
```

Implementation:
1. `const [spent, setSpent] = useState(initialSpent)` — local state starts from server-rendered value.
2. Compute `pctUsed`: if `dailyCap !== null && dailyCap > 0` then `spent / dailyCap`, else `null`.
3. Use `useSpendRealtime(agentId, callback)` where callback does `setSpent(prev => prev + row.amount)`.
4. Track previous pctUsed with useRef. When pctUsed crosses 0.80 from below (was < 0.80, now >= 0.80), fire a toast notification: "Agent approaching limit: {pct}% of daily budget used".
5. For the toast, use the sonner or shadcn toast API depending on what was installed in Task 1. Check which toast system shadcn v3.x generates (likely sonner). Use `toast.warning(message)` from sonner, or the shadcn `useToast()` hook.
6. Render layout:
   ```
   <div className="space-y-2">
     <div className="flex items-center justify-between text-sm">
       <span className="text-muted-foreground">24h Spend</span>
       <span className="font-mono font-medium">{formatUsdc(spent)}</span>
     </div>
     {dailyCap !== null && (
       <div className="flex items-center justify-between text-sm">
         <span className="text-muted-foreground">Daily Limit</span>
         <span className="font-mono font-medium">{formatUsdc(dailyCap)}</span>
       </div>
     )}
     <SpendProgressBar pctUsed={pctUsed} />
     <div className="flex justify-end">
       <SpendAlertBadge pctUsed={pctUsed} />
     </div>
   </div>
   ```

Import `formatUsdc` from `@/lib/spend-queries`.

**Step 4: Create `dashboard/src/components/dashboard/AgentCard.tsx`.**

Server-renderable card wrapping the SpendMonitor client component.

Props:
```typescript
interface AgentCardProps {
  agentId: string
  agentName: string
  isActive: boolean
  initialSpent: number
  dailyCap: number | null
}
```

Renders using shadcn Card components:
```
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <div className={cn(
        "size-2 rounded-full",
        isActive ? "bg-green-500" : "bg-muted-foreground"
      )} />
      <CardTitle>{agentName}</CardTitle>
    </div>
    <CardDescription>{isActive ? "Active" : "Inactive"}</CardDescription>
  </CardHeader>
  <CardContent>
    <SpendMonitor
      agentId={agentId}
      initialSpent={initialSpent}
      dailyCap={dailyCap}
    />
  </CardContent>
</Card>
```

Import Card/CardHeader/CardTitle/CardDescription/CardContent from `@/components/ui/card`.
Import `cn` from `@/lib/utils`.
Import `SpendMonitor` from `@/components/spend/SpendMonitor`.

**Step 5: Create `dashboard/src/app/dashboard/page.tsx`.**

Server Component that fetches spend summaries and renders AgentCard grid.

```typescript
import { fetchAgentSpendSummary } from '@/lib/spend-queries'
import { AgentCard } from '@/components/dashboard/AgentCard'

// TODO: Replace with actual owner address from auth session (Plan 04-01)
const PLACEHOLDER_OWNER = '0x0000000000000000000000000000000000000000'

export default async function DashboardPage() {
  let agents: Awaited<ReturnType<typeof fetchAgentSpendSummary>> = []
  let error: string | null = null

  try {
    agents = await fetchAgentSpendSummary(PLACEHOLDER_OWNER)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load agents'
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Overview</h1>
        <p className="text-muted-foreground mt-1">
          Monitor spend and manage your x402Guard agents.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {agents.length === 0 && !error && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No agents found. Create an agent to get started.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.agent_id}
            agentId={agent.agent_id}
            agentName={agent.agent_name}
            isActive={agent.is_active}
            initialSpent={agent.spend_24h}
            dailyCap={agent.max_spend_rule}
          />
        ))}
      </div>
    </div>
  )
}
```

Note: `PLACEHOLDER_OWNER` is temporary. Plan 04-01 (auth) will replace this with the authenticated wallet address from the Supabase session. The data-fetching pattern is correct regardless.

**Step 6: Update `dashboard/src/app/layout.tsx`.**

If shadcn toast uses sonner (check generated files), add the `<Toaster />` provider component
inside the `<body>` tag in layout.tsx, after `{children}`:

```typescript
import { Toaster } from '@/components/ui/sonner'
// or: import { Toaster } from '@/components/ui/toaster'
// (depends on which toast system shadcn generated)
```

Add `<Toaster />` as the last child inside `<body>`. This enables toast notifications
from SpendMonitor to render in the viewport. Do NOT duplicate if a Toaster is already present.
  </action>
  <verify>
    <automated>cd D:/x402Guard/dashboard && npm run build 2>&1 | tail -20</automated>
    Verify: `npm run build` completes without errors.
    Verify: SpendProgressBar renders "No limit set" when pctUsed is null.
    Verify: SpendAlertBadge shows destructive variant with AlertTriangle icon when pctUsed >= 0.80.
    Verify: SpendMonitor integrates useSpendRealtime hook and updates spent on INSERT.
    Verify: AgentCard renders Card with status dot, name, and SpendMonitor.
    Verify: Dashboard page renders grid of AgentCards from fetchAgentSpendSummary result.
    Verify: Toaster is present in layout.tsx for toast notifications.
  </verify>
  <done>
    - SpendProgressBar renders green/yellow/red progress bar based on thresholds, or "No limit set" for null
    - SpendAlertBadge shows appropriate Badge variant with icon at critical level
    - SpendMonitor composes progress bar + badge + realtime hook + toast on 80% crossing
    - AgentCard wraps SpendMonitor in a shadcn Card with agent name and active status
    - Dashboard page at /dashboard fetches spend summaries and renders responsive AgentCard grid
    - Toaster provider added to root layout for toast notifications
    - `npm run build` passes with zero errors
  </done>
</task>

</tasks>

<verification>
1. **TypeScript compilation:** `cd D:/x402Guard/dashboard && npx tsc --noEmit` passes with no errors.
2. **Next.js build:** `cd D:/x402Guard/dashboard && npm run build` completes successfully (validates RSC/client boundary correctness).
3. **Migration SQL:** `proxy/migrations/004_spend_aggregation_rpc.sql` is valid PostgreSQL (manual check: function signature, JOIN syntax, COALESCE usage).
4. **File inventory check:**
   - `proxy/migrations/004_spend_aggregation_rpc.sql` exists
   - `dashboard/src/lib/spend-queries.ts` exports AgentSpendSummary, fetchAgentSpendSummary, formatUsdc
   - `dashboard/src/hooks/useSpendRealtime.ts` has 'use client', exports useSpendRealtime
   - `dashboard/src/components/spend/SpendProgressBar.tsx` has 'use client'
   - `dashboard/src/components/spend/SpendAlertBadge.tsx` has 'use client'
   - `dashboard/src/components/spend/SpendMonitor.tsx` has 'use client'
   - `dashboard/src/components/dashboard/AgentCard.tsx` exists
   - `dashboard/src/app/dashboard/page.tsx` exists (server component, no 'use client')
   - `dashboard/src/app/layout.tsx` includes Toaster
5. **Threshold correctness:**
   - formatUsdc(42_500_000) returns "42.50 USDC"
   - formatUsdc(100_000_000) returns "100 USDC"
   - pctUsed=0.49 -> green, pctUsed=0.50 -> yellow, pctUsed=0.80 -> red
</verification>

<success_criteria>
- `npm run build` in dashboard/ completes with zero errors
- All 9 new files exist at their specified paths
- Migration 004 contains get_agent_spend_summary function with correct SQL
- SpendProgressBar color-codes green (<50%), yellow (50-80%), red (>=80%)
- SpendAlertBadge shows destructive variant with AlertTriangle icon at >=80%
- SpendMonitor fires toast when crossing 80% threshold via realtime update
- Dashboard page at /dashboard renders responsive grid of AgentCards
- formatUsdc correctly converts micro-USDC to human-readable format
- No 'use client' on server components (dashboard/page.tsx, AgentCard.tsx if server-only)
- Realtime hook has proper cleanup (removeChannel on unmount)
</success_criteria>

<output>
After completion, create `.planning/phases/04-dashboard/04-05-SUMMARY.md`
</output>
