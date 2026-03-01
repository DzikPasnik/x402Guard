---
phase: 04-dashboard
plan: 03
type: execute
wave: 2
depends_on: ["04-02"]
files_modified:
  - dashboard/src/app/dashboard/actions.ts
  - dashboard/src/components/dashboard/GuardrailTable.tsx
  - dashboard/src/components/dashboard/CreateRuleDialog.tsx
  - dashboard/src/components/dashboard/SessionKeyTable.tsx
  - dashboard/src/components/dashboard/CreateKeyDialog.tsx
  - dashboard/src/components/dashboard/RevokeAllButton.tsx
  - dashboard/src/app/dashboard/agents/[agentId]/page.tsx
autonomous: true
requirements: [FR-7.5, FR-7.6, FR-7.7]

must_haves:
  truths:
    - "User can view all active guardrail rules for an agent in a table"
    - "User can create a new guardrail rule (any of 5 types) via dialog form"
    - "User can delete (deactivate) a guardrail rule from the table"
    - "User can view all active session keys for an agent in a table"
    - "User can create a new session key via dialog form"
    - "User can revoke an individual session key from the table"
    - "User can revoke ALL session keys with a destructive confirmation dialog"
    - "After any mutation the table refreshes automatically (revalidatePath)"
    - "Error states are shown via toast notifications"
  artifacts:
    - path: "dashboard/src/app/dashboard/actions.ts"
      provides: "Server Actions for all CRUD mutations"
      exports: ["createGuardrailRule", "deleteGuardrailRule", "createSessionKey", "revokeSessionKey", "revokeAllSessionKeys"]
    - path: "dashboard/src/components/dashboard/GuardrailTable.tsx"
      provides: "Server component rendering guardrail rules in shadcn Table"
      min_lines: 40
    - path: "dashboard/src/components/dashboard/CreateRuleDialog.tsx"
      provides: "Client component dialog form for creating guardrail rules"
      min_lines: 60
    - path: "dashboard/src/components/dashboard/SessionKeyTable.tsx"
      provides: "Server component rendering session keys in shadcn Table"
      min_lines: 40
    - path: "dashboard/src/components/dashboard/CreateKeyDialog.tsx"
      provides: "Client component dialog form for creating session keys"
      min_lines: 60
    - path: "dashboard/src/components/dashboard/RevokeAllButton.tsx"
      provides: "Client component AlertDialog for destructive revoke-all action"
      min_lines: 40
    - path: "dashboard/src/app/dashboard/agents/[agentId]/page.tsx"
      provides: "Full agent detail page with tabs, tables, and dialogs"
      min_lines: 50
  key_links:
    - from: "dashboard/src/components/dashboard/CreateRuleDialog.tsx"
      to: "dashboard/src/app/dashboard/actions.ts"
      via: "useActionState calling createGuardrailRule server action"
      pattern: "useActionState.*createGuardrailRule"
    - from: "dashboard/src/components/dashboard/CreateKeyDialog.tsx"
      to: "dashboard/src/app/dashboard/actions.ts"
      via: "useActionState calling createSessionKey server action"
      pattern: "useActionState.*createSessionKey"
    - from: "dashboard/src/components/dashboard/RevokeAllButton.tsx"
      to: "dashboard/src/app/dashboard/actions.ts"
      via: "useTransition calling revokeAllSessionKeys server action"
      pattern: "revokeAllSessionKeys"
    - from: "dashboard/src/app/dashboard/actions.ts"
      to: "http://localhost:3402/api/v1"
      via: "fetch to Rust proxy REST API"
      pattern: "PROXY_BASE.*api/v1"
    - from: "dashboard/src/app/dashboard/agents/[agentId]/page.tsx"
      to: "dashboard/src/components/dashboard/GuardrailTable.tsx"
      via: "Server Component passes fetched rules as props"
      pattern: "GuardrailTable.*rules"
    - from: "dashboard/src/app/dashboard/agents/[agentId]/page.tsx"
      to: "dashboard/src/components/dashboard/SessionKeyTable.tsx"
      via: "Server Component passes fetched session keys as props"
      pattern: "SessionKeyTable.*keys"
---

<objective>
Build the full Agent Detail CRUD UI: guardrail rule management, session key management, and one-click revoke-all. This plan creates Server Actions for all mutations, server-rendered tables for rules and keys, client-side dialog forms for creation, and a destructive AlertDialog for revoke-all.

Purpose: FR-7.5 (guardrail CRUD), FR-7.6 (session key management), FR-7.7 (one-click revoke all) are the core safety-critical features of the dashboard. Without these, users cannot configure or manage their agents' permissions.

Output: 7 files — 1 Server Actions module, 2 table components, 2 dialog form components, 1 revoke button, 1 agent detail page.
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

<!-- Depends on Plan 04-02 output: layout shell, proxy.ts, types.ts, dal.ts -->
<!-- Plan 04-02 SUMMARY should be read for exact exports if available -->

<interfaces>
<!-- Proxy API response types — from Rust proxy source, Plan 04-02 creates TypeScript mirrors -->

From proxy/src/models/guardrail.rs (Plan 04-02 mirrors as dashboard/src/lib/types.ts):
```typescript
// RuleType is a tagged union — the proxy serializes as { type: "MaxSpendPerTx", params: { limit: number } }
export type RuleType =
  | { type: "MaxSpendPerTx"; params: { limit: number } }
  | { type: "MaxSpendPerDay"; params: { limit: number } }
  | { type: "AllowedContracts"; params: { addresses: string[] } }
  | { type: "MaxLeverage"; params: { max: number } }
  | { type: "MaxSlippage"; params: { bps: number } }

export interface GuardrailRule {
  id: string
  agent_id: string
  rule_type: RuleType
  is_active: boolean
}
```

From proxy/src/models/session_key.rs:
```typescript
export interface SessionKey {
  id: string
  agent_id: string
  public_key: string
  max_spend: number      // USDC minor units (6 decimals)
  spent: number          // USDC minor units
  allowed_contracts: string[]
  expires_at: string     // ISO 8601
  is_revoked: boolean
  created_at: string     // ISO 8601
}
```

From proxy/src/models/agent.rs:
```typescript
export interface Agent {
  id: string
  name: string
  owner_address: string
  created_at: string
  is_active: boolean
}
```

From proxy/src/handlers/guardrail_rules.rs — API response shapes:
```typescript
// POST /api/v1/agents/:id/rules — body: { rule_type: RuleType }
// Response: { success: boolean, data: GuardrailRule | null, error: string | null }

// GET /api/v1/agents/:id/rules
// Response: { success: boolean, data: GuardrailRule[] }

// DELETE /api/v1/agents/:id/rules/:rule_id
// Response: { success: boolean, data: null, error: string | null }
```

From proxy/src/handlers/session_keys.rs — API request/response shapes:
```typescript
// POST /api/v1/agents/:id/session-keys
// Body: { public_key: string, max_spend: number, allowed_contracts: string[], expires_at: string }
// Response: { success: boolean, data: SessionKey | null, error: string | null }

// GET /api/v1/agents/:id/session-keys
// Response: { success: boolean, data: SessionKey[] }

// DELETE /api/v1/agents/:id/session-keys/:key_id
// Response: { success: boolean, data: null, error: string | null }

// POST /api/v1/agents/:id/revoke-all
// Body: { owner_address: string, chain_id?: number, eoa_nonce_hint?: number }
// Response: { success: boolean, keys_revoked: number, agent_deactivated: boolean, on_chain_authorization?: object }
```

From Plan 04-02 (expected exports in dashboard/src/lib/proxy.ts):
```typescript
export const PROXY_BASE: string  // process.env.PROXY_URL ?? 'http://localhost:3402'
export async function getAgent(agentId: string): Promise<Agent>
export async function getAgentRules(agentId: string): Promise<GuardrailRule[]>
export async function getAgentSessionKeys(agentId: string): Promise<SessionKey[]>
```

From Plan 04-02 (expected exports in dashboard/src/lib/dal.ts):
```typescript
export async function verifySession(): Promise<{ walletAddress: string }>
// Throws redirect to /login if not authenticated
```

From Plan 04-02 (expected in dashboard/src/lib/format.ts or utils.ts):
```typescript
export function formatUsdc(rawAmount: number): string
// Returns "42.50 USDC" for input 42500000
```

shadcn/ui components expected from Plan 04-02 installations:
- dialog, alert-dialog, select, switch, slider, form, dropdown-menu, tabs, sonner
- All imported from @/components/ui/*
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install dependencies and shadcn components</name>
  <files>
    dashboard/package.json
    dashboard/src/components/ui/dialog.tsx
    dashboard/src/components/ui/alert-dialog.tsx
    dashboard/src/components/ui/select.tsx
    dashboard/src/components/ui/dropdown-menu.tsx
    dashboard/src/components/ui/tabs.tsx
    dashboard/src/components/ui/form.tsx
    dashboard/src/components/ui/slider.tsx
    dashboard/src/components/ui/switch.tsx
  </files>
  <action>
    Install zod and sonner, then add required shadcn components. Run from the `dashboard/` directory:

    ```bash
    cd dashboard
    npm install zod sonner
    npx shadcn@latest add dialog alert-dialog select switch slider form dropdown-menu tabs sonner
    ```

    NOTE: Check if Plan 04-02 already installed any of these. If `zod` or `sonner` are already in package.json, skip them. If shadcn components already exist in `src/components/ui/`, skip those too. The shadcn CLI is idempotent but check first to avoid unnecessary changes.

    After installation, verify `sonner` is wrapped in the root layout. If Plan 04-02 did not add the Toaster provider, add it to `dashboard/src/app/layout.tsx`:

    ```tsx
    import { Toaster } from '@/components/ui/sonner'
    // ... inside <body>:
    {children}
    <Toaster />
    ```

    The `sonner` shadcn component provides the `<Toaster />` component and re-exports `toast` from `sonner`. All toast calls in this plan use `import { toast } from 'sonner'`.
  </action>
  <verify>
    ```bash
    cd dashboard && node -e "require('zod'); require('sonner'); console.log('deps ok')"
    ls dashboard/src/components/ui/dialog.tsx dashboard/src/components/ui/alert-dialog.tsx dashboard/src/components/ui/select.tsx dashboard/src/components/ui/dropdown-menu.tsx dashboard/src/components/ui/tabs.tsx
    ```
  </verify>
  <done>zod and sonner in package.json, all 9 shadcn component files exist in src/components/ui/, Toaster provider in root layout</done>
</task>

<task type="auto">
  <name>Task 2: Create Server Actions and CRUD components</name>
  <files>
    dashboard/src/app/dashboard/actions.ts
    dashboard/src/components/dashboard/GuardrailTable.tsx
    dashboard/src/components/dashboard/CreateRuleDialog.tsx
    dashboard/src/components/dashboard/SessionKeyTable.tsx
    dashboard/src/components/dashboard/CreateKeyDialog.tsx
    dashboard/src/components/dashboard/RevokeAllButton.tsx
    dashboard/src/app/dashboard/agents/[agentId]/page.tsx
  </files>
  <action>
    Create all 7 files. This is the core of the plan. Follow the patterns from RESEARCH-ui.md exactly.

    **File 1: `dashboard/src/app/dashboard/actions.ts`** ('use server')

    Server Actions module. Every action:
    1. Calls `await verifySession()` from `@/lib/dal` first (auth gate)
    2. Validates input (never trust client data)
    3. Calls Rust proxy at `PROXY_BASE` (from `@/lib/proxy` or inline `process.env.PROXY_URL ?? 'http://localhost:3402'`)
    4. On success: calls `revalidatePath('/dashboard/agents/${agentId}')` to refresh server components
    5. Returns `{ success: true }` or `{ error: string }`

    Five exported functions:

    a) `createGuardrailRule(agentId: string, prevState: unknown, formData: FormData)`:
       - Extract `rule_type` (string) and `value` (string) from formData
       - Validate: rule_type must be one of the 5 known types, value must be a positive number
       - Build the proxy request body matching the Rust `CreateRuleRequest`:
         - For MaxSpendPerTx/MaxSpendPerDay: `{ rule_type: { type: ruleType, params: { limit: Math.round(parseFloat(value) * 1_000_000) } } }` (convert USDC to minor units)
         - For AllowedContracts: `{ rule_type: { type: "AllowedContracts", params: { addresses: value.split(',').map(s => s.trim()).filter(Boolean) } } }` (comma-separated addresses)
         - For MaxLeverage: `{ rule_type: { type: "MaxLeverage", params: { max: parseInt(value, 10) } } }`
         - For MaxSlippage: `{ rule_type: { type: "MaxSlippage", params: { bps: parseInt(value, 10) } } }`
       - POST to `${PROXY_BASE}/api/v1/agents/${agentId}/rules`
       - Content-Type: application/json
       - On non-ok response: parse body for error, return `{ error: ... }`
       - On success: `revalidatePath`, return `{ success: true }`

    b) `deleteGuardrailRule(agentId: string, ruleId: string)`:
       - DELETE to `${PROXY_BASE}/api/v1/agents/${agentId}/rules/${ruleId}`
       - Return pattern same as above

    c) `createSessionKey(agentId: string, prevState: unknown, formData: FormData)`:
       - Extract: public_key, max_spend (USDC string), allowed_contracts (comma-separated), expires_at (ISO date string)
       - Validate: public_key not empty, max_spend > 0, expires_at is in the future
       - Build body: `{ public_key, max_spend: Math.round(parseFloat(maxSpend) * 1_000_000), allowed_contracts: contracts.split(',').map(s => s.trim()).filter(Boolean), expires_at: new Date(expiresAt).toISOString() }`
       - POST to `${PROXY_BASE}/api/v1/agents/${agentId}/session-keys`

    d) `revokeSessionKey(agentId: string, keyId: string)`:
       - DELETE to `${PROXY_BASE}/api/v1/agents/${agentId}/session-keys/${keyId}`

    e) `revokeAllSessionKeys(agentId: string, ownerAddress: string)`:
       - POST to `${PROXY_BASE}/api/v1/agents/${agentId}/revoke-all`
       - Body: `{ owner_address: ownerAddress }`
       - Return includes `keys_revoked` count on success: `{ success: true, keysRevoked: data.keys_revoked }`

    SECURITY NOTES for actions.ts:
    - Never use `eval()` or template literals in SQL (not applicable here, but enforce the habit)
    - All numeric conversions use `parseFloat`/`parseInt` with validation (NaN check)
    - UUID format validation for agentId/ruleId/keyId: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
    - Return error strings, never throw (Server Actions should not throw to the client)

    ---

    **File 2: `dashboard/src/components/dashboard/GuardrailTable.tsx`** (server component, NO 'use client')

    Props: `{ rules: GuardrailRule[], agentId: string }`

    Renders a shadcn Table with columns:
    - Rule Type: human-readable label (e.g., "Max Spend Per Tx", "Allowed Contracts")
    - Value: formatted based on type:
      - MaxSpendPerTx/MaxSpendPerDay: `formatUsdc(rule.rule_type.params.limit)` from `@/lib/format` or inline `(limit / 1_000_000).toFixed(2) + ' USDC'`
      - AllowedContracts: `rule.rule_type.params.addresses.length + ' contracts'`
      - MaxLeverage: `rule.rule_type.params.max + 'x'`
      - MaxSlippage: `(rule.rule_type.params.bps / 100).toFixed(2) + '%'`
    - Status: Badge (variant="default" green for active, variant="secondary" for inactive)
    - Actions: A `DeleteRuleButton` client sub-component (see below)

    Include an inline client sub-component `DeleteRuleButton` (or create it within the same file using a separate 'use client' module, OR import it). The simplest approach: create a tiny client wrapper that calls `deleteGuardrailRule` via `useTransition` and shows a toast. Define it INLINE at the bottom of GuardrailTable.tsx if Next.js supports it, or create a separate small file `dashboard/src/components/dashboard/DeleteRuleButton.tsx`.

    Actually, since GuardrailTable is a server component, the delete button must be a client component. Create it as a separate import. The button should:
    - Show a DropdownMenu with "Delete" option (uses shadcn DropdownMenu)
    - On click "Delete": call `deleteGuardrailRule(agentId, ruleId)` via `useTransition`
    - Show toast on success/error via sonner

    Create `dashboard/src/components/dashboard/RuleActions.tsx` ('use client') for the dropdown actions:
    ```
    Props: { agentId: string, ruleId: string }
    Uses DropdownMenu with DropdownMenuTrigger (MoreHorizontal icon), DropdownMenuContent, DropdownMenuItem
    Delete action calls deleteGuardrailRule, shows toast
    ```

    Handle empty state: if rules array is empty, show a muted message "No guardrail rules configured. Add a rule to protect this agent."

    ---

    **File 3: `dashboard/src/components/dashboard/CreateRuleDialog.tsx`** ('use client')

    Props: `{ agentId: string }`

    Structure:
    - Dialog wrapping a form
    - State: `open` (boolean), managed via `useState`
    - Uses `useActionState` from 'react' (React 19 — NOT from 'react-dom', NOT useFormState)
    - Bind agentId: `const boundAction = createGuardrailRule.bind(null, agentId)`
    - `const [state, formAction, pending] = useActionState(boundAction, null)`
    - Auto-close on success: `useEffect(() => { if (state?.success) { setOpen(false); toast.success('Rule created') } }, [state])`

    Form fields:
    - Select (shadcn) for rule_type with 5 options:
      - MaxSpendPerTx: "Max Spend Per Transaction"
      - MaxSpendPerDay: "Max Spend Per Day"
      - AllowedContracts: "Allowed Contracts"
      - MaxLeverage: "Max Leverage"
      - MaxSlippage: "Max Slippage (bps)"
    - Conditional value input based on selected rule_type:
      - MaxSpendPerTx/MaxSpendPerDay: Input type="number" step="0.01" placeholder="Amount in USDC" min="0.01"
      - AllowedContracts: Textarea placeholder="0xabc..., 0xdef..." (comma-separated)
      - MaxLeverage: Input type="number" placeholder="e.g. 3 for 3x" min="1" max="100"
      - MaxSlippage: Input type="number" placeholder="Basis points (e.g. 50 = 0.5%)" min="1" max="10000"
    - Use a local `selectedRuleType` state to control which input variant shows
    - Error display: `{state?.error && <p className="text-destructive text-sm">{state.error}</p>}`
    - Submit button: disabled when `pending`, shows "Creating..." while pending

    DialogTrigger: `<Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Rule</Button>`
    Import Plus from lucide-react.

    ---

    **File 4: `dashboard/src/components/dashboard/SessionKeyTable.tsx`** (server component, NO 'use client')

    Props: `{ keys: SessionKey[], agentId: string }`

    Renders a shadcn Table with columns:
    - Public Key: truncated display `key.public_key.slice(0, 10) + '...' + key.public_key.slice(-6)` in monospace font
    - Max Spend: `formatUsdc(key.max_spend)`
    - Spent: `formatUsdc(key.spent)` with color coding (red if spent > 80% of max_spend)
    - Contracts: `key.allowed_contracts.length` with tooltip showing full list (or "Any" if empty array)
    - Expires: relative or absolute date display using `new Date(key.expires_at).toLocaleDateString()`
    - Actions: `KeyActions` client component (DropdownMenu with "Revoke" option)

    Create `dashboard/src/components/dashboard/KeyActions.tsx` ('use client'):
    ```
    Props: { agentId: string, keyId: string }
    DropdownMenu with "Revoke" item
    Calls revokeSessionKey(agentId, keyId) via useTransition
    Shows toast on success/error
    ```

    Handle empty state: "No session keys. Create a key to give this agent limited access."

    ---

    **File 5: `dashboard/src/components/dashboard/CreateKeyDialog.tsx`** ('use client')

    Props: `{ agentId: string }`

    Same Dialog + useActionState pattern as CreateRuleDialog.

    Form fields:
    - public_key: Input placeholder="0x..." (the delegated session key address)
    - max_spend: Input type="number" step="0.01" placeholder="Max spend in USDC" min="0.01"
    - allowed_contracts: Textarea placeholder="0xabc..., 0xdef... (comma-separated, leave empty for any)"
    - expires_at: Input type="datetime-local" with min set to current datetime

    Auto-close + toast on success. Error display same pattern.

    DialogTrigger: `<Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Session Key</Button>`

    ---

    **File 6: `dashboard/src/components/dashboard/RevokeAllButton.tsx`** ('use client')

    Props: `{ agentId: string, ownerAddress: string }`

    Uses shadcn AlertDialog (NOT Dialog — this is a destructive action requiring explicit confirmation).

    Structure:
    - AlertDialogTrigger: `<Button variant="destructive" size="sm"><ShieldOff className="mr-2 h-4 w-4" /> Revoke All Keys</Button>`
    - AlertDialogContent with warning:
      - Title: "Revoke All Session Keys"
      - Description: "This will immediately revoke ALL session keys for this agent and deactivate the agent. The agent will no longer be able to make any transactions. This action cannot be undone."
    - AlertDialogCancel: "Cancel"
    - AlertDialogAction: calls `revokeAllSessionKeys(agentId, ownerAddress)` via `useTransition`
      - className: "bg-destructive hover:bg-destructive/90" (red confirm button)
      - On success: `toast.success('All session keys revoked and agent deactivated')`
      - On error: `toast.error(result.error)`
    - Disable action button while pending, show "Revoking..." text

    Import ShieldOff from lucide-react.

    ---

    **File 7: `dashboard/src/app/dashboard/agents/[agentId]/page.tsx`** (server component)

    The full agent detail page. This is a Server Component that fetches data and renders sub-components.

    Structure:
    ```tsx
    import { getAgent, getAgentRules, getAgentSessionKeys } from '@/lib/proxy'
    import { verifySession } from '@/lib/dal'
    import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
    import { Badge } from '@/components/ui/badge'
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
    import { GuardrailTable } from '@/components/dashboard/GuardrailTable'
    import { CreateRuleDialog } from '@/components/dashboard/CreateRuleDialog'
    import { SessionKeyTable } from '@/components/dashboard/SessionKeyTable'
    import { CreateKeyDialog } from '@/components/dashboard/CreateKeyDialog'
    import { RevokeAllButton } from '@/components/dashboard/RevokeAllButton'

    export default async function AgentDetailPage({
      params,
    }: {
      params: Promise<{ agentId: string }>
    }) {
      const { agentId } = await params
      await verifySession()

      // Parallel fetch
      const [agent, rules, sessionKeys] = await Promise.all([
        getAgent(agentId),
        getAgentRules(agentId),
        getAgentSessionKeys(agentId),
      ])

      return (
        <div className="space-y-6">
          {/* Agent Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <p className="text-sm text-muted-foreground font-mono">
                {agent.owner_address}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={agent.is_active ? 'default' : 'destructive'}>
                {agent.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <RevokeAllButton agentId={agentId} ownerAddress={agent.owner_address} />
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="rules">
            <TabsList>
              <TabsTrigger value="rules">
                Guardrail Rules ({rules.length})
              </TabsTrigger>
              <TabsTrigger value="keys">
                Session Keys ({sessionKeys.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rules">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Guardrail Rules</CardTitle>
                  <CreateRuleDialog agentId={agentId} />
                </CardHeader>
                <CardContent>
                  <GuardrailTable rules={rules} agentId={agentId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="keys">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Session Keys</CardTitle>
                  <CreateKeyDialog agentId={agentId} />
                </CardHeader>
                <CardContent>
                  <SessionKeyTable keys={sessionKeys} agentId={agentId} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )
    }
    ```

    IMPORTANT NOTES:
    - Next.js 16 uses `params: Promise<{ agentId: string }>` (must await params)
    - `verifySession()` redirects to /login if not authenticated (do not wrap in try/catch)
    - Use `Promise.all` for parallel data fetching (agent + rules + keys)
    - All client components (dialogs, buttons) are imported into this server component
    - The page uses the dashboard layout from Plan 04-02 (sidebar, header already present)

    Also create the two small action dropdown components:
    - `dashboard/src/components/dashboard/RuleActions.tsx` ('use client')
    - `dashboard/src/components/dashboard/KeyActions.tsx` ('use client')
  </action>
  <verify>
    ```bash
    cd dashboard && npx next build 2>&1 | tail -20
    ```
    Build must complete without errors. All 9 files must exist:
    ```bash
    ls dashboard/src/app/dashboard/actions.ts \
       dashboard/src/components/dashboard/GuardrailTable.tsx \
       dashboard/src/components/dashboard/CreateRuleDialog.tsx \
       dashboard/src/components/dashboard/SessionKeyTable.tsx \
       dashboard/src/components/dashboard/CreateKeyDialog.tsx \
       dashboard/src/components/dashboard/RevokeAllButton.tsx \
       dashboard/src/components/dashboard/RuleActions.tsx \
       dashboard/src/components/dashboard/KeyActions.tsx \
       dashboard/src/app/dashboard/agents/\[agentId\]/page.tsx
    ```
  </verify>
  <done>
    All 9 files created and building cleanly:
    - actions.ts exports 5 server actions (createGuardrailRule, deleteGuardrailRule, createSessionKey, revokeSessionKey, revokeAllSessionKeys)
    - GuardrailTable renders rules with formatted values and delete dropdown
    - CreateRuleDialog has 5 rule types with conditional value input, auto-closes on success
    - SessionKeyTable renders keys with truncated public key, spend progress, and revoke dropdown
    - CreateKeyDialog has public_key, max_spend, contracts, expires_at fields
    - RevokeAllButton shows AlertDialog with destructive confirmation
    - Agent detail page fetches data in parallel, renders tabs with Rules and Session Keys
    - `npm run build` passes with zero errors
  </done>
</task>

</tasks>

<verification>
1. **Build check:** `cd dashboard && npm run build` completes without errors
2. **File existence:** All 9 component/action files exist at their specified paths
3. **Server Action exports:** `grep -c "export async function" dashboard/src/app/dashboard/actions.ts` returns 5
4. **'use server' directive:** `head -1 dashboard/src/app/dashboard/actions.ts` shows `'use server'`
5. **'use client' directives:** CreateRuleDialog, CreateKeyDialog, RevokeAllButton, RuleActions, KeyActions all have `'use client'` as first line
6. **No 'use client' on server components:** GuardrailTable.tsx and page.tsx do NOT have 'use client'
7. **Auth gate:** `grep -c "verifySession" dashboard/src/app/dashboard/actions.ts` returns 5 (one per action)
8. **revalidatePath:** `grep -c "revalidatePath" dashboard/src/app/dashboard/actions.ts` returns 5
9. **Proxy URL:** `grep "PROXY_BASE\|PROXY_URL\|localhost:3402" dashboard/src/app/dashboard/actions.ts` matches
10. **USDC conversion:** `grep "1_000_000\|1000000" dashboard/src/app/dashboard/actions.ts` matches (minor units conversion)
</verification>

<success_criteria>
- `npm run build` in dashboard/ passes with zero errors
- 5 Server Actions exported from actions.ts, each calling verifySession() and revalidatePath()
- GuardrailTable renders all 5 rule types with human-readable formatted values
- CreateRuleDialog form correctly maps rule_type to the Rust proxy's tagged union format
- SessionKeyTable displays truncated public keys, formatted USDC amounts, and expiry dates
- CreateKeyDialog converts USDC input to minor units before sending to proxy
- RevokeAllButton uses AlertDialog (not Dialog) with destructive styling and confirmation
- Agent detail page uses parallel data fetching with Promise.all
- All client components use useActionState (React 19) or useTransition for async state
- Toast notifications (sonner) on success and error for all mutations
</success_criteria>

<output>
After completion, create `.planning/phases/04-dashboard/04-03-SUMMARY.md`
</output>
