import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, truncateAddress } from '@/lib/utils'
import { SpendMonitor } from '@/components/spend/SpendMonitor'
import type { Agent } from '@/lib/types'
import type { AgentSpendSummary } from '@/lib/types'

interface AgentCardProps {
  readonly agent: Agent
  readonly spend?: AgentSpendSummary | null
}

export function AgentCard({ agent, spend }: AgentCardProps) {
  return (
    <Card className="flex flex-col">
      <Link href={`/dashboard/agents/${agent.id}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'size-2 rounded-full',
                agent.is_active ? 'bg-green-500' : 'bg-muted-foreground'
              )}
            />
            <CardTitle className="text-base font-semibold">{agent.name}</CardTitle>
          </div>
          <Badge variant={agent.is_active ? 'default' : 'secondary'}>
            {agent.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </CardHeader>
      </Link>
      <CardContent className="flex-1 space-y-3">
        <p className="text-sm text-muted-foreground">
          Owner: {truncateAddress(agent.owner_address)}
        </p>
        {spend ? (
          <SpendMonitor
            agentId={agent.id}
            agentName={agent.name}
            initialSpent={spend.spend_24h}
            dailyCap={spend.max_spend_rule}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No spend data available</p>
        )}
      </CardContent>
    </Card>
  )
}
