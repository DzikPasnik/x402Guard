'use client'

import { useActionState, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createSessionKey } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CreateKeyDialogProps {
  readonly agentId: string
}

export function CreateKeyDialog({ agentId }: CreateKeyDialogProps) {
  const [open, setOpen] = useState(false)
  const boundAction = createSessionKey.bind(null, agentId)
  const [state, formAction, pending] = useActionState(boundAction, null)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      toast.success('Session key created')
    }
  }, [state])

  // Min datetime for expires_at (now + 1 hour)
  const minDate = new Date(Date.now() + 3600_000).toISOString().slice(0, 16)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Session Key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Session Key</DialogTitle>
          <DialogDescription>
            Grant limited spending access to a delegated key.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="public_key">Public Key</Label>
            <Input
              name="public_key"
              placeholder="0x..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_spend">Max Spend (USDC)</Label>
            <Input
              name="max_spend"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 100.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowed_contracts">Allowed Contracts</Label>
            <Input
              name="allowed_contracts"
              placeholder="0xabc..., 0xdef... (leave empty for any)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires_at">Expiration</Label>
            <Input
              name="expires_at"
              type="datetime-local"
              min={minDate}
              required
            />
          </div>

          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating...' : 'Create Key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
