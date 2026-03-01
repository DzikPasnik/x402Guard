---
phase: 04-dashboard
plan: 04
type: execute
wave: 2
depends_on: ["04-02"]
files_modified:
  - dashboard/src/lib/audit-queries.ts
  - dashboard/src/components/audit/EventTypeBadge.tsx
  - dashboard/src/components/audit/MetadataViewer.tsx
  - dashboard/src/components/audit/DateRangePicker.tsx
  - dashboard/src/components/audit/AuditLogFilters.tsx
  - dashboard/src/components/audit/AuditLogTable.tsx
  - dashboard/src/app/dashboard/logs/page.tsx
  - dashboard/src/app/dashboard/logs/loading.tsx
  - dashboard/package.json
autonomous: true
requirements: ["FR-6.5", "FR-7.3"]

must_haves:
  truths:
    - "User can view a table of audit log events sorted by most recent first"
    - "User can filter audit logs by agent, event type(s), and date range"
    - "User can paginate through audit log results (25 rows per page)"
    - "User can expand metadata for any audit log row to see full JSON"
    - "Each event type is visually distinguishable via color-coded badge"
  artifacts:
    - path: "dashboard/src/lib/audit-queries.ts"
      provides: "AuditEventType union, AuditLogFilters interface, AuditRow interface, fetchAuditLog function"
      exports: ["AuditEventType", "AuditLogFilters", "AuditRow", "fetchAuditLog"]
    - path: "dashboard/src/components/audit/EventTypeBadge.tsx"
      provides: "Color-coded badge for all 14 event types"
      exports: ["EventTypeBadge", "EVENT_COLORS", "EVENT_LABELS"]
    - path: "dashboard/src/components/audit/MetadataViewer.tsx"
      provides: "Expandable JSON metadata display"
      exports: ["MetadataViewer"]
    - path: "dashboard/src/components/audit/DateRangePicker.tsx"
      provides: "Calendar-based date range picker in popover"
      exports: ["DateRangePicker"]
    - path: "dashboard/src/components/audit/AuditLogFilters.tsx"
      provides: "Filter bar with agent, event type, date range controls"
      exports: ["AuditLogFilters"]
    - path: "dashboard/src/components/audit/AuditLogTable.tsx"
      provides: "TanStack Table v8 with sorting, filtering, pagination"
      exports: ["AuditLogTable"]
    - path: "dashboard/src/app/dashboard/logs/page.tsx"
      provides: "Audit log page at /dashboard/logs"
    - path: "dashboard/src/app/dashboard/logs/loading.tsx"
      provides: "Skeleton loading state"
  key_links:
    - from: "dashboard/src/components/audit/AuditLogTable.tsx"
      to: "dashboard/src/lib/audit-queries.ts"
      via: "imports AuditRow type + fetchAuditLog for client-side refetching"
      pattern: "import.*from.*@/lib/audit-queries"
    - from: "dashboard/src/components/audit/AuditLogTable.tsx"
      to: "dashboard/src/components/audit/EventTypeBadge.tsx"
      via: "renders EventTypeBadge in event_type column cell"
      pattern: "EventTypeBadge"
    - from: "dashboard/src/components/audit/AuditLogTable.tsx"
      to: "dashboard/src/components/audit/MetadataViewer.tsx"
      via: "renders MetadataViewer in metadata column cell"
      pattern: "MetadataViewer"
    - from: "dashboard/src/app/dashboard/logs/page.tsx"
      to: "dashboard/src/lib/audit-queries.ts"
      via: "server-side initial fetch with fetchAuditLog"
      pattern: "fetchAuditLog"
    - from: "dashboard/src/components/audit/AuditLogFilters.tsx"
      to: "dashboard/src/components/audit/DateRangePicker.tsx"
      via: "renders DateRangePicker as one of the filter controls"
      pattern: "DateRangePicker"
    - from: "dashboard/src/lib/audit-queries.ts"
      to: "@supabase/supabase-js"
      via: "supabase.from('audit_log').select() with cursor pagination"
      pattern: "supabase.*from.*audit_log"
---

<objective>
Build the Audit Log Viewer for the x402Guard dashboard -- a filterable, paginated table of all audit events (proxy requests, guardrail violations, session key lifecycle, Solana events).

Purpose: Enables users to inspect every action the proxy has taken on their behalf, query by agent/event type/date range, and drill into event metadata. This is the primary observability tool for DeFi agent owners (FR-6.5: audit log queryable by agent, time range, event type; FR-7.3: transaction log viewer with filtering).

Output: 8 new files (1 query lib + 5 components + 1 page + 1 loading skeleton), plus 3 npm deps and 4 shadcn components installed.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/04-dashboard/RESEARCH-monitoring.md

@dashboard/package.json
@dashboard/components.json
@dashboard/src/lib/supabase.ts
@dashboard/src/lib/utils.ts
@dashboard/src/components/ui/table.tsx
@dashboard/src/components/ui/badge.tsx
@proxy/migrations/002_create_audit_log.sql
@proxy/migrations/003_add_solana_event_types.sql

<interfaces>
<!-- Existing Supabase client -->
From dashboard/src/lib/supabase.ts:
```typescript
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

From dashboard/src/lib/utils.ts:
```typescript
export function cn(...inputs: ClassValue[]): string
```

<!-- Existing shadcn components available -->
From dashboard/src/components/ui/:
- alert.tsx, badge.tsx (with Badge, badgeVariants), button.tsx, card.tsx, input.tsx, table.tsx (Table, TableHeader, TableBody, TableRow, TableHead, TableCell)

<!-- DB schema for audit_log -->
From proxy/migrations/002_create_audit_log.sql + 003_add_solana_event_types.sql:
```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    session_key_id UUID REFERENCES session_keys(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_log_event_type_check CHECK (event_type IN (
        'proxy_request_received', 'proxy_request_forwarded', 'proxy_request_failed',
        'guardrail_violation', 'session_key_created', 'session_key_used',
        'session_key_revoked', 'all_session_keys_revoked', 'agent_created',
        'agent_deactivated', 'solana_vault_queried', 'solana_withdraw_submitted',
        'solana_withdraw_confirmed', 'solana_withdraw_failed'
    ))
);
-- Indexes: (agent_id, created_at DESC), (event_type, created_at DESC), (session_key_id partial)
-- Immutability trigger: BEFORE UPDATE OR DELETE raises exception
```

<!-- agents table for agent dropdown -->
From proxy/migrations/001_create_tables.sql:
```sql
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install dependencies and shadcn components</name>
  <files>dashboard/package.json</files>
  <action>
Run all commands from the `dashboard/` directory.

1. Install npm dependencies:
```bash
cd D:/x402Guard/dashboard && npm install @tanstack/react-table date-fns react-day-picker
```
- `@tanstack/react-table` — TanStack Table v8 for client-side sorting, filtering, pagination
- `date-fns` — date formatting for the date range picker and timestamp display
- `react-day-picker` — peer dependency for shadcn Calendar component

2. Install shadcn UI components:
```bash
cd D:/x402Guard/dashboard && npx shadcn@latest add select popover calendar progress dropdown-menu
```
- `select` — agent filter dropdown
- `popover` — date range picker wrapper
- `calendar` — date range picker (uses react-day-picker internally)
- `progress` — reusable (other plans may need it too)
- `dropdown-menu` — event type multi-select with checkboxes

Verify all 5 shadcn components landed in `dashboard/src/components/ui/`: select.tsx, popover.tsx, calendar.tsx, progress.tsx, dropdown-menu.tsx.

Do NOT install recharts or chart -- those are for the spend monitoring plan, not this one.
  </action>
  <verify>
    <automated>cd D:/x402Guard/dashboard && node -e "require('@tanstack/react-table'); require('date-fns'); require('react-day-picker'); console.log('deps OK')" && ls src/components/ui/select.tsx src/components/ui/popover.tsx src/components/ui/calendar.tsx src/components/ui/progress.tsx src/components/ui/dropdown-menu.tsx && echo "shadcn OK"</automated>
  </verify>
  <done>package.json has @tanstack/react-table, date-fns, react-day-picker. Five shadcn components exist in src/components/ui/.</done>
</task>

<task type="auto">
  <name>Task 2: Create audit query layer and all audit components</name>
  <files>
    dashboard/src/lib/audit-queries.ts
    dashboard/src/components/audit/EventTypeBadge.tsx
    dashboard/src/components/audit/MetadataViewer.tsx
    dashboard/src/components/audit/DateRangePicker.tsx
    dashboard/src/components/audit/AuditLogFilters.tsx
    dashboard/src/components/audit/AuditLogTable.tsx
    dashboard/src/app/dashboard/logs/page.tsx
    dashboard/src/app/dashboard/logs/loading.tsx
  </files>
  <action>
Create 8 files. All file paths are relative to `dashboard/src/`. Ensure directories `components/audit/` and `app/dashboard/logs/` exist before writing.

**File 1: `lib/audit-queries.ts`** (no 'use client' -- usable from both server and client)

Types and query function for the audit_log Supabase table.

```typescript
import { supabase } from './supabase'

// All 14 event types matching the DB CHECK constraint exactly.
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

// Exhaustive list for use in filter UIs.
export const ALL_EVENT_TYPES: readonly AuditEventType[] = [
  'proxy_request_received', 'proxy_request_forwarded', 'proxy_request_failed',
  'guardrail_violation', 'session_key_created', 'session_key_used',
  'session_key_revoked', 'all_session_keys_revoked', 'agent_created',
  'agent_deactivated', 'solana_vault_queried', 'solana_withdraw_submitted',
  'solana_withdraw_confirmed', 'solana_withdraw_failed',
] as const

export interface AuditLogFilters {
  agentId?: string
  eventTypes?: AuditEventType[]
  fromDate?: string   // ISO 8601 e.g. "2026-03-01T00:00:00Z"
  toDate?: string     // ISO 8601
  cursorId?: string   // UUID of last row on current page (for next-page)
  pageSize?: number   // default 25
}

export interface AuditRow {
  id: string
  agent_id: string | null
  session_key_id: string | null
  event_type: AuditEventType
  metadata: Record<string, unknown>
  created_at: string
}

export interface AuditPage {
  rows: AuditRow[]
  hasNextPage: boolean
}
```

The `fetchAuditLog` function:
- Builds a Supabase query on `audit_log` table
- Selects: `id, agent_id, session_key_id, event_type, metadata, created_at`
- Orders by `created_at DESC`, then `id DESC` (composite cursor)
- Applies `.eq('agent_id', agentId)` if agentId provided
- Applies `.in('event_type', eventTypes)` if eventTypes is non-empty array
- Applies `.gte('created_at', fromDate)` if fromDate provided
- Applies `.lte('created_at', toDate)` if toDate provided
- Uses `.limit(pageSize + 1)` -- fetch one extra to detect hasNextPage
- For cursor pagination: if cursorId provided, first fetch the cursor row's `created_at` from `audit_log` via `.eq('id', cursorId).single()`. Then use `.or()` filter: `created_at.lt.{cursorCreatedAt},and(created_at.eq.{cursorCreatedAt},id.lt.{cursorId})`
- Returns `AuditPage`: if data.length > pageSize, pop the last row and set hasNextPage=true; else hasNextPage=false
- On Supabase error, throw `new Error('Audit log query failed: ' + error.message)`

Also export `fetchAgents` function:
- `supabase.from('agents').select('id, name, is_active').order('created_at', { ascending: true })`
- Returns `Array<{ id: string; name: string; is_active: boolean }>`
- Used by the filter dropdown to list available agents

**File 2: `components/audit/EventTypeBadge.tsx`** (no 'use client' needed -- pure render)

Uses the Badge-like styling but with per-event-type colors. Export two maps:

`EVENT_COLORS` — Record<AuditEventType, string> mapping each of the 14 types to Tailwind classes for light+dark mode:
- proxy_request_received: blue-100/blue-800 + dark:blue-900/blue-200
- proxy_request_forwarded: green-100/green-800 + dark:green-900/green-200
- proxy_request_failed: red-100/red-800 + dark:red-900/red-200
- guardrail_violation: orange-100/orange-800 + dark:orange-900/orange-200
- session_key_created: purple-100/purple-800 + dark:purple-900/purple-200
- session_key_used: indigo-100/indigo-800 + dark:indigo-900/indigo-200
- session_key_revoked: gray-100/gray-800 + dark:gray-700/gray-200
- all_session_keys_revoked: red-100/red-900 + dark:red-900/red-100
- agent_created: teal-100/teal-800 + dark:teal-900/teal-200
- agent_deactivated: gray-100/gray-600 + dark:gray-800/gray-400
- solana_vault_queried: violet-100/violet-800 + dark:violet-900/violet-200
- solana_withdraw_submitted: amber-100/amber-800 + dark:amber-900/amber-200
- solana_withdraw_confirmed: green-100/green-800 + dark:green-900/green-200
- solana_withdraw_failed: red-100/red-800 + dark:red-900/red-200

`EVENT_LABELS` — Record<AuditEventType, string> mapping to short human-readable labels:
- proxy_request_received -> "Request In"
- proxy_request_forwarded -> "Forwarded"
- proxy_request_failed -> "Failed"
- guardrail_violation -> "Violation"
- session_key_created -> "Key Created"
- session_key_used -> "Key Used"
- session_key_revoked -> "Key Revoked"
- all_session_keys_revoked -> "All Revoked"
- agent_created -> "Agent Created"
- agent_deactivated -> "Deactivated"
- solana_vault_queried -> "Vault Query"
- solana_withdraw_submitted -> "SOL Submit"
- solana_withdraw_confirmed -> "SOL Confirmed"
- solana_withdraw_failed -> "SOL Failed"

`EventTypeBadge` component: takes `{ eventType: AuditEventType }` prop. Renders a `<span>` with `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium` plus the color from EVENT_COLORS, containing EVENT_LABELS[eventType].

**File 3: `components/audit/MetadataViewer.tsx`** ('use client')

Expandable JSON metadata display.

Props: `{ metadata: Record<string, unknown> }`

Logic:
- If `Object.keys(metadata).length === 0`, render `<span className="text-muted-foreground text-xs">--</span>`
- Show summary: first 3 keys as `key: JSON.stringify(value)` joined with comma, truncated to 200px max-width via `truncate`
- Toggle button using `ChevronDown`/`ChevronUp` from lucide-react (size-3, ghost variant, h-5 w-5 p-0)
- When expanded, show `<pre>` with `JSON.stringify(metadata, null, 2)` in `text-xs bg-muted p-2 rounded overflow-auto max-h-40 font-mono`
- Use `useState(false)` for expansion state
- Import Button from `@/components/ui/button`

**File 4: `components/audit/DateRangePicker.tsx`** ('use client')

Shadcn Calendar in a Popover with `mode="range"`.

Props:
- `value?: DateRange` (from `react-day-picker`)
- `onChange: (range: DateRange | undefined) => void`

Implementation:
- `useState(false)` for popover open state
- `Popover` + `PopoverTrigger` + `PopoverContent` from `@/components/ui/popover`
- Trigger is a `Button variant="outline"` with CalendarIcon (lucide-react), width `w-[240px]`
- Display logic: if no value or no from, show "Select date range"; if from but no to, show `format(from, 'MMM d, yyyy')`; if both, show `format(from, 'MMM d') + ' - ' + format(to, 'MMM d, yyyy')`
- Calendar: `mode="range"`, `selected={value}`, `onSelect={onChange}`, `numberOfMonths={2}`, `disabled={{ after: new Date() }}` (prevent future dates)
- Use `format` from `date-fns`
- Use `cn` from `@/lib/utils` for conditional muted text class

**File 5: `components/audit/AuditLogFilters.tsx`** ('use client')

Filter bar component with 3 controls and a clear button.

Props:
- `agents: Array<{ id: string; name: string; is_active: boolean }>` -- passed from page
- `value: AuditLogFilters` -- current filter state
- `onChange: (filters: AuditLogFilters) => void` -- callback to update filters

Layout: horizontal flex row with gap-3, items-center, flex-wrap for responsive.

Controls:
1. **Agent Select** -- shadcn Select component. Options: "All Agents" (value=""), plus one option per agent showing `agent.name` (dimmed "(inactive)" suffix if !is_active). On change, call `onChange({ ...value, agentId: selected || undefined, cursorId: undefined })` (reset cursor on filter change).

2. **Event Type multi-select** -- DropdownMenu with DropdownMenuCheckboxItem for each of the 14 types. Trigger shows "Event Types" + count badge if any selected. Each checkbox toggles the type in/out of `value.eventTypes`. On toggle, reset cursorId. Use `EVENT_LABELS` from EventTypeBadge for display names.

3. **DateRangePicker** -- the DateRangePicker component. On change, convert DateRange to ISO strings for fromDate/toDate in the filters. Reset cursorId on change.

4. **Clear button** -- small ghost button with X icon, visible only when any filter is active. Resets all filters to empty/undefined.

**File 6: `components/audit/AuditLogTable.tsx`** ('use client')

TanStack Table v8 with the shadcn Table primitives.

Props:
- `initialData: AuditPage` -- server-fetched first page
- `agents: Array<{ id: string; name: string; is_active: boolean }>` -- for filter dropdown

State:
- `filters: AuditLogFilters` via useState (initial: `{ pageSize: 25 }`)
- `data: AuditPage` via useState (initial: `initialData`)
- `cursorStack: string[]` via useState (initial: `[]`) -- stack of cursor IDs for "previous page"
- `isLoading: boolean` via useState

Column definitions (useReactTable with getCoreRowModel, getSortedRowModel):
1. **Timestamp** -- accessor: `created_at`. Cell: format with `date-fns` as `format(new Date(row.created_at), 'MMM d, HH:mm:ss')`. Sortable.
2. **Event** -- accessor: `event_type`. Cell: `<EventTypeBadge eventType={row.event_type} />`.
3. **Agent** -- accessor: `agent_id`. Cell: look up agent name from agents prop, show name or truncated UUID (`id.slice(0, 8) + '...'`) if not found. Show "--" if null.
4. **Session Key** -- accessor: `session_key_id`. Cell: truncated UUID or "--" if null.
5. **Metadata** -- accessor: `metadata`. Cell: `<MetadataViewer metadata={row.metadata} />`. Not sortable.

Pagination controls below the table:
- "Previous" button (disabled when cursorStack is empty)
- "Next" button (disabled when !data.hasNextPage)
- Row count display: "Showing {data.rows.length} rows"

On filter change from AuditLogFilters:
- Reset cursorStack to []
- Call `fetchAuditLog(newFilters)` and update data state
- Set isLoading during fetch

On "Next":
- Push current first-row ID onto cursorStack
- Call `fetchAuditLog({ ...filters, cursorId: lastRowId })` where lastRowId is the id of the last row in current data.rows
- Update data state

On "Previous":
- Pop the last cursor from cursorStack
- Call `fetchAuditLog({ ...filters, cursorId: poppedCursor || undefined })`
- Update data state

Render using the shadcn Table components (Table, TableHeader, TableBody, TableRow, TableHead, TableCell) with `flexRender` from @tanstack/react-table for cells.

Show a `<div className="flex items-center justify-center py-8 text-muted-foreground">` with "No audit events found" when data.rows is empty.

**File 7: `app/dashboard/logs/page.tsx`** (Server Component -- NO 'use client')

The audit log page rendered at route `/dashboard/logs`.

```typescript
import { fetchAuditLog, fetchAgents } from '@/lib/audit-queries'
import { AuditLogTable } from '@/components/audit/AuditLogTable'

export const metadata = { title: 'Audit Log | x402Guard' }

export default async function AuditLogPage() {
  // Parallel fetch: initial audit data + agent list
  const [initialData, agents] = await Promise.all([
    fetchAuditLog({ pageSize: 25 }),
    fetchAgents(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-sm">
          Inspect proxy requests, guardrail violations, session key events, and Solana operations.
        </p>
      </div>
      <AuditLogTable initialData={initialData} agents={agents} />
    </div>
  )
}
```

Note: The page is a server component that fetches initial data, then hands off to the client-side AuditLogTable for interactivity (filtering, pagination, sorting).

**File 8: `app/dashboard/logs/loading.tsx`** (Server Component)

Skeleton loading state. Show:
- A shimmer div for the title area (h-8 w-48 bg-muted rounded animate-pulse)
- A shimmer div for the subtitle (h-4 w-96 bg-muted rounded animate-pulse mt-2)
- A shimmer div for filters bar (h-10 w-full bg-muted rounded animate-pulse mt-6)
- 5 skeleton table rows: each is `h-12 w-full bg-muted rounded animate-pulse mt-2`

Wrap all in `<div className="space-y-6">`.

**IMPORTANT implementation notes:**
- Do NOT use `zod` for filter validation in this plan -- filters are internal state, not user text input. Zod is overkill here.
- The existing `supabase` client from `@/lib/supabase.ts` uses the anon key. This works from both server components (Next.js server-side) and client components. If RLS is enabled on audit_log, queries may return empty -- that is a deployment concern, not a code concern.
- Import `type { DateRange }` from `react-day-picker` (type-only import).
- All `'use client'` directives go on the FIRST line of the file, before any imports.
- Use `@/` import alias (configured in tsconfig.json paths).
  </action>
  <verify>
    <automated>cd D:/x402Guard/dashboard && npx tsc --noEmit 2>&1 | head -30 && npm run build 2>&1 | tail -20</automated>
  </verify>
  <done>
All 8 files exist and compile. `npm run build` succeeds. The /dashboard/logs route renders with:
- Server-fetched initial audit data in a TanStack Table
- Agent dropdown filter, event type multi-select, date range picker
- Cursor-based pagination with Previous/Next buttons
- Color-coded EventTypeBadge for each of 14 event types
- Expandable MetadataViewer for JSONB metadata
- Skeleton loading.tsx for Suspense boundary
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. **Build passes:**
   ```bash
   cd D:/x402Guard/dashboard && npm run build
   ```
   Must exit 0 with no TypeScript errors.

2. **Route exists:** The build output should list `/dashboard/logs` as a route.

3. **Dependencies present:**
   ```bash
   cd D:/x402Guard/dashboard && node -e "
     const pkg = require('./package.json');
     const deps = ['@tanstack/react-table', 'date-fns', 'react-day-picker'];
     deps.forEach(d => { if (!pkg.dependencies[d]) throw new Error(d + ' missing') });
     console.log('All deps present');
   "
   ```

4. **All files exist:**
   ```bash
   ls D:/x402Guard/dashboard/src/lib/audit-queries.ts \
      D:/x402Guard/dashboard/src/components/audit/EventTypeBadge.tsx \
      D:/x402Guard/dashboard/src/components/audit/MetadataViewer.tsx \
      D:/x402Guard/dashboard/src/components/audit/DateRangePicker.tsx \
      D:/x402Guard/dashboard/src/components/audit/AuditLogFilters.tsx \
      D:/x402Guard/dashboard/src/components/audit/AuditLogTable.tsx \
      D:/x402Guard/dashboard/src/app/dashboard/logs/page.tsx \
      D:/x402Guard/dashboard/src/app/dashboard/logs/loading.tsx
   ```

5. **Key type exports:**
   ```bash
   cd D:/x402Guard/dashboard && grep -c "export" src/lib/audit-queries.ts
   ```
   Should show at least 6 exports (AuditEventType, ALL_EVENT_TYPES, AuditLogFilters, AuditRow, AuditPage, fetchAuditLog, fetchAgents).
</verification>

<success_criteria>
- `npm run build` in dashboard/ exits 0
- /dashboard/logs route is in the build output
- AuditLogTable renders with 5 columns: Timestamp, Event, Agent, Session Key, Metadata
- Cursor-based pagination (25 rows/page) with Previous/Next buttons
- Three working filter controls: Agent select, Event Type multi-select, Date Range picker
- All 14 event types have unique color-coded badges
- MetadataViewer shows summary (3 keys) with expand/collapse toggle
- Loading skeleton renders during Suspense
</success_criteria>

<output>
After completion, create `.planning/phases/04-dashboard/04-04-SUMMARY.md`
</output>
