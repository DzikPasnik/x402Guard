import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { base, baseSepolia } from 'wagmi/chains'

// Fallback projectId for build-time (RainbowKit requires a non-empty string).
// Runtime auth will fail without a real WalletConnect Cloud project ID in .env.local.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'BUILD_PLACEHOLDER'

export const wagmiConfig = getDefaultConfig({
  appName: 'x402Guard',
  projectId,
  chains: [base, baseSepolia],
  ssr: true, // REQUIRED: prevents hydration mismatch in Next.js App Router
})
