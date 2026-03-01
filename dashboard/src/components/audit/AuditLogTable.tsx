'use client'

import { useState, useCallback } from 'react'
import { format } from 'date-fns'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { EventTypeBadge } from './EventTypeBadge'
import { MetadataViewer } from './MetadataViewer'
import { AuditLogFilters } from './AuditLogFilters'
import {
  fetchAuditLog,
  type AuditPage,
  type AuditRow,
  type AuditLogFilters as FilterType,
  type AgentOption,
  type AuditEventType,
} from '@/lib/audit-queries'

interface AuditLogTableProps {
  readonly initialData: AuditPage
  readonly agents: readonly AgentOption[]
}

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: 'created_at',
    header: 'Timestamp',
    cell: ({ row }) => (
      <span className="text-sm whitespace-nowrap">
        {format(new Date(row.original.created_at), 'MMM d, HH:mm:ss')}
      </span>
    ),
  },
  {
    accessorKey: 'event_type',
    header: 'Event',
    cell: ({ row }) => (
      <EventTypeBadge eventType={row.original.event_type as AuditEventType} />
    ),
  },
  {
    accessorKey: 'agent_id',
    header: 'Agent',
    cell: ({ row, table }) => {
      const agentId = row.original.agent_id
      if (!agentId) return <span className="text-muted-foreground">--</span>
      const agents = (table.options.meta as { agents: readonly AgentOption[] })?.agents ?? []
      const agent = agents.find((a) => a.id === agentId)
      return <span className="text-sm">{agent?.name ?? `${agentId.slice(0, 8)}...`}</span>
    },
  },
  {
    accessorKey: 'session_key_id',
    header: 'Session Key',
    cell: ({ row }) => {
      const keyId = row.original.session_key_id
      if (!keyId) return <span className="text-muted-foreground">--</span>
      return <span className="text-sm font-mono">{keyId.slice(0, 8)}...</span>
    },
  },
  {
    accessorKey: 'metadata',
    header: 'Metadata',
    cell: ({ row }) => <MetadataViewer metadata={row.original.metadata} />,
    enableSorting: false,
  },
]

export function AuditLogTable({ initialData, agents }: AuditLogTableProps) {
  const [filters, setFilters] = useState<FilterType>({ pageSize: 25 })
  const [data, setData] = useState<AuditPage>(initialData)
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refetch = useCallback(async (newFilters: FilterType) => {
    setIsLoading(true)
    try {
      const result = await fetchAuditLog(newFilters)
      setData(result)
    } catch {
      // Error handled silently — data stays stale
    } finally {
      setIsLoading(false)
    }
  }, [])

  function handleFilterChange(newFilters: FilterType) {
    setFilters(newFilters)
    setCursorStack([])
    void refetch(newFilters)
  }

  function handleNext() {
    const lastRow = data.rows[data.rows.length - 1]
    if (!lastRow) return

    const firstRow = data.rows[0]
    if (firstRow) {
      setCursorStack((prev) => [...prev, firstRow.id])
    }

    void refetch({ ...filters, cursorId: lastRow.id })
  }

  function handlePrevious() {
    setCursorStack((prev) => {
      const next = [...prev]
      const cursor = next.pop()
      void refetch({ ...filters, cursorId: cursor })
      return next
    })
  }

  const table = useReactTable({
    data: data.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: { agents },
  })

  return (
    <div className="space-y-4">
      <AuditLogFilters agents={agents} value={filters} onChange={handleFilterChange} />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                  {isLoading ? 'Loading...' : 'No audit events found.'}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Showing {data.rows.length} rows
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={cursorStack.length === 0 || isLoading}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={!data.hasNextPage || isLoading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
