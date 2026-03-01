import { verifySession } from '@/lib/dal'

export default async function DashboardPage() {
  const { user } = await verifySession()

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">x402Guard Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome, {user.user_metadata?.wallet_address ?? user.email}
        </p>
        <p className="text-sm text-muted-foreground">
          Agent overview, guardrails, and session key management coming in Plan 04-02.
        </p>
      </div>
    </div>
  )
}
