import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Agent } from '@/lib/types'
import { truncateAddress } from '@/lib/utils'

interface AgentCardProps {
  readonly agent: Agent
}

export function AgentCard({ agent }: AgentCardProps) {
  return (
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
  )
}
