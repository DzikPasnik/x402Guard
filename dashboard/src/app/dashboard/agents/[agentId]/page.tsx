import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAgent, getAgentRules, getAgentSessionKeys } from '@/lib/proxy'
import { verifySession } from '@/lib/dal'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { truncateAddress, formatUsdc } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

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
            <p className="text-sm text-muted-foreground">
              {truncateAddress(agent.owner_address)}
            </p>
          </div>
          <Badge variant={agent.is_active ? 'default' : 'secondary'} className="text-sm">
            {agent.is_active ? 'Active' : 'Inactive'}
          </Badge>
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

          <TabsContent value="rules" className="space-y-2 pt-4">
            {rules.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No guardrail rules configured.
                </p>
              </div>
            ) : (
              rules.map((rule) => (
                <Card key={rule.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">{rule.rule_type}</span>
                      <p className="text-xs text-muted-foreground">
                        {formatRuleParams(rule.rule_type, rule.rule_params)}
                      </p>
                    </div>
                    <Badge variant={rule.is_active ? 'outline' : 'secondary'}>
                      {rule.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="keys" className="space-y-2 pt-4">
            {sessionKeys.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No session keys.
                </p>
              </div>
            ) : (
              sessionKeys.map((key) => (
                <Card key={key.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="space-y-0.5">
                      <span className="text-sm font-mono">
                        {truncateAddress(key.public_key)}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {formatUsdc(key.spent)} / {formatUsdc(key.max_spend)} USDC
                        {' · '}
                        Expires {new Date(key.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={key.is_revoked ? 'destructive' : 'outline'}>
                      {key.is_revoked ? 'Revoked' : 'Active'}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    if (message.includes('404')) {
      notFound()
    }

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
          <p className="text-sm text-destructive">
            Failed to load agent: {message}
          </p>
        </div>
      </div>
    )
  }
}

/** Human-readable rule parameter description */
function formatRuleParams(ruleType: string, params: Record<string, unknown>): string {
  switch (ruleType) {
    case 'MaxSpendPerTx':
      return `Limit: ${formatUsdc(Number(params.limit ?? 0))} USDC per tx`
    case 'MaxSpendPerDay':
      return `Limit: ${formatUsdc(Number(params.limit ?? 0))} USDC per day`
    case 'AllowedContracts': {
      const addrs = Array.isArray(params.addresses) ? params.addresses : []
      return `${String(addrs.length)} allowed contract(s)`
    }
    case 'MaxLeverage':
      return `Max leverage: ${String(params.max ?? '?')}x`
    case 'MaxSlippage':
      return `Max slippage: ${String(Number(params.bps ?? 0) / 100)}%`
    default:
      return JSON.stringify(params)
  }
}
