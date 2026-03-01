import { fetchAuditLog, fetchAgents } from '@/lib/audit-queries'
import { AuditLogTable } from '@/components/audit/AuditLogTable'

export const metadata = { title: 'Audit Log | x402Guard' }

export default async function AuditLogPage() {
  const [initialData, agents] = await Promise.all([
    fetchAuditLog({ pageSize: 25 }),
    fetchAgents(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Inspect proxy requests, guardrail violations, session key events, and Solana operations.
        </p>
      </div>
      <AuditLogTable initialData={initialData} agents={agents} />
    </div>
  )
}
