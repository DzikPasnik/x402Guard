import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          x402Guard
        </h1>

        <p className="text-xl text-muted-foreground max-w-[600px]">
          Non-custodial x402 safety proxy for autonomous DeFi agents.
        </p>

        <div className="p-8 bg-card border rounded-lg shadow-sm space-y-4 max-w-[500px]">
          <h2 className="text-2xl font-semibold">Protect your AI agents</h2>
          <p className="text-muted-foreground">
            Configurable spend limits, contract whitelists, session keys, and an immutable audit log — without ever holding your funds.
          </p>
        </div>

        <div className="flex gap-4 items-center flex-col sm:flex-row mt-8">
          <Button asChild size="lg">
            <Link href="/login">
              Launch Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="https://github.com/x402guard/x402Guard" target="_blank" rel="noopener noreferrer">
              View on GitHub
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
