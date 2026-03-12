'use client'

import { useAccount } from 'wagmi'
import { LogOut, User, ExternalLink, Bot } from 'lucide-react'
import { useSignOut } from '@/hooks/use-sign-out'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function ProfileDropdown() {
  const { address } = useAccount()
  const { signOut } = useSignOut()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <User className="h-4 w-4" />
          {address ? truncateAddress(address) : 'Profile'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {address && (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">Connected Wallet</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {truncateAddress(address)}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/agent" className="cursor-pointer">
            <Bot className="mr-2 h-4 w-4" />
            Agent Demo
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href="https://github.com/DzikPasnik/x402Guard"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            GitHub
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
