# BeeCount Cloud on Cloudflare Containers

This directory contains a Cloudflare Containers deployment template for BeeCount Cloud.

It is intentionally secret-free:

- Do not commit `AWS_ACCESS_KEY_ID`
- Do not commit `AWS_SECRET_ACCESS_KEY`
- Do not commit `BOOTSTRAP_ADMIN_PASSWORD`
- Do not commit `.dev.vars*` or `.wrangler/`

## What this template does

- Runs the published BeeCount Cloud image inside Cloudflare Containers
- Mounts an R2 bucket to `/data` with `tigrisfs`
- Stores SQLite, attachments, backups, and JWT secret inside the mounted R2 path
- Exposes diagnostic endpoints:
  - `/__cf/diag`
  - `/__cf/start`
  - `/__mount_report.txt`

## Important caveats

- This is an experimental deployment path, not the primary recommended deployment
- Cold starts are much slower than Docker Compose because the container installs `fuse` and `tigrisfs` at runtime
- First request after sleep may need a warm-up hit to `/__cf/start`
- SQLite over an object-store FUSE mount is workable for functional validation, but still riskier than a real block filesystem

## Before deploy

1. Edit [wrangler.jsonc](./wrangler.jsonc):
   - set `R2_BUCKET_NAME`
   - set `R2_ACCOUNT_ID`
   - set `CORS_ORIGINS`
   - optionally change `BOOTSTRAP_ADMIN_EMAIL`
2. Create an R2 API token scoped to that bucket with `Object Read & Write`
3. Install dependencies:

```bash
npm install
```

## Secrets

Inject secrets locally, never in git:

```bash
npx wrangler versions secret put AWS_ACCESS_KEY_ID
npx wrangler versions secret put AWS_SECRET_ACCESS_KEY
npx wrangler versions secret put BOOTSTRAP_ADMIN_PASSWORD
```

Optional if you want AI doc Q&A:

```bash
npx wrangler versions secret put EMBEDDING_API_KEY
```

## Deploy

```bash
npx wrangler deploy
```

## Warm-up and checks

```bash
curl https://your-worker.workers.dev/__cf/start
curl https://your-worker.workers.dev/healthz
curl https://your-worker.workers.dev/ready
curl https://your-worker.workers.dev/__mount_report.txt
curl https://your-worker.workers.dev/api/v1/version
```

## What was validated in practice

- R2 mount succeeded
- Web login succeeded
- Ledger create/read succeeded
- Transaction create/read succeeded
- MCP SSE handshake succeeded
- WebSocket ping/pong succeeded
