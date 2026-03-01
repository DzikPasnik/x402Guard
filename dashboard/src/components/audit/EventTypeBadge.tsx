import type { AuditEventType } from '@/lib/types'
import { cn } from '@/lib/utils'

export const EVENT_COLORS: Record<AuditEventType, string> = {
  proxy_request_received: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  proxy_request_forwarded: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  proxy_request_failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  guardrail_violation: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  session_key_created: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  session_key_used: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  session_key_revoked: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  all_session_keys_revoked: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  agent_created: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  agent_deactivated: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  solana_vault_queried: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  solana_withdraw_submitted: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  solana_withdraw_confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  solana_withdraw_failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

export const EVENT_LABELS: Record<AuditEventType, string> = {
  proxy_request_received: 'Request In',
  proxy_request_forwarded: 'Forwarded',
  proxy_request_failed: 'Failed',
  guardrail_violation: 'Violation',
  session_key_created: 'Key Created',
  session_key_used: 'Key Used',
  session_key_revoked: 'Key Revoked',
  all_session_keys_revoked: 'All Revoked',
  agent_created: 'Agent Created',
  agent_deactivated: 'Deactivated',
  solana_vault_queried: 'Vault Query',
  solana_withdraw_submitted: 'SOL Submit',
  solana_withdraw_confirmed: 'SOL Confirmed',
  solana_withdraw_failed: 'SOL Failed',
}

interface EventTypeBadgeProps {
  readonly eventType: AuditEventType
}

export function EventTypeBadge({ eventType }: EventTypeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        EVENT_COLORS[eventType] ?? 'bg-gray-100 text-gray-800'
      )}
    >
      {EVENT_LABELS[eventType] ?? eventType}
    </span>
  )
}
