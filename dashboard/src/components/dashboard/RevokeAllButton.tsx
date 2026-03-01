'use client'

import { useTransition } from 'react'
import { ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { revokeAllSessionKeys } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface RevokeAllButtonProps {
  readonly agentId: string
  readonly ownerAddress: string
}

export function RevokeAllButton({ agentId, ownerAddress }: RevokeAllButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeAllSessionKeys(agentId, ownerAddress)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        const count = 'keysRevoked' in result ? result.keysRevoked : 0
        toast.success(`All session keys revoked (${String(count)} keys). Agent deactivated.`)
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <ShieldOff className="mr-2 h-4 w-4" />
          Revoke All Keys
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke All Session Keys</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately revoke ALL session keys for this agent and deactivate
            the agent. The agent will no longer be able to make any transactions.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRevoke}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isPending ? 'Revoking...' : 'Revoke All Keys'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
