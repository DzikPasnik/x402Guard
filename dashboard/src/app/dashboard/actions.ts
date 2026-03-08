'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'

const PROXY_BASE = process.env.PROXY_URL ?? 'http://localhost:3402'
const MANAGEMENT_API_KEY = process.env.MANAGEMENT_API_KEY ?? ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ActionResult = { success: true } | { error: string }
type FormActionResult = ActionResult | null

// ─── Auth Helpers ───────────────────────────────────────────────────

/** Headers for authenticated proxy API calls. */
function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (MANAGEMENT_API_KEY) {
    headers['X-Api-Key'] = MANAGEMENT_API_KEY
  }
  return headers
}

/** Headers for non-body requests (DELETE, GET). */
function apiHeadersNoBody(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (MANAGEMENT_API_KEY) {
    headers['X-Api-Key'] = MANAGEMENT_API_KEY
  }
  return headers
}

/**
 * SECURITY [CRITICAL-3]: Verify the authenticated user owns the agent.
 *
 * Fetches the agent from the proxy API and compares the owner_address
 * with the session user's wallet_address. Prevents IDOR attacks where
 * any authenticated user could modify another user's agents.
 *
 * In dev mode (DEV_SKIP_AUTH=true), ownership is not checked.
 */
async function assertAgentOwnership(agentId: string): Promise<{ error?: string }> {
  // Dev mode: skip ownership check (SECURITY: guarded by NODE_ENV)
  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  if (isDev && process.env.DEV_SKIP_AUTH === 'true') {
    return {}
  }

  const { user } = await verifySession()
  const walletAddress = user.user_metadata?.wallet_address as string | undefined

  if (!walletAddress) {
    return { error: 'No wallet address in session' }
  }

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}`, {
      headers: apiHeadersNoBody(),
    })

    if (!res.ok) {
      return { error: 'Agent not found' }
    }

    const body = await res.json() as { data?: { owner_address?: string } }
    const ownerAddress = body.data?.owner_address

    if (!ownerAddress) {
      return { error: 'Agent has no owner' }
    }

    // Case-insensitive comparison for Ethereum addresses (mixed-case checksums)
    if (ownerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return { error: 'You do not own this agent' }
    }

    return {}
  } catch {
    return { error: 'Failed to verify agent ownership' }
  }
}

// ─── Guardrail Rules ───────────────────────────────────────────────

export async function createGuardrailRule(
  agentId: string,
  _prevState: FormActionResult,
  formData: FormData
): Promise<FormActionResult> {
  await verifySession()

  if (!UUID_RE.test(agentId)) return { error: 'Invalid agent ID' }

  // SECURITY [CRITICAL-3]: Verify ownership before mutation
  const ownerCheck = await assertAgentOwnership(agentId)
  if (ownerCheck.error) return { error: ownerCheck.error }

  const ruleType = formData.get('rule_type') as string | null
  const value = formData.get('value') as string | null

  if (!ruleType || !value) return { error: 'Rule type and value are required' }

  const validTypes = ['MaxSpendPerTx', 'MaxSpendPerDay', 'AllowedContracts', 'MaxLeverage', 'MaxSlippage']
  if (!validTypes.includes(ruleType)) return { error: 'Invalid rule type' }

  let ruleParams: Record<string, unknown>

  switch (ruleType) {
    case 'MaxSpendPerTx':
    case 'MaxSpendPerDay': {
      const amount = parseFloat(value)
      if (isNaN(amount) || amount <= 0) return { error: 'Amount must be a positive number' }
      ruleParams = { limit: Math.round(amount * 1_000_000) }
      break
    }
    case 'AllowedContracts': {
      const addresses = value.split(',').map(s => s.trim()).filter(Boolean)
      if (addresses.length === 0) return { error: 'At least one contract address required' }
      ruleParams = { addresses }
      break
    }
    case 'MaxLeverage': {
      const max = parseInt(value, 10)
      if (isNaN(max) || max < 1) return { error: 'Leverage must be a positive integer' }
      ruleParams = { max }
      break
    }
    case 'MaxSlippage': {
      const bps = parseInt(value, 10)
      if (isNaN(bps) || bps < 1) return { error: 'Slippage must be at least 1 basis point' }
      ruleParams = { bps }
      break
    }
    default:
      return { error: 'Unknown rule type' }
  }

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/rules`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ rule_type: ruleType, rule_params: ruleParams }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { error: (body as Record<string, unknown>).error as string ?? `Failed: ${res.status}` }
    }

    revalidatePath(`/dashboard/agents/${agentId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function deleteGuardrailRule(
  agentId: string,
  ruleId: string
): Promise<ActionResult> {
  await verifySession()

  if (!UUID_RE.test(agentId)) return { error: 'Invalid agent ID' }
  if (!UUID_RE.test(ruleId)) return { error: 'Invalid rule ID' }

  // SECURITY [CRITICAL-3]: Verify ownership before mutation
  const ownerCheck = await assertAgentOwnership(agentId)
  if (ownerCheck.error) return { error: ownerCheck.error }

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/rules/${ruleId}`, {
      method: 'DELETE',
      headers: apiHeadersNoBody(),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { error: (body as Record<string, unknown>).error as string ?? `Failed: ${res.status}` }
    }

    revalidatePath(`/dashboard/agents/${agentId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

// ─── Session Keys ──────────────────────────────────────────────────

export async function createSessionKey(
  agentId: string,
  _prevState: FormActionResult,
  formData: FormData
): Promise<FormActionResult> {
  await verifySession()

  if (!UUID_RE.test(agentId)) return { error: 'Invalid agent ID' }

  // SECURITY [CRITICAL-3]: Verify ownership before mutation
  const ownerCheck = await assertAgentOwnership(agentId)
  if (ownerCheck.error) return { error: ownerCheck.error }

  const publicKey = (formData.get('public_key') as string | null)?.trim()
  const maxSpendStr = formData.get('max_spend') as string | null
  const contractsStr = formData.get('allowed_contracts') as string | null
  const expiresAtStr = formData.get('expires_at') as string | null

  if (!publicKey) return { error: 'Public key is required' }

  const maxSpend = parseFloat(maxSpendStr ?? '')
  if (isNaN(maxSpend) || maxSpend <= 0) return { error: 'Max spend must be a positive number' }

  if (!expiresAtStr) return { error: 'Expiration date is required' }
  const expiresAt = new Date(expiresAtStr)
  if (expiresAt <= new Date()) return { error: 'Expiration must be in the future' }

  const allowedContracts = (contractsStr ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/session-keys`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        public_key: publicKey,
        max_spend: Math.round(maxSpend * 1_000_000),
        allowed_contracts: allowedContracts,
        expires_at: expiresAt.toISOString(),
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { error: (body as Record<string, unknown>).error as string ?? `Failed: ${res.status}` }
    }

    revalidatePath(`/dashboard/agents/${agentId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function revokeSessionKey(
  agentId: string,
  keyId: string
): Promise<ActionResult> {
  await verifySession()

  if (!UUID_RE.test(agentId)) return { error: 'Invalid agent ID' }
  if (!UUID_RE.test(keyId)) return { error: 'Invalid key ID' }

  // SECURITY [CRITICAL-3]: Verify ownership before mutation
  const ownerCheck = await assertAgentOwnership(agentId)
  if (ownerCheck.error) return { error: ownerCheck.error }

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/session-keys/${keyId}`, {
      method: 'DELETE',
      headers: apiHeadersNoBody(),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { error: (body as Record<string, unknown>).error as string ?? `Failed: ${res.status}` }
    }

    revalidatePath(`/dashboard/agents/${agentId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function revokeAllSessionKeys(
  agentId: string,
  ownerAddress: string
): Promise<ActionResult & { keysRevoked?: number }> {
  await verifySession()

  if (!UUID_RE.test(agentId)) return { error: 'Invalid agent ID' }
  if (!ownerAddress) return { error: 'Owner address is required' }

  // SECURITY [CRITICAL-3]: Verify ownership before mutation
  const ownerCheck = await assertAgentOwnership(agentId)
  if (ownerCheck.error) return { error: ownerCheck.error }

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/revoke-all`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ owner_address: ownerAddress }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { error: (body as Record<string, unknown>).error as string ?? `Failed: ${res.status}` }
    }

    const data = await res.json() as { keys_revoked?: number }
    revalidatePath(`/dashboard/agents/${agentId}`)
    return { success: true, keysRevoked: data.keys_revoked }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}
