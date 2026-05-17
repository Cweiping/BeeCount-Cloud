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

`EMBEDDING_BASE_URL` and `EMBEDDING_MODEL` should stay aligned with the bundled docs index. The template defaults are already set to `https://api.siliconflow.cn/v1` and `BAAI/bge-m3`; do not replace them with empty strings.

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

AI-specific notes from live validation:

- `https://sub2api.aisbti.com/v1` with `gpt-5.4` works for text chat provider tests.
- The same provider also works for vision/image tests when `visionModel=gpt-5.4`.
- That provider does not expose `/v1/embeddings`, so it cannot power `/api/v1/ai/ask` doc Q&A by itself.
- That provider also does not expose `/v1/audio/transcriptions`, so server-side speech capability tests require a different provider/model.
- Web voice input in the browser is separate: it uses the browser Web Speech API and does not send audio through BeeCount Cloud.

## Known tradeoffs

- Cold starts are materially slower than Docker Compose because the template installs `fuse` and `tigrisfs` at runtime
- First request after sleep may need `/__cf/start` warm-up
- SQLite on top of an object-storage FUSE mount has more operational risk than SQLite on a normal disk
- This path is suitable for evaluation and light workloads first; treat production rollout carefully
