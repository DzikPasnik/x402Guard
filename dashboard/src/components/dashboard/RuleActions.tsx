'use client'

import { useTransition } from 'react'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteGuardrailRule } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface RuleActionsProps {
  readonly agentId: string
  readonly ruleId: string
}

export function RuleActions({ agentId, ruleId }: RuleActionsProps) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteGuardrailRule(agentId, ruleId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Rule deleted')
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={isPending}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Rule
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
