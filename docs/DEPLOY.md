# x402Guard Deployment Guide

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────────┐
│  Dashboard   │◄──────────────►│  Vercel (free)    │
│  (Next.js)   │                │  x402guard.vercel │
└──────┬───────┘                └──────────────────┘
       │ /api/proxy/*
       ▼ (rewrite)
┌──────────────┐     HTTPS      ┌──────────────────┐
│  Rust Proxy  │◄──────────────►│  Railway (~$5/mo) │
│  (Axum)      │                │  proxy.railway    │
└──────┬───────┘                └──────────────────┘
       │
  ┌────┴────┐
  ▼         ▼
┌──────┐  ┌──────┐
│Supa  │  │Redis │   ← Already cloud-hosted
│base  │  │(Upst)│
└──────┘  └──────┘
```

## Prerequisites

- GitHub repository (public or private)
- [Vercel account](https://vercel.com) (free)
- [Railway account](https://railway.com) (~$5/mo)
- [Upstash account](https://upstash.com) (free tier: 10k requests/day)
- Supabase project (already set up)
- [WalletConnect Cloud](https://cloud.walletconnect.com) project ID

## Step 1: Set Up Upstash Redis

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database (choose the region closest to Railway)
3. Copy the **Redis URL** (starts with `rediss://...`) — you'll need it for Railway

## Step 2: Deploy Proxy to Railway

1. Go to [railway.com](https://railway.com) and create a new project
2. Select **"Deploy from GitHub Repo"** → connect your x402Guard repo
3. Railway auto-detects `railway.json` and uses the Dockerfile
4. Set environment variables in Railway dashboard:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://...` | Supabase connection string (Settings → Database → Connection string → URI) |
| `UPSTASH_REDIS_URL` | `rediss://...` | From Upstash console |
| `MANAGEMENT_API_KEY` | `openssl rand -hex 32` | Generate locally, paste in |
| `RUST_LOG` | `warn` | Production logging level |
| `BASE_SEPOLIA_RPC_URL` | `https://sepolia.base.org` | Free public RPC |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Dashboard URL for CORS |
| `PROXY_PORT` | `3402` | Railway will map this automatically |

5. Deploy. Railway provides a public URL like `x402guard-proxy-production.up.railway.app`
6. Verify: `curl https://YOUR-RAILWAY-URL/api/v1/health`

## Step 3: Deploy Dashboard to Vercel

1. Go to [vercel.com](https://vercel.com) → Import Git Repository
2. Select the x402Guard repo
3. Set **Root Directory** to `dashboard`
4. Set **Framework Preset** to Next.js
5. Set **Install Command** to `rm -f package-lock.json && npm install`
6. Add environment variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Supabase anon key |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `abc123` | From WalletConnect Cloud |
| `PROXY_URL` | `https://YOUR-RAILWAY-URL` | Railway proxy URL (server-side) |
| `MANAGEMENT_API_KEY` | (same as Railway) | For server actions that call proxy |
| `SIWE_NONCE_SECRET` | `openssl rand -hex 32` | SIWE nonce signing |
| `SUPABASE_WALLET_SECRET` | `openssl rand -hex 32` | Wallet→Supabase auth bridge |

7. Deploy. Vercel provides a URL like `x402guard.vercel.app`

## Step 4: Update CORS

After both are deployed, update Railway env:

```
ALLOWED_ORIGINS=https://your-app.vercel.app
```

## Step 5: Solana Devnet Deploy (Optional)

Requires Anchor CLI installed locally:

```bash
cd solana

# Generate a new program keypair for devnet
solana-keygen new -o target/deploy/x402_guard-keypair.json --no-bip39-passphrase

# Get the program ID
solana address -k target/deploy/x402_guard-keypair.json
# → e.g. "7xK...abc"

# Update lib.rs declare_id!() and Anchor.toml with the new program ID

# Airdrop SOL for deploy fees (devnet is free)
solana airdrop 5 --url devnet

# Deploy
anchor deploy --provider.cluster devnet

# Verify
solana program show <PROGRAM_ID> --url devnet
```

Then add to Railway env vars:
```
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=<your-deployed-program-id>
SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

## Step 6: CI/CD Auto-Deploy

Deploy happens automatically on push to `main`:
- **Vercel**: watches the repo via Git Integration (zero config)
- **Railway**: triggered by `.github/workflows/deploy.yml`

Required GitHub secrets:
- `RAILWAY_TOKEN` — from Railway dashboard → Account Settings → Tokens

Required GitHub variables:
- `DASHBOARD_URL` — your Vercel URL (for health checks)
- `PROXY_PUBLIC_URL` — your Railway URL (for health checks)

## Step 7: Custom Domain (Optional)

### Vercel (Dashboard)
1. Vercel Dashboard → Project → Settings → Domains
2. Add `app.x402guard.dev` (or your domain)
3. Add DNS CNAME: `app` → `cname.vercel-dns.com`

### Railway (Proxy)
1. Railway Dashboard → Service → Settings → Domains
2. Add `proxy.x402guard.dev`
3. Add DNS CNAME: `proxy` → Railway-provided value

## Security Checklist

- [ ] All secrets set via hosting dashboards (never in code)
- [ ] `RUST_LOG=warn` in production (no debug/trace)
- [ ] `MANAGEMENT_API_KEY` is set (fail-closed if missing)
- [ ] `ALLOWED_ORIGINS` restricts CORS to dashboard URL only
- [ ] Supabase RLS enabled on all tables
- [ ] Railway service runs as non-root (Dockerfile USER x402)
- [ ] HTTPS enforced on all endpoints (Vercel/Railway default)
- [ ] No `.env` files committed (check with `git log --all -p -- '*.env*'`)

## Cost Estimate

| Service | Tier | Cost |
|---------|------|------|
| Vercel (dashboard) | Hobby | $0/mo |
| Railway (proxy) | Starter | ~$5/mo |
| Upstash Redis | Free | $0/mo (10k req/day) |
| Supabase | Free | $0/mo (50k rows, 500MB) |
| Solana devnet | — | $0 |
| **Total** | | **~$5/mo** |
