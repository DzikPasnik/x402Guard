import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { GuardrailRule } from '@/lib/types'
import { formatUsdc } from '@/lib/utils'
import { RuleActions } from './RuleActions'

interface GuardrailTableProps {
  readonly rules: readonly GuardrailRule[]
  readonly agentId: string
}

const RULE_LABELS: Record<string, string> = {
  MaxSpendPerTx: 'Max Spend Per Tx',
  MaxSpendPerDay: 'Max Spend Per Day',
  AllowedContracts: 'Allowed Contracts',
  MaxLeverage: 'Max Leverage',
  MaxSlippage: 'Max Slippage',
}

function formatRuleValue(ruleType: string, params: Record<string, unknown>): string {
  switch (ruleType) {
    case 'MaxSpendPerTx':
    case 'MaxSpendPerDay':
      return `${formatUsdc(Number(params.limit ?? 0))} USDC`
    case 'AllowedContracts': {
      const addrs = Array.isArray(params.addresses) ? params.addresses : []
      return `${String(addrs.length)} contract(s)`
    }
    case 'MaxLeverage':
      return `${String(params.max ?? '?')}x`
    case 'MaxSlippage':
      return `${String(Number(params.bps ?? 0) / 100)}%`
    default:
      return JSON.stringify(params)
  }
}

export function GuardrailTable({ rules, agentId }: GuardrailTableProps) {
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No guardrail rules configured. Add a rule to protect this agent.
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rule Type</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell className="font-medium">
              {RULE_LABELS[rule.rule_type] ?? rule.rule_type}
            </TableCell>
            <TableCell>{formatRuleValue(rule.rule_type, rule.rule_params)}</TableCell>
            <TableCell>
              <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                {rule.is_active ? 'Active' : 'Disabled'}
              </Badge>
            </TableCell>
            <TableCell>
              <RuleActions agentId={agentId} ruleId={rule.id} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
