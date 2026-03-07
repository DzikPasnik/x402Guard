'use client'

import { X, Filter } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DateRangePicker } from './DateRangePicker'
import { EVENT_LABELS } from './EventTypeBadge'
import { ALL_EVENT_TYPES, type AuditLogFilters as Filters, type AuditEventType } from '@/lib/audit-queries'
import type { AgentOption } from '@/lib/audit-queries'

interface AuditLogFiltersProps {
  readonly agents: readonly AgentOption[]
  readonly value: Filters
  readonly onChange: (filters: Filters) => void
}

export function AuditLogFilters({ agents, value, onChange }: AuditLogFiltersProps) {
  const hasActiveFilters = !!(value.agentId || (value.eventTypes && value.eventTypes.length > 0) || value.fromDate)

  function toggleEventType(eventType: AuditEventType) {
    const current = value.eventTypes ?? []
    const updated = current.includes(eventType)
      ? current.filter((t) => t !== eventType)
      : [...current, eventType]
    onChange({ ...value, eventTypes: updated.length > 0 ? updated : undefined, cursorId: undefined })
  }

  function handleDateChange(range: DateRange | undefined) {
    onChange({
      ...value,
      fromDate: range?.from?.toISOString(),
      toDate: range?.to?.toISOString(),
      cursorId: undefined,
    })
  }

  function clearAll() {
    onChange({ pageSize: value.pageSize })
  }

  const dateValue: DateRange | undefined =
    value.fromDate ? { from: new Date(value.fromDate), to: value.toDate ? new Date(value.toDate) : undefined } : undefined

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Agent filter */}
      <Select
        value={value.agentId ?? '__all__'}
        onValueChange={(v) => onChange({ ...value, agentId: v === '__all__' ? undefined : v, cursorId: undefined })}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Agents" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Agents</SelectItem>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name}{!agent.is_active ? ' (inactive)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Event type multi-select */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Event Types
            {value.eventTypes && value.eventTypes.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {value.eventTypes.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80 overflow-auto">
          {ALL_EVENT_TYPES.map((et) => (
            <DropdownMenuCheckboxItem
              key={et}
              checked={value.eventTypes?.includes(et) ?? false}
              onCheckedChange={() => toggleEventType(et)}
            >
              {EVENT_LABELS[et]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Date range */}
      <DateRangePicker value={dateValue} onChange={handleDateChange} />

      {/* Clear button */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
