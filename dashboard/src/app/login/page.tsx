import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WalletAuthButton } from '@/components/auth/wallet-auth-button'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">x402Guard</CardTitle>
          <CardDescription>
            Connect your wallet to access the dashboard.
            Sign a message to verify ownership — no gas fees, no blockchain transaction.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <WalletAuthButton />
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            x402Guard uses Sign-In with Ethereum (EIP-4361) for authentication.
            Your wallet address identifies your account. We never request transaction approval during sign-in.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
