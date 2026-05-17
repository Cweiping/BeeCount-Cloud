# Cloudflare Containers Deployment

This document describes the experimental Cloudflare Containers deployment path for BeeCount Cloud.

## Positioning

Use this path when you specifically want:

- Cloudflare-managed container runtime
- a single public Workers URL
- R2-backed data persistence

Default recommendation is still Docker Compose on a VPS or NAS. That path has lower cold-start latency and a safer persistence model for SQLite.

## Architecture

- Runtime: Cloudflare Containers
- Public entry: Worker + Durable Object container binding
- Persistence: R2 bucket mounted to `/data` via `tigrisfs`
- App image: `sunxiao0721/beecount-cloud`

BeeCount Cloud expects these files to persist in `/data`:

- `beecount.db`
- attachments
- backups
- `.jwt_secret`
- `.initial_admin_password`
- `rclone.conf`

## Template

Use the template in [cloudflare-containers-beecount](../cloudflare-containers-beecount/README.md).

## Required secrets

Set them locally with Wrangler:

```bash
npx wrangler versions secret put AWS_ACCESS_KEY_ID
npx wrangler versions secret put AWS_SECRET_ACCESS_KEY
npx wrangler versions secret put BOOTSTRAP_ADMIN_PASSWORD
```

Optional:

```bash
npx wrangler versions secret put EMBEDDING_API_KEY
```

## Required config

Edit `cloudflare-containers-beecount/wrangler.jsonc` and replace:

- `R2_BUCKET_NAME`
- `R2_ACCOUNT_ID`
- `CORS_ORIGINS`
- `BOOTSTRAP_ADMIN_EMAIL` if needed

## Deploy

```bash
cd cloudflare-containers-beecount
npm install
npx wrangler deploy
```

## Validation checklist

Warm the container first:

```bash
curl https://your-worker.workers.dev/__cf/start
```

Then verify:

```bash
curl https://your-worker.workers.dev/healthz
curl https://your-worker.workers.dev/ready
curl https://your-worker.workers.dev/__mount_report.txt
curl https://your-worker.workers.dev/api/v1/version
```

Functional checks:

1. Log in to the web UI with the bootstrap admin.
2. Create a ledger.
3. Create a transaction.
4. Read it back from `/api/v1/read/ledgers/{ledger_id}/transactions`.
5. Create an MCP PAT and verify `/api/v1/mcp/sse`.
6. Connect to `/ws` and verify ping/pong.

## Known tradeoffs

- Cold starts are materially slower than Docker Compose because the template installs `fuse` and `tigrisfs` at runtime
- First request after sleep may need `/__cf/start` warm-up
- SQLite on top of an object-storage FUSE mount has more operational risk than SQLite on a normal disk
- This path is suitable for evaluation and light workloads first; treat production rollout carefully
