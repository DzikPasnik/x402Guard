# Phase 4: Dashboard — UI Research

**Researched:** 2026-03-01
**Domain:** Next.js 16.1.6 App Router, shadcn/ui, Supabase Realtime, React 19
**Confidence:** HIGH (Next.js docs current as of 2026-02-27; Supabase Realtime from training data, MEDIUM)

---

## Summary

x402Guard's Phase 4 dashboard is a desktop-first admin UI for a DeFi proxy. The existing skeleton already has Next.js 16.1.6 (App Router), Tailwind 4, shadcn/ui 3.x (with `radix-ui` package, not the older `@radix-ui/*` packages), React 19, and `@supabase/supabase-js` 2.97. The Rust proxy at `localhost:3402` exposes a REST API; the dashboard must call it for CRUD operations while Supabase is used for auth and realtime data.

The dominant architecture for this use case is: **Server Components fetch initial data** from the Rust proxy (or Supabase), **Client Components handle realtime subscriptions** via Supabase Realtime, and **Server Actions handle all mutations** (create/delete guardrail rules, session keys, agents). SWR or TanStack Query for client-side cache/polling is overkill here — Supabase Realtime covers the live updates, and Server Actions + `revalidatePath` handle post-mutation refresh.

The shadcn/ui DataTable pattern (using `@tanstack/react-table` v8) is the correct approach for the transaction log and audit log tables. shadcn/ui provides the column-definition scaffolding; TanStack Table v8 handles client-side sorting, filtering, and pagination state. This is NOT server-side pagination for this phase (dataset sizes don't warrant it yet).

**Primary recommendation:** Use Server Components + `fetch { cache: 'no-store' }` for initial data load from the proxy REST API, Supabase Realtime channels for live spend/audit updates, and Server Actions with `revalidatePath` for all mutations.

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.1.6 | Framework + App Router | Already installed, current as of 2026-02 |
| react | 19.2.3 | UI runtime | Required by next 16 |
| tailwindcss | ^4 | Utility CSS | Already configured via `@import "tailwindcss"` |
| shadcn/ui | ^3.8.5 | Component library CLI | Already present, uses new `radix-ui` monorepo package |
| radix-ui | ^1.4.3 | Primitive components | New unified package (not old `@radix-ui/react-*` split) |
| @supabase/supabase-js | ^2.97.0 | Auth + Realtime + DB | Already installed |
| lucide-react | ^0.575.0 | Icons | Already installed, used by shadcn |
| class-variance-authority | ^0.7.1 | Variant styles | Already installed |

### Needs to be added

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-table | ^8.21 | Headless table state | DataTable for audit log / transaction log |
| zod | ^3.24 | Form validation | Guardrail rule forms, session key forms |
| @supabase/ssr | ^0.6 | Server-side Supabase client | Auth cookies in Server Components / middleware |
| wagmi | ^2.14 | Ethereum wallet state | Wallet connect for auth |
| viem | ^2.21 | EVM types | Required by wagmi |
| @rainbow-me/rainbowkit | ^2.2 | Wallet connect UI | Sign-in with Ethereum UI |

### Components needed from shadcn/ui CLI

Add via `npx shadcn@latest add <component>`:

| Component | Command | Purpose |
|-----------|---------|---------|
| dialog | `shadcn add dialog` | Create/edit forms |
| sheet | `shadcn add sheet` | Mobile sidebar drawer |
| toast (sonner) | `shadcn add sonner` | Action confirmations |
| alert-dialog | `shadcn add alert-dialog` | Destructive action confirmation (revoke) |
| select | `shadcn add select` | Rule type selector |
| switch | `shadcn add switch` | Toggle active/inactive |
| slider | `shadcn add slider` | MaxLeverage/MaxSlippage inputs |
| tabs | `shadcn add tabs` | Agent detail view |
| sidebar | `shadcn add sidebar` | Navigation sidebar |
| progress | `shadcn add progress` | Spend limit progress bar |
| tooltip | `shadcn add tooltip` | Limit alert indicators |
| separator | `shadcn add separator` | Layout dividers |
| skeleton | `shadcn add skeleton` | Loading states |
| form | `shadcn add form` | react-hook-form integration |
| dropdown-menu | `shadcn add dropdown-menu` | Row actions in tables |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tanstack/react-table | plain HTML table | TanStack Table handles sort/filter/pagination state; worth the dep |
| Supabase Realtime | polling every 5s | Realtime is more responsive and already in supabase-js |
| Server Actions | API route handlers | Server Actions integrate with revalidatePath and form state; simpler |
| wagmi/RainbowKit | privy or dynamic.xyz | wagmi is standard, free, no API key required |

**Installation:**

```bash
cd dashboard
npm install @tanstack/react-table zod @supabase/ssr
npm install wagmi viem @rainbow-me/rainbowkit
npx shadcn@latest add dialog sheet sonner alert-dialog select switch slider tabs sidebar progress tooltip separator skeleton form dropdown-menu
```

---

## Architecture Patterns

### Recommended Project Structure

```
dashboard/src/
├── app/
│   ├── layout.tsx               # Root layout: providers, fonts
│   ├── page.tsx                 # Landing / redirect to /dashboard
│   ├── login/
│   │   └── page.tsx             # Wallet connect sign-in page
│   └── dashboard/
│       ├── layout.tsx           # Dashboard shell: sidebar + header
│       ├── loading.tsx          # Skeleton while data loads
│       ├── page.tsx             # Agent overview (Server Component)
│       ├── agents/
│       │   └── [agentId]/
│       │       ├── page.tsx     # Agent detail (Server Component)
│       │       └── loading.tsx
│       ├── logs/
│       │   └── page.tsx         # Audit log viewer (Server Component)
│       └── actions.ts           # All Server Actions for this phase
├── components/
│   ├── ui/                      # shadcn/ui primitives (already exists)
│   ├── dashboard/
│   │   ├── AppSidebar.tsx       # Sidebar navigation (Client Component)
│   │   ├── AgentCard.tsx        # Agent status card (Server Component)
│   │   ├── SpendMonitor.tsx     # Realtime spend bar (Client Component)
│   │   ├── GuardrailTable.tsx   # Rules list (Server Component)
│   │   ├── SessionKeyTable.tsx  # Keys list (Server Component)
│   │   ├── AuditLogTable.tsx    # Audit log DataTable (Client Component)
│   │   ├── CreateRuleDialog.tsx # Create rule form (Client Component)
│   │   ├── CreateKeyDialog.tsx  # Create session key form (Client Component)
│   │   └── RevokeAllButton.tsx  # Revoke all (Client Component)
│   └── providers/
│       ├── QueryProvider.tsx    # (only if TanStack Query added)
│       ├── WalletProvider.tsx   # wagmi + RainbowKit config
│       └── SupabaseProvider.tsx # Supabase client context
├── lib/
│   ├── proxy.ts                 # fetch wrappers for Rust proxy API
│   ├── supabase.ts              # Browser client (already exists)
│   ├── supabase-server.ts       # Server client (needs adding)
│   ├── dal.ts                   # Data Access Layer + verifySession
│   └── utils.ts                 # cn() (already exists)
└── middleware.ts                # Route protection via session cookie
```

### Pattern 1: Server Component Data Fetching from Rust Proxy

The proxy API at `localhost:3402` is NOT available from the browser (CORS, internal network). Call it only from Server Components or Server Actions running on the Next.js server.

**What:** Async Server Components call proxy REST endpoints directly.
**When to use:** All initial page loads — agent list, rule list, session key list.

```typescript
// dashboard/src/lib/proxy.ts
import { cache } from 'react'

const PROXY_BASE = process.env.PROXY_URL ?? 'http://localhost:3402'

export const getAgentRules = cache(async (agentId: string) => {
  const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/rules`, {
    cache: 'no-store', // always fresh — dashboard is a dynamic app
  })
  if (!res.ok) throw new Error(`Failed to fetch rules: ${res.status}`)
  return res.json() as Promise<GuardrailRule[]>
})

export const getAgentSessionKeys = cache(async (agentId: string) => {
  const res = await fetch(
    `${PROXY_BASE}/api/v1/agents/${agentId}/session-keys`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch session keys: ${res.status}`)
  return res.json() as Promise<SessionKey[]>
})
```

```typescript
// dashboard/src/app/dashboard/agents/[agentId]/page.tsx
import { getAgentRules, getAgentSessionKeys } from '@/lib/proxy'
import { verifySession } from '@/lib/dal'

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>
}) {
  const { agentId } = await params
  await verifySession() // redirect to /login if not authenticated

  // Parallel fetch — do not await sequentially
  const [rules, sessionKeys] = await Promise.all([
    getAgentRules(agentId),
    getAgentSessionKeys(agentId),
  ])

  return (
    <div>
      <GuardrailTable rules={rules} agentId={agentId} />
      <SessionKeyTable keys={sessionKeys} agentId={agentId} />
    </div>
  )
}
```

### Pattern 2: Server Actions for Mutations

**What:** All create/delete operations go through `'use server'` functions, called from Client Component event handlers.
**When to use:** Creating rules, creating session keys, deleting rules, revoking keys.

```typescript
// dashboard/src/app/dashboard/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'

const PROXY_BASE = process.env.PROXY_URL ?? 'http://localhost:3402'

export async function createGuardrailRule(
  agentId: string,
  formData: FormData
) {
  await verifySession() // auth check on every mutation

  const body = {
    rule_type: formData.get('rule_type'),
    value: Number(formData.get('value')),
  }

  const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    return { error: `Failed to create rule: ${res.statusText}` }
  }

  revalidatePath(`/dashboard/agents/${agentId}`) // refresh Server Components
  return { success: true }
}

export async function deleteGuardrailRule(agentId: string, ruleId: string) {
  await verifySession()

  const res = await fetch(
    `${PROXY_BASE}/api/v1/agents/${agentId}/rules/${ruleId}`,
    { method: 'DELETE' }
  )

  if (!res.ok) {
    return { error: `Failed to delete rule: ${res.statusText}` }
  }

  revalidatePath(`/dashboard/agents/${agentId}`)
  return { success: true }
}

export async function revokeAllSessionKeys(
  agentId: string,
  ownerAddress: string
) {
  await verifySession()

  const res = await fetch(
    `${PROXY_BASE}/api/v1/agents/${agentId}/revoke-all`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_address: ownerAddress }),
    }
  )

  if (!res.ok) {
    return { error: `Revocation failed: ${res.statusText}` }
  }

  revalidatePath(`/dashboard/agents/${agentId}`)
  return { success: true }
}
```

### Pattern 3: Supabase Realtime for Live Spend Monitoring

**What:** Client Component subscribes to `spend_ledger` INSERT events. Updates local state without full page reload.
**When to use:** SpendMonitor component showing current spend vs limit.

```typescript
// dashboard/src/components/dashboard/SpendMonitor.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Progress } from '@/components/ui/progress'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = {
  agentId: string
  initialSpent: number   // USDC in base units (6 decimals)
  dailyCap: number
}

export function SpendMonitor({ agentId, initialSpent, dailyCap }: Props) {
  const [spent, setSpent] = useState(initialSpent)

  useEffect(() => {
    const channel = supabase
      .channel(`spend-${agentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'spend_ledger',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          setSpent((prev) => prev + (payload.new as { amount: number }).amount)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [agentId])

  const percentage = dailyCap > 0 ? Math.min((spent / dailyCap) * 100, 100) : 0
  const isNearLimit = percentage >= 80

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Daily Spend</span>
        <span className={isNearLimit ? 'text-destructive font-medium' : ''}>
          {(spent / 1_000_000).toFixed(2)} / {(dailyCap / 1_000_000).toFixed(2)} USDC
        </span>
      </div>
      <Progress
        value={percentage}
        className={isNearLimit ? '[&>div]:bg-destructive' : ''}
      />
      {isNearLimit && (
        <p className="text-destructive text-xs">
          Warning: Agent is at {percentage.toFixed(0)}% of daily limit
        </p>
      )}
    </div>
  )
}
```

### Pattern 4: DataTable with TanStack Table v8

**What:** shadcn/ui DataTable pattern using `@tanstack/react-table` for client-side sort/filter/pagination.
**When to use:** Audit log viewer, transaction log. Both are read-heavy with filtering needs.

```typescript
// dashboard/src/components/dashboard/AuditLogTable.tsx
'use client'

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table'
import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type AuditLogEntry = {
  id: string
  event_type: string
  agent_id: string
  session_key_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

const columns: ColumnDef<AuditLogEntry>[] = [
  {
    accessorKey: 'created_at',
    header: 'Time',
    cell: ({ row }) =>
      new Date(row.getValue('created_at')).toLocaleString(),
  },
  {
    accessorKey: 'event_type',
    header: 'Event',
  },
  {
    accessorKey: 'agent_id',
    header: 'Agent',
    cell: ({ row }) => {
      const id = row.getValue('agent_id') as string
      return <span className="font-mono text-xs">{id.slice(0, 8)}…</span>
    },
  },
  {
    accessorKey: 'session_key_id',
    header: 'Session Key',
    cell: ({ row }) => {
      const id = row.getValue('session_key_id') as string | null
      return id ? (
        <span className="font-mono text-xs">{id.slice(0, 8)}…</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  },
]

export function AuditLogTable({ data }: { data: AuditLogEntry[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters },
    initialState: { pagination: { pageSize: 25 } },
  })

  return (
    <div className="space-y-4">
      <Input
        placeholder="Filter by event type..."
        value={(table.getColumn('event_type')?.getFilterValue() as string) ?? ''}
        onChange={(e) =>
          table.getColumn('event_type')?.setFilterValue(e.target.value)
        }
        className="max-w-sm"
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center h-24">
                  No audit events found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### Pattern 5: Dialog for Create/Edit Forms

**What:** shadcn/ui Dialog wrapping a controlled form, calling a Server Action on submit.
**When to use:** Create guardrail rule, create session key.

```typescript
// dashboard/src/components/dashboard/CreateRuleDialog.tsx
'use client'

import { useState, useTransition } from 'react'
import { useActionState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { createGuardrailRule } from '@/app/dashboard/actions'

export function CreateRuleDialog({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false)
  const createRuleForAgent = createGuardrailRule.bind(null, agentId)
  const [state, action, pending] = useActionState(createRuleForAgent, null)

  // Close dialog on success
  if (state?.success && open) {
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add Rule</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Guardrail Rule</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <Select name="rule_type" required>
            <SelectTrigger>
              <SelectValue placeholder="Select rule type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MaxSpendPerTx">Max Spend Per Tx</SelectItem>
              <SelectItem value="MaxSpendPerDay">Max Spend Per Day</SelectItem>
              <SelectItem value="MaxLeverage">Max Leverage</SelectItem>
              <SelectItem value="MaxSlippage">Max Slippage (bps)</SelectItem>
              <SelectItem value="AllowedContracts">Allowed Contracts</SelectItem>
            </SelectContent>
          </Select>
          <Input name="value" type="number" placeholder="Value" required />
          {state?.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Creating...' : 'Create Rule'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### Pattern 6: AlertDialog for Destructive Actions

**What:** shadcn/ui AlertDialog with explicit confirm/cancel for revoke operations.
**When to use:** "Revoke All Keys" button — irreversible action.

```typescript
// dashboard/src/components/dashboard/RevokeAllButton.tsx
'use client'

import { useTransition } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { revokeAllSessionKeys } from '@/app/dashboard/actions'
import { toast } from 'sonner'

export function RevokeAllButton({
  agentId,
  ownerAddress,
}: {
  agentId: string
  ownerAddress: string
}) {
  const [isPending, startTransition] = useTransition()

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeAllSessionKeys(agentId, ownerAddress)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('All session keys revoked successfully')
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Revoke All Keys
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke All Session Keys</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately revoke ALL session keys and deactivate this
            agent. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRevoke}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isPending ? 'Revoking...' : 'Yes, Revoke All'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

### Pattern 7: Dashboard Layout with shadcn/ui Sidebar

**What:** Fixed sidebar with nav + scrollable main content area.
**When to use:** The main `dashboard/layout.tsx`.

shadcn/ui Sidebar component added in late 2024 provides a full sidebar primitive with `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarMenu`, etc. It supports Sheet-based mobile drawer automatically.

```typescript
// dashboard/src/app/dashboard/layout.tsx
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/dashboard/AppSidebar'
import { verifySession } from '@/lib/dal'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await verifySession()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

```typescript
// dashboard/src/components/dashboard/AppSidebar.tsx
'use client'

import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar'
import { LayoutDashboard, Shield, Key, FileText } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/logs', label: 'Audit Log', icon: FileText },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>x402Guard</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
```

### Pattern 8: Authentication with Supabase + Middleware

**What:** `middleware.ts` reads JWT from cookie, redirects unauthenticated users to `/login`.
**When to use:** Protecting all `/dashboard/*` routes.

```typescript
// dashboard/src/middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

```typescript
// dashboard/src/lib/supabase-server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

### Anti-Patterns to Avoid

- **Fetching proxy API from Client Components:** The Rust proxy at `localhost:3402` is internal. Browsers cannot reach it directly. All proxy calls MUST go through Server Components or Server Actions.
- **Awaiting sequential fetches:** Always use `Promise.all([...])` when fetching rules AND session keys for the same agent.
- **Missing `cache: 'no-store'` on dashboard fetches:** Dashboard data must be fresh on every request. Without this option, Next.js 15+ defaults to no-cache for dynamic routes, but be explicit.
- **Creating Supabase client in Server Components with browser client:** Must use `@supabase/ssr` `createServerClient` in Server Components and middleware; only use browser client in `'use client'` components.
- **Supabase Realtime subscription in Server Components:** Realtime requires a persistent WebSocket — only works in Client Components.
- **Using `useEffect` for mutations:** Use Server Actions with `useActionState` instead. Avoids race conditions and provides `pending` state automatically.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sort/filter/pagination | Custom sort state + array methods | `@tanstack/react-table` | Handles column pinning, virtualization, selection; many edge cases |
| Form validation | Manual if/else checks | `zod` + react-hook-form (via shadcn Form) | Type-safe, server+client parity, nested errors |
| Toast notifications | Custom div/setTimeout | `sonner` (shadcn `sonner` component) | Queue management, accessibility, dismiss handling |
| Sidebar with mobile drawer | Custom Sheet + media queries | shadcn Sidebar (built on Sheet) | Handles keyboard nav, ARIA, mobile breakpoint |
| Auth session management | Manual cookie parse + JWT verify | `@supabase/ssr` createServerClient | Handles cookie rotation, token refresh, edge cases |
| Wallet connect flow | Custom MetaMask detection | RainbowKit | Multi-wallet, QR codes, mobile deep links |
| Amount formatting (USDC 6 decimals) | Manual division | Custom `formatUsdc` util using `Intl.NumberFormat` | At minimum, build once in `lib/utils.ts` — don't repeat |

**Key insight:** shadcn/ui components are copy-pasted source code, not a runtime dep. Customizing them is expected — that's the design. Never wrap shadcn components in another wrapper just to change styles; edit the source file in `components/ui/`.

---

## Common Pitfalls

### Pitfall 1: radix-ui vs @radix-ui/* Package Confusion

**What goes wrong:** The project uses `radix-ui` (unified package, version ^1.4.3) NOT the old split `@radix-ui/react-dialog`, `@radix-ui/react-select`, etc. shadcn components will import from `radix-ui` directly.
**Why it happens:** shadcn/ui changed their CLI in 2024 to use the new `radix-ui` monorepo package. Mixing old and new breaks TypeScript types.
**How to avoid:** Always use `npx shadcn@latest add` to add components — it generates code with the correct import paths. Never manually write `import from '@radix-ui/react-*'`.
**Warning signs:** TypeScript errors on `Slot.Root` vs `Slot`; seeing both `radix-ui` and `@radix-ui/*` in `package.json`.

### Pitfall 2: Supabase Realtime RLS Required for Postgres Changes

**What goes wrong:** Supabase Realtime postgres_changes does not work on tables with Row Level Security enabled unless you explicitly grant the `authenticated` or `anon` role access to the publication.
**Why it happens:** Supabase enables RLS on tables. Realtime checks RLS before broadcasting changes to the channel subscriber.
**How to avoid:** For `spend_ledger` and `audit_log`, either: (a) configure RLS policies to allow `authenticated` users to SELECT their own agent's rows, or (b) use a service-role client on the server and poll instead. For Phase 4, configure RLS policies.
**Warning signs:** Realtime channel status shows `SUBSCRIBED` but no events are received.

### Pitfall 3: Server Action `revalidatePath` Doesn't Update Realtime Data

**What goes wrong:** After creating a rule via Server Action + `revalidatePath`, the audit log table (a Client Component with Realtime) doesn't update because `revalidatePath` only affects Server Component cache, not client state.
**Why it happens:** Supabase Realtime listens for DB events, not for Next.js cache invalidation.
**How to avoid:** Keep the two separate: Server Component lists (rules, session keys) refresh via `revalidatePath`; Realtime tables (audit_log, spend_ledger) update via INSERT events. Don't try to merge them.
**Warning signs:** Rules table updates but audit log doesn't show the corresponding audit event.

### Pitfall 4: `useActionState` Not in React 18 — Only React 19

**What goes wrong:** `useActionState` is a React 19 hook. It does NOT exist in React 18.
**Why it happens:** Next.js 15 + React 19 is the standard. This project already uses React 19.2.3 so it's fine, but documentation examples that show `useFormState` (React 18) vs `useActionState` (React 19) are confusing.
**How to avoid:** Always use `useActionState` from `'react'` — NOT `useFormState` from `'react-dom'`.

### Pitfall 5: `params` is now a Promise in Next.js 15+

**What goes wrong:** In Next.js 15 (and 16), `params` in page components is a `Promise`, not a plain object. Code written for Next.js 14 will break.
**Why it happens:** Next.js changed this in v15 as part of async layouts/pages RFC.
**How to avoid:** Always `await params` before destructuring: `const { agentId } = await params`.
**Warning signs:** TypeScript error "Property 'agentId' does not exist on type 'Promise<...>'".

### Pitfall 6: Proxy API Not Reachable from Browser

**What goes wrong:** Fetching `http://localhost:3402` from Client Component fails in production (CORS, network isolation) and in the browser during development (CORS headers not configured).
**Why it happens:** The Rust proxy's CORS policy locks to localhost-only origins. The Next.js app is a different origin.
**How to avoid:** All proxy calls go through Server Components or Server Actions — they run on the Next.js server which CAN reach `localhost:3402`. Never expose proxy endpoints to the browser directly.
**Warning signs:** `TypeError: Failed to fetch` or CORS errors in browser console.

### Pitfall 7: Supabase Channel Leak

**What goes wrong:** Creating a new Supabase Realtime channel on every render (e.g., inside the component body instead of `useEffect`), causing multiple subscriptions.
**Why it happens:** Forgetting the `useEffect` cleanup return function.
**How to avoid:** Always use `useEffect(() => { const ch = supabase.channel(...); return () => supabase.removeChannel(ch) }, [stableId])`. Stable ID should be derived from a constant like `agentId`.

---

## Data Flow Diagrams

### Dashboard Initial Load (Server-Side)

```
Browser
  |
  | GET /dashboard/agents/[agentId]
  v
Next.js Server (Server Component)
  |
  |-- fetch http://localhost:3402/api/v1/agents/{id}/rules    (parallel)
  |-- fetch http://localhost:3402/api/v1/agents/{id}/session-keys  (parallel)
  |-- createSupabaseServerClient().auth.getUser()             (parallel)
  |
  v
HTML rendered + streamed to browser
  |
  | Client hydrates
  v
Client Component (SpendMonitor)
  |
  | supabase.channel('spend-{agentId}').on('postgres_changes', ...).subscribe()
  v
WebSocket to Supabase Realtime
```

### Mutation Flow (Create Guardrail Rule)

```
Browser (Client Component: CreateRuleDialog)
  |
  | form submit -> Server Action: createGuardrailRule(agentId, formData)
  v
Next.js Server (Server Action, 'use server')
  |
  |-- verifySession() -> Supabase Auth check
  |-- POST http://localhost:3402/api/v1/agents/{id}/rules
  |-- revalidatePath('/dashboard/agents/{id}')
  |
  v
Browser receives action result
  |
  | If success: Dialog closes, toast shows
  | Server Components on page re-render with fresh data
  v
Updated agent detail page
```

### Realtime Spend Update Flow

```
Agent SDK (external)
  |
  | POST http://localhost:3402/api/v1/proxy (payment)
  v
Rust Proxy
  |
  | Validates, records spend in spend_ledger table (PostgreSQL)
  v
PostgreSQL
  |
  | Supabase Realtime logical replication trigger
  v
Supabase Realtime server
  |
  | Broadcasts INSERT event to subscribed channels
  v
Browser (SpendMonitor Client Component)
  |
  | setSpent(prev + payload.new.amount)
  v
Progress bar updates in real-time
```

---

## Architecture Decisions

### Server Components vs Client Components Decision Matrix

| Data | Component Type | Reason |
|------|----------------|--------|
| Initial rules list | Server Component | SSR, no interactivity needed |
| Initial session keys list | Server Component | SSR, no interactivity needed |
| Initial audit log | Server Component (passes to Client) | Initial data from DB, then Client filters |
| Spend meter | Client Component | Needs Realtime subscription |
| Sidebar navigation | Client Component | Needs `usePathname` for active state |
| Create/Delete forms | Client Component | Needs `useActionState`, dialog open/close state |
| Revoke all button | Client Component | Needs `useTransition` for pending state |

### SWR vs TanStack Query vs Supabase Realtime

**Decision: Supabase Realtime for live data, no SWR/TanStack Query.**

Reasoning:
- The data that needs to be "live" is spend_ledger and audit_log — these are DB tables, and Supabase Realtime handles them natively.
- The data that needs to be "refreshed after mutation" (rules, session keys) is handled by `revalidatePath` in Server Actions.
- Adding TanStack Query would introduce a QueryClient provider, dehydration/hydration complexity, and another 40KB bundle. Not justified for this use case.
- SWR polling as a fallback: Add a 30-second `refreshInterval` in SWR ONLY if Supabase Realtime is not configured for a deployment. This is documented in the fallback section below.

### Polling Fallback

If Supabase Realtime is unavailable (no REALTIME environment variable configured), fall back to polling in the SpendMonitor:

```typescript
// Polling fallback when Realtime is not configured
useEffect(() => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return

  const interval = setInterval(async () => {
    const res = await fetch(`/api/agents/${agentId}/spend`)
    const data = await res.json()
    setSpent(data.spent_today)
  }, 30_000) // 30 second poll

  return () => clearInterval(interval)
}, [agentId])
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@radix-ui/react-*` split packages | `radix-ui` unified package | shadcn v3 (2024) | One dep, new import paths |
| `useFormState` (react-dom) | `useActionState` (react) | React 19 | Different import, slightly different API |
| `params` as plain object | `params` as Promise | Next.js 15 | Must `await params` |
| `fetch` cached by default | `fetch` NOT cached by default | Next.js 15 | Must opt into cache explicitly |
| middleware.ts named "middleware" | middleware.ts (still same) | Unchanged | N/A |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 migration | New package, better App Router support |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Replaced by `@supabase/ssr`. Do not use.
- `useFormState` from `react-dom`: Use `useActionState` from `react` in React 19.
- shadcn `@radix-ui/react-*` imports: Use `radix-ui` monorepo imports.

---

## Component Hierarchy

```
RootLayout (server)
├── WalletProvider (client) — wagmi + RainbowKit
│   └── SupabaseProvider (client) — browser client context
│       ├── /login/page.tsx (server)
│       │   └── WalletConnectButton (client) — triggers SIWE
│       └── /dashboard/layout.tsx (server) — verifySession()
│           ├── SidebarProvider (client)
│           │   ├── AppSidebar (client) — usePathname
│           │   └── SidebarInset
│           │       └── /dashboard/page.tsx (server)
│           │           ├── AgentCard[] (server) — maps over agents
│           │           │   └── SpendMonitor (client) — Realtime subscription
│           │           └── /dashboard/agents/[agentId]/page.tsx (server)
│           │               ├── Tabs (client)
│           │               │   ├── GuardrailTable (server component, inside Suspense)
│           │               │   │   └── CreateRuleDialog (client)
│           │               │   └── SessionKeyTable (server component, inside Suspense)
│           │               │       └── CreateKeyDialog (client)
│           │               └── RevokeAllButton (client)
│           └── /dashboard/logs/page.tsx (server)
│               └── AuditLogTable (client) — TanStack Table
```

---

## Open Questions

1. **Supabase Auth with SIWE (Sign-In With Ethereum)**
   - What we know: Supabase supports custom JWT via their "third-party auth" flow. RainbowKit can trigger a SIWE flow. The session is stored as a Supabase JWT cookie.
   - What's unclear: Supabase may have introduced native SIWE support in 2025. Need to verify if `supabase.auth.signInWithOAuth` covers SIWE or if a custom JWT path is needed.
   - Recommendation: Use Supabase custom JWT path with a Next.js Route Handler (`/api/auth/siwe`) that verifies the SIWE signature and issues a Supabase JWT. This is documented in Supabase's "custom access token" guide.

2. **Supabase Realtime RLS Configuration**
   - What we know: RLS must be configured on `spend_ledger` and `audit_log` to allow authenticated users to receive their own agent's events.
   - What's unclear: Whether the current DB migration enables RLS on these tables, and what policies are needed.
   - Recommendation: Wave 0 task should include enabling RLS + policy `agent_id in (SELECT id FROM agents WHERE owner_address = auth.jwt()->>'wallet_address')`.

3. **Realtime for audit_log with Immutability Trigger**
   - What we know: The Rust proxy has a DB trigger that prevents UPDATE/DELETE on audit_log. Realtime only listens for INSERT events.
   - What's unclear: Does the BEFORE UPDATE trigger interfere with Supabase Realtime's internal replication setup?
   - Recommendation: Only subscribe to `event: 'INSERT'` on audit_log. The trigger should not affect INSERT.

---

## Sources

### Primary (HIGH confidence)
- Next.js 16.1.6 Official Docs (version 16.1.6, lastUpdated 2026-02-27) — fetching data, server actions, caching, authentication patterns
- Existing codebase: `dashboard/package.json`, `dashboard/src/components/ui/button.tsx`, `dashboard/src/app/globals.css` — confirmed radix-ui unified package, shadcn v3 setup, Tailwind 4

### Secondary (MEDIUM confidence)
- Supabase Realtime postgres_changes API — from training data (Aug 2025), channel/subscribe/postgres_changes pattern. The `@supabase/supabase-js` v2.97 in package.json confirms this is current.
- `@supabase/ssr` package — from training data, recommended replacement for `auth-helpers-nextjs`
- TanStack Table v8 DataTable pattern — well-established shadcn/ui DataTable recipe; column definition API is stable

### Tertiary (LOW confidence)
- Supabase SIWE / wallet authentication specifics — training data only; recommend verifying Supabase dashboard for "Third-party Auth" or "Custom JWT" docs before implementation
- RainbowKit v2 + wagmi v2 React 19 compatibility — from training data; verify `npm install` produces no peer dep warnings

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json + Next.js 16.1.6 official docs
- Architecture patterns: HIGH — all code patterns derived from official Next.js 16.1.6 docs (2026-02-27)
- Realtime patterns: MEDIUM — supabase-js v2 API stable but not re-verified against 2026 docs
- Auth (SIWE): LOW — specifics need verification

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable stack; shadcn/ui evolves fast but breaking changes are rare)
