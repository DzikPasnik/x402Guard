'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'

const PROXY_BASE = process.env.PROXY_URL ?? 'http://localhost:3402'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ActionResult = { success: true } | { error: string }
type FormActionResult = ActionResult | null

// ─── Guardrail Rules ───────────────────────────────────────────────

export async function createGuardrailRule(
  agentId: string,
  _prevState: FormActionResult,
  formData: FormData
): Promise<FormActionResult> {
  await verifySession()

  if (!UUID_RE.test(agentId)) return { error: 'Invalid agent ID' }

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
      headers: { 'Content-Type': 'application/json' },
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

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/rules/${ruleId}`, {
      method: 'DELETE',
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
      headers: { 'Content-Type': 'application/json' },
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

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/session-keys/${keyId}`, {
      method: 'DELETE',
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

  try {
    const res = await fetch(`${PROXY_BASE}/api/v1/agents/${agentId}/revoke-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
