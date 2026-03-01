import { verifySession } from '@/lib/dal'
import { getAgentsByOwner } from '@/lib/proxy'
import { AgentCard } from '@/components/dashboard/AgentCard'

export default async function DashboardPage() {
  const { user } = await verifySession()

  const walletAddress = user.user_metadata?.wallet_address as string | undefined

  if (!walletAddress) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Monitor and manage your x402Guard agents.
          </p>
        </div>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No wallet address found in session. Please sign out and reconnect your wallet.
          </p>
        </div>
      </div>
    )
  }

  let agents: Awaited<ReturnType<typeof getAgentsByOwner>> = []
  let fetchError: string | null = null

  try {
    agents = await getAgentsByOwner(walletAddress)
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Failed to fetch agents'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
        <p className="text-muted-foreground">
          Monitor and manage your x402Guard agents.
        </p>
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{fetchError}</p>
        </div>
      ) : agents.length === 0 ? (
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
  )
}
