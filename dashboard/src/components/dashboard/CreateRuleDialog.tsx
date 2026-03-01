'use client'

import { useActionState, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createGuardrailRule } from '@/app/dashboard/actions'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CreateRuleDialogProps {
  readonly agentId: string
}

const RULE_OPTIONS = [
  { value: 'MaxSpendPerTx', label: 'Max Spend Per Transaction' },
  { value: 'MaxSpendPerDay', label: 'Max Spend Per Day' },
  { value: 'AllowedContracts', label: 'Allowed Contracts' },
  { value: 'MaxLeverage', label: 'Max Leverage' },
  { value: 'MaxSlippage', label: 'Max Slippage (bps)' },
] as const

export function CreateRuleDialog({ agentId }: CreateRuleDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState('')
  const boundAction = createGuardrailRule.bind(null, agentId)
  const [state, formAction, pending] = useActionState(boundAction, null)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      setSelectedType('')
      toast.success('Guardrail rule created')
    }
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Rule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Guardrail Rule</DialogTitle>
          <DialogDescription>
            Configure a new safety guardrail for this agent.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule_type">Rule Type</Label>
            <Select
              name="rule_type"
              value={selectedType}
              onValueChange={setSelectedType}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a rule type" />
              </SelectTrigger>
              <SelectContent>
                {RULE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            {(selectedType === 'MaxSpendPerTx' || selectedType === 'MaxSpendPerDay') && (
              <Input
                name="value"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount in USDC"
                required
              />
            )}
            {selectedType === 'AllowedContracts' && (
              <Input
                name="value"
                placeholder="0xabc..., 0xdef... (comma-separated)"
                required
              />
            )}
            {selectedType === 'MaxLeverage' && (
              <Input
                name="value"
                type="number"
                min="1"
                max="100"
                placeholder="e.g. 3 for 3x"
                required
              />
            )}
            {selectedType === 'MaxSlippage' && (
              <Input
                name="value"
                type="number"
                min="1"
                max="10000"
                placeholder="Basis points (e.g. 50 = 0.5%)"
                required
              />
            )}
            {!selectedType && (
              <Input name="value" placeholder="Select a rule type first" disabled />
            )}
          </div>

          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending || !selectedType}>
              {pending ? 'Creating...' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
