import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const usdcFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Convert USDC minor units (6 decimals) to human-readable string. */
export function formatUsdc(amount: number): string {
  return usdcFormatter.format(amount / 1_000_000)
}

/** Truncate an address for display: 0x1234...5678 */
export function truncateAddress(address: string | undefined | null): string {
  if (!address) return ''
  if (address.length < 10) return address

  // Ethereum-style (0x prefix)
  if (address.startsWith('0x')) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Solana-style (base58, no 0x prefix)
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}
