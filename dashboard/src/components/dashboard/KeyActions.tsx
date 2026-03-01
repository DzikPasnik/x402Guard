'use client'

import { useTransition } from 'react'
import { MoreHorizontal, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { revokeSessionKey } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface KeyActionsProps {
  readonly agentId: string
  readonly keyId: string
}

export function KeyActions({ agentId, keyId }: KeyActionsProps) {
  const [isPending, startTransition] = useTransition()

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeSessionKey(agentId, keyId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Session key revoked')
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
          onClick={handleRevoke}
          className="text-destructive focus:text-destructive"
        >
          <Ban className="mr-2 h-4 w-4" />
          Revoke Key
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
