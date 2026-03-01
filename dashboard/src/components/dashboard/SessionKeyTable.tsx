import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { SessionKey } from '@/lib/types'
import { formatUsdc, truncateAddress } from '@/lib/utils'
import { KeyActions } from './KeyActions'

interface SessionKeyTableProps {
  readonly keys: readonly SessionKey[]
  readonly agentId: string
}

export function SessionKeyTable({ keys, agentId }: SessionKeyTableProps) {
  if (keys.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No session keys. Create a key to give this agent limited access.
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Public Key</TableHead>
          <TableHead>Spent / Max</TableHead>
          <TableHead>Contracts</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => {
          const spentPct = key.max_spend > 0 ? key.spent / key.max_spend : 0
          return (
            <TableRow key={key.id}>
              <TableCell className="font-mono text-sm">
                {truncateAddress(key.public_key)}
              </TableCell>
              <TableCell>
                <span className={spentPct >= 0.8 ? 'text-destructive font-medium' : ''}>
                  {formatUsdc(key.spent)}
                </span>
                {' / '}
                {formatUsdc(key.max_spend)} USDC
              </TableCell>
              <TableCell>
                {key.allowed_contracts.length === 0
                  ? 'Any'
                  : `${String(key.allowed_contracts.length)} contract(s)`}
              </TableCell>
              <TableCell>{new Date(key.expires_at).toLocaleDateString()}</TableCell>
              <TableCell>
                <Badge variant={key.is_revoked ? 'destructive' : 'default'}>
                  {key.is_revoked ? 'Revoked' : 'Active'}
                </Badge>
              </TableCell>
              <TableCell>
                {!key.is_revoked && (
                  <KeyActions agentId={agentId} keyId={key.id} />
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
