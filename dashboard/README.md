# x402Guard Dashboard

Web UI for monitoring agents, managing guardrail rules, and viewing audit logs for the x402Guard proxy.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- shadcn/ui v3 (Radix UI primitives)
- Tailwind CSS 4
- RainbowKit + SIWE (Sign-In with Ethereum)
- Supabase (Postgres + Row Level Security)

## Prerequisites

- Node.js 22+
- A Supabase project (URL and anon key)
- x402Guard proxy running (default: `http://localhost:3001`)

## Setup

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local with your values (see table below)
npm run dev
```

Open http://localhost:3000.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon/public key |
| `PROXY_URL` | yes | x402Guard proxy base URL (server-side only) |
| `MANAGEMENT_API_KEY` | yes | API key for proxy management endpoints (server-side only) |
| `DEV_SKIP_AUTH` | no | Set to `true` to bypass wallet auth during local development |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | Wallet connect and SIWE sign-in |
| `/dashboard` | Agents overview — list, create, deactivate |
| `/dashboard/agents/[id]` | Agent detail: spend stats, guardrail rules CRUD, session keys |
| `/dashboard/logs` | Immutable audit log with date range, agent, and event type filters |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright E2E tests (8 tests covering critical flows) |

## E2E Tests

The Playwright suite covers:

- Landing page navigation to login
- Login page rendering
- Dashboard redirect when unauthenticated
- Agent creation flow
- Guardrail rule creation
- Audit log page with filters
- Spend monitoring display
- Session key management

```bash
npm run test:e2e
```

Test results are written to `test-results/`.

## License

MIT
