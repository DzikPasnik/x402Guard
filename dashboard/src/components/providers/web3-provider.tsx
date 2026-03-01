'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { useState } from 'react'
import { wagmiConfig } from '@/lib/wagmi-config'
import '@rainbow-me/rainbowkit/styles.css'

export function Web3Providers({ children }: { children: React.ReactNode }) {
  // QueryClient must be created inside component — prevents shared state between SSR requests
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
