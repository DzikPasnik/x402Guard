import Link from "next/link"
import { Shield, Wallet, FileCheck } from "lucide-react"

const useCases = [
  {
    href: "/use-cases/elizaos-agent-security",
    title: "ElizaOS Agent Security",
    description: "Spend limits & guardrails for ElizaOS agents",
    icon: Shield,
  },
  {
    href: "/use-cases/defi-spend-limits",
    title: "DeFi Spend Limits",
    description: "Per-tx and daily caps on autonomous payments",
    icon: Wallet,
  },
  {
    href: "/use-cases/contract-whitelist",
    title: "Contract Whitelist",
    description: "Allow only approved contract addresses",
    icon: FileCheck,
  },
] as const

interface RelatedUseCasesProps {
  readonly currentPath: string
}

export default function RelatedUseCases({ currentPath }: RelatedUseCasesProps) {
  const related = useCases.filter((uc) => uc.href !== currentPath)

  return (
    <section className="mt-16 border-t border-white/10 pt-12">
      <h2 className="text-xl font-semibold mb-6 text-white/90">
        Related Use Cases
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {related.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-3 mb-2">
              <Icon className="h-5 w-5 text-white/40 group-hover:text-white/70 transition-colors" />
              <h3 className="font-medium text-white/80 group-hover:text-white transition-colors">
                {title}
              </h3>
            </div>
            <p className="text-sm text-white/50">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
