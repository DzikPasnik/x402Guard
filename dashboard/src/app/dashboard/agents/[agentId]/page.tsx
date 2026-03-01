import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAgent, getAgentRules, getAgentSessionKeys } from '@/lib/proxy'
import { verifySession } from '@/lib/dal'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { truncateAddress } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import { GuardrailTable } from '@/components/dashboard/GuardrailTable'
import { CreateRuleDialog } from '@/components/dashboard/CreateRuleDialog'
import { SessionKeyTable } from '@/components/dashboard/SessionKeyTable'
import { CreateKeyDialog } from '@/components/dashboard/CreateKeyDialog'
import { RevokeAllButton } from '@/components/dashboard/RevokeAllButton'

interface AgentDetailPageProps {
  readonly params: Promise<{ agentId: string }>
}

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  await verifySession()
  const { agentId } = await params

  try {
    const [agent, rules, sessionKeys] = await Promise.all([
      getAgent(agentId),
      getAgentRules(agentId),
      getAgentSessionKeys(agentId),
    ])

    return (
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Overview
        </Link>

        {/* Agent header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {truncateAddress(agent.owner_address)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={agent.is_active ? 'default' : 'secondary'} className="text-sm">
              {agent.is_active ? 'Active' : 'Inactive'}
            </Badge>
            <RevokeAllButton agentId={agentId} ownerAddress={agent.owner_address} />
          </div>
        </div>

        {/* Tabs — rules + session keys */}
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('404')) notFound()

    return (
      <div className="space-y-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Overview
        </Link>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">Failed to load agent: {message}</p>
        </div>
      </div>
    )
  }
}
