---
phase: 04-dashboard
plan: 02
type: execute
wave: 2
depends_on: ["04-01"]
files_modified:
  - dashboard/src/lib/types.ts
  - dashboard/src/lib/proxy.ts
  - dashboard/src/lib/utils.ts
  - dashboard/src/components/dashboard/AppSidebar.tsx
  - dashboard/src/components/dashboard/AgentCard.tsx
  - dashboard/src/app/dashboard/layout.tsx
  - dashboard/src/app/dashboard/loading.tsx
  - dashboard/src/app/dashboard/page.tsx
  - dashboard/src/app/dashboard/agents/[agentId]/page.tsx
  - dashboard/src/app/dashboard/agents/[agentId]/loading.tsx
  - dashboard/.env.example
autonomous: true
requirements: ["FR-7.4", "FR-7.9"]

must_haves:
  truths:
    - "Dashboard pages render behind auth wall with sidebar navigation"
    - "User sees a card grid of their agents with name, status badge, and owner address"
    - "Clicking an agent card navigates to /dashboard/agents/[agentId]"
    - "Agent detail page fetches rules + session keys in parallel and renders header with tabs stub"
    - "Layout is responsive: sidebar collapses on mobile, cards reflow to single column"
    - "Loading states show skeleton placeholders while data fetches"
  artifacts:
    - path: "dashboard/src/lib/types.ts"
      provides: "TypeScript types matching Rust proxy API response shapes"
      exports: ["Agent", "GuardrailRule", "RuleType", "SessionKey", "AuditLogEntry", "ApiResponse", "ApiListResponse"]
    - path: "dashboard/src/lib/proxy.ts"
      provides: "Server-side fetch wrappers for Rust proxy REST API"
      exports: ["getAgent", "getAgentRules", "getAgentSessionKeys"]
    - path: "dashboard/src/lib/utils.ts"
      provides: "formatUsdc and truncateAddress utility functions"
      contains: "formatUsdc"
    - path: "dashboard/src/components/dashboard/AppSidebar.tsx"
      provides: "Client-side sidebar with nav items and active state"
      contains: "use client"
    - path: "dashboard/src/components/dashboard/AgentCard.tsx"
      provides: "Server component card for agent display"
      contains: "AgentCard"
    - path: "dashboard/src/app/dashboard/layout.tsx"
      provides: "Dashboard shell with sidebar, header, and auth guard"
      contains: "verifySession"
    - path: "dashboard/src/app/dashboard/page.tsx"
      provides: "Agent overview page with card grid"
      contains: "AgentCard"
    - path: "dashboard/src/app/dashboard/agents/[agentId]/page.tsx"
      provides: "Agent detail page with parallel data fetch"
      contains: "Promise.all"
  key_links:
    - from: "dashboard/src/app/dashboard/layout.tsx"
      to: "dashboard/src/lib/dal.ts"
      via: "verifySession() auth guard import"
      pattern: "import.*verifySession.*from.*dal"
    - from: "dashboard/src/app/dashboard/page.tsx"
      to: "dashboard/src/lib/proxy.ts"
      via: "getAgent server-side fetch"
      pattern: "import.*from.*@/lib/proxy"
    - from: "dashboard/src/app/dashboard/agents/[agentId]/page.tsx"
      to: "dashboard/src/lib/proxy.ts"
      via: "parallel fetch of rules + session keys"
      pattern: "Promise\\.all.*getAgentRules.*getAgentSessionKeys"
    - from: "dashboard/src/components/dashboard/AgentCard.tsx"
      to: "dashboard/src/lib/types.ts"
      via: "Agent type import"
      pattern: "import.*Agent.*from.*@/lib/types"
    - from: "dashboard/src/components/dashboard/AppSidebar.tsx"
      to: "usePathname"
      via: "active nav item detection"
      pattern: "usePathname"
---

<objective>
Build the dashboard layout shell and agent overview pages.

Purpose: FR-7.4 (Agent status overview) and FR-7.9 (Responsive layout). This plan creates the foundational dashboard structure: sidebar navigation, typed proxy API client, utility functions, agent card grid on the overview page, and an agent detail page stub with parallel data fetching. All subsequent dashboard plans (guardrail CRUD, session key management, audit logs) build on this layout.

Output: Working dashboard layout with sidebar, agent overview grid, agent detail page stub, TypeScript types for all proxy API shapes, and server-side fetch wrappers.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-dashboard/RESEARCH-ui.md
@.planning/phases/04-dashboard/RESEARCH-auth.md

<interfaces>
<!-- Rust proxy API response shapes (extracted from proxy/src/handlers/ and proxy/src/models/) -->
<!-- The executor MUST match these exact shapes in dashboard/src/lib/types.ts -->

From proxy/src/models/agent.rs:
```rust
pub struct Agent {
    pub id: Uuid,
    pub name: String,
    pub owner_address: String,
    pub created_at: DateTime<Utc>,
    pub is_active: bool,
}
```

From proxy/src/models/guardrail.rs:
```rust
pub struct GuardrailRule {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub rule_type: RuleType,  // tagged enum: { type: "MaxSpendPerTx", params: { limit: u64 } }
    pub is_active: bool,
}

// serde(tag = "type", content = "params")
pub enum RuleType {
    MaxSpendPerTx { limit: u64 },
    MaxSpendPerDay { limit: u64 },
    AllowedContracts { addresses: Vec<String> },
    MaxLeverage { max: u32 },
    MaxSlippage { bps: u32 },
}
```

From proxy/src/models/session_key.rs:
```rust
pub struct SessionKey {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub public_key: String,
    pub max_spend: u64,
    pub spent: u64,
    pub allowed_contracts: Vec<String>,
    pub expires_at: DateTime<Utc>,
    pub is_revoked: bool,
    pub created_at: DateTime<Utc>,
}
```

From proxy/src/handlers/agents.rs:
```rust
// GET /api/v1/agents/:id -> AgentResponse
pub struct AgentResponse {
    pub success: bool,
    pub data: Option<Agent>,
    pub error: Option<String>,
}
```

From proxy/src/handlers/guardrail_rules.rs:
```rust
// GET /api/v1/agents/:agent_id/rules -> RulesListResponse
pub struct RulesListResponse {
    pub success: bool,
    pub data: Vec<GuardrailRule>,
}
```

From proxy/src/handlers/session_keys.rs:
```rust
// GET /api/v1/agents/:agent_id/session-keys -> SessionKeysListResponse
pub struct SessionKeysListResponse {
    pub success: bool,
    pub data: Vec<SessionKey>,
}
```

IMPORTANT: The proxy has NO "list all agents" endpoint. Only GET /agents/:id (single agent)
and find_by_owner (repo function, not exposed as HTTP handler). The overview page must
either query Supabase agents table directly, or the executor should add a simple list
endpoint. See Task 2 action for details.

From Plan 04-01 (auth — dependency):
```typescript
// dashboard/src/lib/dal.ts — provided by Plan 04-01
export async function verifySession(): Promise<{ user: User }>
// Redirects to / if no valid session. Call in every protected Server Component.

// dashboard/src/middleware.ts — provided by Plan 04-01
// Protects /dashboard/* routes, refreshes Supabase session cookies.

// dashboard/src/components/providers/ — provided by Plan 04-01
// Web3Providers wraps the app in root layout.
```

From existing dashboard/src/lib/utils.ts:
```typescript
export function cn(...inputs: ClassValue[]): string
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install shadcn components + create types + utilities</name>
  <files>
    dashboard/src/lib/types.ts
    dashboard/src/lib/utils.ts
    dashboard/.env.example
  </files>
  <action>
**Step 1: Install shadcn components.**
Run from `dashboard/` directory:
```bash
npx shadcn@latest add sidebar separator skeleton tabs tooltip sonner
```
This adds the shadcn Sidebar system (SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, SidebarInset, SidebarTrigger), Separator, Skeleton, Tabs (Tabs, TabsList, TabsTrigger, TabsContent), Tooltip (TooltipProvider, Tooltip, TooltipTrigger, TooltipContent), and Sonner (toast notifications). The Sidebar component requires a `SidebarProvider` wrapper and `SidebarInset` for the main content area.

**Step 2: Create `dashboard/src/lib/types.ts`.**
Define TypeScript types matching the Rust proxy API response shapes EXACTLY. The Rust API uses serde's `tag`/`content` adjacently-tagged enum for RuleType, which serializes as `{ "type": "MaxSpendPerTx", "params": { "limit": 1000000 } }`.

Types to define:
- `Agent`: `{ id: string; name: string; owner_address: string; created_at: string; is_active: boolean }`
  - Note: UUIDs serialize as strings in JSON. `created_at` is ISO 8601 string from chrono.
- `RuleType`: Discriminated union using `type` field:
  ```typescript
  type RuleType =
    | { type: 'MaxSpendPerTx'; params: { limit: number } }
    | { type: 'MaxSpendPerDay'; params: { limit: number } }
    | { type: 'AllowedContracts'; params: { addresses: string[] } }
    | { type: 'MaxLeverage'; params: { max: number } }
    | { type: 'MaxSlippage'; params: { bps: number } }
  ```
- `GuardrailRule`: `{ id: string; agent_id: string; rule_type: RuleType; is_active: boolean }`
- `SessionKey`: `{ id: string; agent_id: string; public_key: string; max_spend: number; spent: number; allowed_contracts: string[]; expires_at: string; is_revoked: boolean; created_at: string }`
  - Note: Rust u64 serializes as JSON number. JavaScript's `Number.MAX_SAFE_INTEGER` is 2^53 which covers USDC amounts (max ~9 trillion USDC in minor units). Safe for now.
- `AuditLogEntry`: `{ id: string; agent_id: string | null; session_key_id: string | null; event_type: AuditEventType; metadata: Record<string, unknown>; created_at: string }`
- `AuditEventType`: String literal union of all 14 event types from `proxy/src/models/audit_event.rs`
- `SpendSummary`: `{ agent_id: string; total_spent: number; daily_cap: number; percentage: number }` (computed client-side from rules + session keys, not a proxy endpoint)
- Generic API response wrappers:
  ```typescript
  interface ApiResponse<T> { success: boolean; data: T | null; error?: string }
  interface ApiListResponse<T> { success: boolean; data: T[] }
  ```

Export all types. All fields use `string` for UUIDs and ISO dates (not `Date` objects) to match JSON deserialization.

**Step 3: Add utilities to `dashboard/src/lib/utils.ts`.**
Append to the existing file (keep `cn` function):

- `formatUsdc(amount: number): string` -- Divides by 1_000_000 and formats with 2 decimal places. Returns `"0.00"` for 0. Uses `Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` for consistent formatting. Example: `formatUsdc(1500000)` returns `"1.50"`.
- `truncateAddress(address: string): string` -- For Ethereum addresses (0x prefix): returns `0x1234...5678` (first 6 + last 4 chars). For Solana addresses (no 0x prefix, base58): returns first 4 + `...` + last 4. Returns empty string for empty/undefined input. Guard against addresses shorter than 10 chars by returning the full address.

**Step 4: Create/update `dashboard/.env.example`.**
Create the file with:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# WalletConnect (required by RainbowKit)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id

# SIWE Authentication
SIWE_NONCE_SECRET=random-32-byte-hex
SUPABASE_WALLET_SECRET=random-32-byte-hex

# Rust Proxy API (server-side only, never exposed to browser)
PROXY_URL=http://localhost:3402
```
  </action>
  <verify>
    <automated>cd dashboard && npx shadcn@latest add sidebar separator skeleton tabs tooltip sonner --yes 2>&1 | tail -5 && node -e "const t = require('./src/lib/types.ts'); console.log('types ok')" 2>&1 || npx tsc --noEmit src/lib/types.ts src/lib/utils.ts 2>&1 | head -20</automated>
    Verify: `npx tsc --noEmit` passes for types.ts and utils.ts. The shadcn components exist in `dashboard/src/components/ui/sidebar.tsx`, `separator.tsx`, `skeleton.tsx`, `tabs.tsx`, `tooltip.tsx`, `sonner.tsx`. The `.env.example` file contains PROXY_URL.
  </verify>
  <done>
    - All 6 shadcn components installed in dashboard/src/components/ui/
    - types.ts exports Agent, GuardrailRule, RuleType, SessionKey, AuditLogEntry, AuditEventType, SpendSummary, ApiResponse, ApiListResponse
    - utils.ts exports formatUsdc and truncateAddress alongside existing cn
    - .env.example contains all required env vars including PROXY_URL
    - TypeScript compiles with no errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Proxy API client + layout shell + sidebar + loading states</name>
  <files>
    dashboard/src/lib/proxy.ts
    dashboard/src/components/dashboard/AppSidebar.tsx
    dashboard/src/app/dashboard/layout.tsx
    dashboard/src/app/dashboard/loading.tsx
    dashboard/src/app/dashboard/agents/[agentId]/loading.tsx
  </files>
  <action>
**Step 1: Create `dashboard/src/lib/proxy.ts`.**
Server-side-only fetch wrappers for the Rust proxy REST API. These functions use `cache` from `'react'` for request deduplication within a single server render pass.

```typescript
import { cache } from 'react'
import type { Agent, GuardrailRule, SessionKey, ApiResponse, ApiListResponse } from './types'

const PROXY_BASE = process.env.PROXY_URL ?? 'http://localhost:3402'
```

Functions to implement:

- `getAgent(agentId: string): Promise<Agent>` -- Fetches `GET ${PROXY_BASE}/api/v1/agents/${agentId}` with `{ cache: 'no-store' }`. Parses response as `ApiResponse<Agent>`. Throws if `!res.ok` or `!body.success` or `body.data` is null. Wrap with `cache()` for dedup.

- `getAgentRules(agentId: string): Promise<GuardrailRule[]>` -- Fetches `GET ${PROXY_BASE}/api/v1/agents/${agentId}/rules` with `{ cache: 'no-store' }`. Parses as `ApiListResponse<GuardrailRule>`. Returns `body.data`. Wrap with `cache()`.

- `getAgentSessionKeys(agentId: string): Promise<SessionKey[]>` -- Fetches `GET ${PROXY_BASE}/api/v1/agents/${agentId}/session-keys` with `{ cache: 'no-store' }`. Parses as `ApiListResponse<SessionKey>`. Returns `body.data`. Wrap with `cache()`.

IMPORTANT DESIGN NOTE on listing agents: The Rust proxy has NO "list all agents" endpoint. The overview page needs to show all agents owned by the logged-in wallet. Two approaches (executor should pick ONE):

**Option A (Recommended for MVP):** Query the Supabase `agents` table directly from the server component using the server Supabase client from Plan 04-01. The `agents` table has `owner_address` which matches the wallet address from the session. This avoids modifying the Rust proxy. Add a `getAgentsByOwner(ownerAddress: string): Promise<Agent[]>` function in proxy.ts that queries Supabase directly:
```typescript
import { createServerSupabaseClient } from './supabase-server' // from Plan 04-01
export async function getAgentsByOwner(ownerAddress: string): Promise<Agent[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, owner_address, is_active, created_at')
    .ilike('owner_address', ownerAddress)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to fetch agents: ${error.message}`)
  return data ?? []
}
```
Use `.ilike()` for case-insensitive Ethereum address matching (EIP-55 checksums).

**Option B:** If Plan 04-01's Supabase server client is not ready or the executor prefers proxy-only data flow, create a `getAgentsByOwner` that returns a hardcoded empty array with a TODO comment. The overview page should gracefully handle an empty agents list.

Error handling: All fetch wrappers should catch network errors and throw descriptive Error messages. Use `try/catch` in the server components that call these, rendering an error state.

**Step 2: Create `dashboard/src/components/dashboard/AppSidebar.tsx`.**
Mark as `'use client'` (uses `usePathname` hook).

Import from shadcn sidebar: `Sidebar`, `SidebarContent`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarHeader`.
Import from `lucide-react`: `LayoutDashboard`, `ScrollText` (for audit log).
Import `usePathname` from `next/navigation`.
Import `Link` from `next/link`.

Navigation items (array):
```typescript
const navItems = [
  { title: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Audit Log', href: '/dashboard/logs', icon: ScrollText },
]
```

Render a `<Sidebar>` with:
- `<SidebarHeader>` containing "x402Guard" branding text (text-lg font-bold).
- `<SidebarContent>` with a `<SidebarGroup>`:
  - `<SidebarGroupLabel>` "Navigation"
  - `<SidebarGroupContent>` with `<SidebarMenu>` mapping over navItems
  - Each item: `<SidebarMenuItem>` > `<SidebarMenuButton asChild isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}>` > `<Link href={item.href}>` > `<item.icon className="mr-2 h-4 w-4" />` + title
  - Active detection: exact match for `/dashboard`, startsWith for other routes

**Step 3: Create `dashboard/src/app/dashboard/layout.tsx`.**
This is a SERVER component (no 'use client'). It wraps all /dashboard/* pages.

```typescript
import { verifySession } from '@/lib/dal'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AppSidebar } from '@/components/dashboard/AppSidebar'
import { Toaster } from '@/components/ui/sonner'
```

The layout function:
1. Calls `await verifySession()` -- redirects to `/` if not authenticated (provided by Plan 04-01).
2. Returns JSX:
```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex-1" />
      {/* Wallet info placeholder — will be enhanced in later plans */}
      <span className="text-sm text-muted-foreground">x402Guard</span>
    </header>
    <main className="flex-1 p-4 md:p-6">
      {children}
    </main>
  </SidebarInset>
  <Toaster />
</SidebarProvider>
```

The `SidebarTrigger` automatically handles sidebar collapse on mobile. The `SidebarInset` provides the correct offset for the sidebar width.

**Step 4: Create `dashboard/src/app/dashboard/loading.tsx`.**
Skeleton loading state for the overview page:
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
```

**Step 5: Create `dashboard/src/app/dashboard/agents/[agentId]/loading.tsx`.**
Skeleton for agent detail page:
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function AgentDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  )
}
```

Create the directory structure as needed: `dashboard/src/app/dashboard/agents/[agentId]/`.
  </action>
  <verify>
    <automated>cd dashboard && npx tsc --noEmit 2>&1 | head -30</automated>
    Verify: TypeScript compiles with no errors. Files exist at all specified paths. The proxy.ts imports resolve. The layout.tsx imports verifySession from @/lib/dal (provided by Plan 04-01 dependency).
  </verify>
  <done>
    - proxy.ts exports getAgent, getAgentRules, getAgentSessionKeys, getAgentsByOwner with proper types and cache() wrapping
    - AppSidebar.tsx renders sidebar with Overview and Audit Log nav items, highlights active route
    - dashboard/layout.tsx calls verifySession(), wraps children in SidebarProvider + SidebarInset with header
    - Both loading.tsx files render skeleton placeholders
    - All imports resolve and TypeScript compiles
  </done>
</task>

<task type="auto">
  <name>Task 3: Agent overview page + agent detail page + AgentCard component</name>
  <files>
    dashboard/src/components/dashboard/AgentCard.tsx
    dashboard/src/app/dashboard/page.tsx
    dashboard/src/app/dashboard/agents/[agentId]/page.tsx
  </files>
  <action>
**Step 1: Create `dashboard/src/components/dashboard/AgentCard.tsx`.**
This is a SERVER component (no 'use client' directive needed). It renders an agent as a shadcn Card.

Props: `{ agent: Agent }` where Agent is from `@/lib/types`.

Imports:
- `Card`, `CardContent`, `CardHeader`, `CardTitle` from `@/components/ui/card`
- `Badge` from `@/components/ui/badge`
- `Agent` from `@/lib/types`
- `truncateAddress` from `@/lib/utils`
- `Link` from `next/link`

Render:
```tsx
<Link href={`/dashboard/agents/${agent.id}`} className="block">
  <Card className="transition-colors hover:bg-accent/50">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-base font-semibold">{agent.name}</CardTitle>
      <Badge variant={agent.is_active ? 'default' : 'secondary'}>
        {agent.is_active ? 'Active' : 'Inactive'}
      </Badge>
    </CardHeader>
    <CardContent>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Owner: {truncateAddress(agent.owner_address)}</p>
        <p>Created: {new Date(agent.created_at).toLocaleDateString()}</p>
      </div>
    </CardContent>
  </Card>
</Link>
```

Use `variant="default"` (green-ish in most shadcn themes) for active, `variant="secondary"` (gray) for inactive. The Card has a hover state via `hover:bg-accent/50` for clickability affordance.

**Step 2: Create `dashboard/src/app/dashboard/page.tsx`.**
SERVER component. This is the agent overview page.

```typescript
import { getAgentsByOwner } from '@/lib/proxy'
import { verifySession } from '@/lib/dal'
import { AgentCard } from '@/components/dashboard/AgentCard'
```

Implementation:
1. Call `const session = await verifySession()` to get the authenticated user.
2. Extract the wallet address from the session. Plan 04-01 stores it in `user.user_metadata.wallet_address`. Use: `const walletAddress = session.user.user_metadata?.wallet_address as string | undefined`.
3. If `walletAddress` is falsy, render an error message: "No wallet address found in session."
4. Call `const agents = await getAgentsByOwner(walletAddress)`.
5. Wrap in try/catch. On error, render a user-friendly error card.
6. Render:
```tsx
<div className="space-y-6">
  <div>
    <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
    <p className="text-muted-foreground">
      Monitor and manage your x402Guard agents.
    </p>
  </div>

  {agents.length === 0 ? (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-muted-foreground">
        No agents found. Create an agent via the proxy API to get started.
      </p>
    </div>
  ) : (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  )}
</div>
```

The grid is responsive: 1 column on mobile, 2 on md (768px), 3 on lg (1024px). This satisfies FR-7.9.

**Step 3: Create `dashboard/src/app/dashboard/agents/[agentId]/page.tsx`.**
SERVER component. Agent detail page stub.

CRITICAL Next.js 16 pattern: `params` is a `Promise` in Next.js 16 dynamic routes.

```typescript
import { getAgent, getAgentRules, getAgentSessionKeys } from '@/lib/proxy'
import { verifySession } from '@/lib/dal'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { truncateAddress, formatUsdc } from '@/lib/utils'
import type { Agent, GuardrailRule, SessionKey } from '@/lib/types'
```

Implementation:
1. `const { agentId } = await params` -- MUST await params (Next.js 16).
2. `await verifySession()`
3. Parallel fetch:
```typescript
const [agent, rules, sessionKeys] = await Promise.all([
  getAgent(agentId),
  getAgentRules(agentId),
  getAgentSessionKeys(agentId),
])
```
4. Render agent header:
```tsx
<div className="space-y-6">
  {/* Agent header */}
  <div className="flex items-center justify-between">
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
      <p className="text-sm text-muted-foreground">
        {truncateAddress(agent.owner_address)}
      </p>
    </div>
    <Badge variant={agent.is_active ? 'default' : 'secondary'} className="text-sm">
      {agent.is_active ? 'Active' : 'Inactive'}
    </Badge>
  </div>

  {/* Tabs stub — content filled in by later plans */}
  <Tabs defaultValue="rules">
    <TabsList>
      <TabsTrigger value="rules">
        Guardrail Rules ({rules.length})
      </TabsTrigger>
      <TabsTrigger value="keys">
        Session Keys ({sessionKeys.length})
      </TabsTrigger>
    </TabsList>
    <TabsContent value="rules" className="space-y-4">
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No guardrail rules configured.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex items-center justify-between py-3">
                <span className="text-sm font-medium">{rule.rule_type.type}</span>
                <Badge variant={rule.is_active ? 'outline' : 'secondary'}>
                  {rule.is_active ? 'Active' : 'Disabled'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </TabsContent>
    <TabsContent value="keys" className="space-y-4">
      {sessionKeys.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No session keys.
        </p>
      ) : (
        <div className="space-y-2">
          {sessionKeys.map((key) => (
            <Card key={key.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-mono">
                    {truncateAddress(key.public_key)}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatUsdc(key.spent)} / {formatUsdc(key.max_spend)} USDC
                  </span>
                </div>
                <Badge variant={key.is_revoked ? 'destructive' : 'outline'}>
                  {key.is_revoked ? 'Revoked' : 'Active'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </TabsContent>
  </Tabs>
</div>
```

The tabs show rules and session keys with counts. This is a "stub" in that later plans will add CRUD dialogs, but the data display is fully functional. The page uses parallel `Promise.all` for performance.

Add error handling: wrap the entire function body in try/catch. On fetch error, render a Card with the error message and a "Back to Overview" link.
  </action>
  <verify>
    <automated>cd dashboard && npx tsc --noEmit 2>&1 | head -30 && npm run build 2>&1 | tail -20</automated>
    Verify: TypeScript compiles. `npm run build` succeeds (or fails only on missing Plan 04-01 dependencies like verifySession/dal — acceptable since this plan depends on 04-01). All three files exist and export their components. The agent detail page uses `await params` (not synchronous params access). The overview page handles empty agent list gracefully.
  </verify>
  <done>
    - AgentCard renders agent name, status badge (Active/Inactive), truncated owner address, and created date
    - Clicking AgentCard navigates to /dashboard/agents/[agentId]
    - Overview page shows responsive grid (1/2/3 columns) of AgentCards
    - Overview page handles empty state with dashed-border placeholder
    - Agent detail page fetches agent + rules + session keys in parallel via Promise.all
    - Agent detail page renders header with name + badge + tabs (Guardrail Rules / Session Keys)
    - Both pages call verifySession() for auth protection
    - `npm run build` passes
  </done>
</task>

</tasks>

<verification>
After all 3 tasks complete:

1. **TypeScript compilation**: `cd dashboard && npx tsc --noEmit` passes with zero errors.
2. **Build**: `cd dashboard && npm run build` succeeds.
3. **File existence**: All files listed in files_modified exist.
4. **shadcn components**: `ls dashboard/src/components/ui/{sidebar,separator,skeleton,tabs,tooltip,sonner}.tsx` all exist.
5. **Types match Rust API**: `dashboard/src/lib/types.ts` exports Agent, GuardrailRule, RuleType, SessionKey, AuditLogEntry, ApiResponse, ApiListResponse — shapes match proxy/src/models/*.rs.
6. **Responsive layout**: dashboard/layout.tsx uses SidebarProvider + SidebarInset (auto-handles mobile).
7. **Parallel fetch**: agents/[agentId]/page.tsx contains `Promise.all`.
8. **Auth guard**: Both page.tsx files call `verifySession()`.
9. **Next.js 16 params**: agents/[agentId]/page.tsx uses `const { agentId } = await params`.
</verification>

<success_criteria>
- Dashboard layout renders: sidebar (Overview, Audit Log) + header with SidebarTrigger + main content area
- Agent overview page shows card grid fetched from data source (Supabase or proxy)
- Agent detail page shows agent header + tabs with rules and session keys counts
- All pages protected by verifySession() auth guard
- Types in types.ts exactly match Rust proxy API JSON response shapes
- formatUsdc(1500000) returns "1.50", truncateAddress("0x1234567890abcdef1234567890abcdef12345678") returns "0x1234...5678"
- Responsive: cards reflow 3->2->1 columns, sidebar collapses on mobile
- Loading skeletons display while data fetches
- npm run build succeeds with zero errors
</success_criteria>

<output>
After completion, create `.planning/phases/04-dashboard/04-02-SUMMARY.md`
</output>
