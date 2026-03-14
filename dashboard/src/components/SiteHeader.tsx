"use client"

import Link from "next/link"
import { Shield, Github } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const navLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/faq", label: "FAQ" },
  { href: "/use-cases/elizaos-agent-security", label: "Use Cases" },
] as const

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#09090b]/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <span className="font-bold">x402Guard</span>
            <Badge
              variant="secondary"
              className="text-[10px] bg-white/10 text-white/70 border-0"
            >
              BETA
            </Badge>
          </Link>
          <nav className="hidden sm:flex items-center gap-4">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm text-white/50 hover:text-white transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            href="https://github.com/DzikPasnik/x402Guard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-white/50 hover:text-white flex items-center gap-1.5"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Launch Dashboard
          </Link>
        </nav>
      </div>
    </header>
  )
}
