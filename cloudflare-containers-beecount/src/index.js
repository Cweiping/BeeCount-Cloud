import { Container, getContainer } from "@cloudflare/containers";

const startupCommand = `
set -eu

export DEBIAN_FRONTEND=noninteractive
REPORT_FILE="/app/static/__mount_report.txt"
R2_ENDPOINT="https://\${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

apt-get update >/tmp/bootstrap-apt.log 2>&1
apt-get install -y --no-install-recommends ca-certificates curl fuse procps >>/tmp/bootstrap-apt.log 2>&1

ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi
if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi
VERSION="$(curl -s https://api.github.com/repos/tigrisdata/tigrisfs/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4)"
curl -L "https://github.com/tigrisdata/tigrisfs/releases/download/\${VERSION}/tigrisfs_\${VERSION#v}_linux_\${ARCH}.tar.gz" -o /tmp/tigrisfs.tar.gz
tar -xzf /tmp/tigrisfs.tar.gz -C /usr/local/bin/
rm /tmp/tigrisfs.tar.gz
chmod +x /usr/local/bin/tigrisfs

mkdir -p /data /app/static
rm -f /tmp/tigrisfs.log "\${REPORT_FILE}"

/usr/local/bin/tigrisfs --endpoint "\${R2_ENDPOINT}" -f "\${R2_BUCKET_NAME}" /data >/tmp/tigrisfs.log 2>&1 &
TIGRISFS_PID=$!

sleep 5

set +e
{
  echo "R2 bucket: \${R2_BUCKET_NAME}"
  echo "Endpoint: \${R2_ENDPOINT}"
  echo "tigrisfs pid: \${TIGRISFS_PID}"
  if [ -n "\${AWS_ACCESS_KEY_ID:-}" ]; then
    echo "env AWS_ACCESS_KEY_ID present: yes"
  else
    echo "env AWS_ACCESS_KEY_ID present: no"
  fi
  echo
  echo "bootstrap apt log:"
  cat /tmp/bootstrap-apt.log || true
  echo
  echo "tigrisfs process:"
  ps | grep tigrisfs || true
  echo
  echo "tigrisfs log:"
  cat /tmp/tigrisfs.log || true
  echo
  echo "Mounted /data:"
  ls -lah /data || true
  echo
  if [ -f /data/.jwt_secret ]; then
    echo ".jwt_secret exists: yes"
  else
    echo ".jwt_secret exists: no"
  fi
  if [ -f /data/.initial_admin_password ]; then
    echo ".initial_admin_password exists: yes"
  else
    echo ".initial_admin_password exists: no"
  fi
} > "\${REPORT_FILE}" 2>&1
set -e

if ! ps -p "\${TIGRISFS_PID}" >/dev/null 2>&1; then
  cat "\${REPORT_FILE}" >&2 || true
  exit 1
fi

export APP_ENV="\${APP_ENV:-production}"
export DATA_DIR=/data
export DATABASE_URL="\${DATABASE_URL:-sqlite:////data/beecount.db}"
export BACKUP_STORAGE_DIR="\${BACKUP_STORAGE_DIR:-/data/backups}"
export ATTACHMENT_STORAGE_DIR="\${ATTACHMENT_STORAGE_DIR:-/data/attachments}"
export RCLONE_CONFIG_PATH="\${RCLONE_CONFIG_PATH:-/data/rclone.conf}"
export WEB_STATIC_DIR="\${WEB_STATIC_DIR:-/app/static}"
export ALLOW_APP_RW_SCOPES="\${ALLOW_APP_RW_SCOPES:-true}"

exec sh -c "alembic upgrade head && uvicorn server:app --host 0.0.0.0 --port 8080 --proxy-headers"
`;

export class BeeCountCloud extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
  pingEndpoint = "healthz";
  enableInternet = true;
  entrypoint = ["/bin/sh", "-lc", startupCommand];
  envVars = {
    AWS_ACCESS_KEY_ID: this.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: this.env.AWS_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: this.env.R2_BUCKET_NAME,
    R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
    APP_ENV: "production",
    CORS_ORIGINS: this.env.CORS_ORIGINS,
    BOOTSTRAP_ADMIN_EMAIL: this.env.BOOTSTRAP_ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD: this.env.BOOTSTRAP_ADMIN_PASSWORD,
    EMBEDDING_BASE_URL: this.env.EMBEDDING_BASE_URL,
    EMBEDDING_MODEL: this.env.EMBEDDING_MODEL,
    EMBEDDING_API_KEY: this.env.EMBEDDING_API_KEY,
    TZ: this.env.TZ,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/__cf/diag") {
      return Response.json({
        ok: true,
        service: "beecount-cloud-cf",
        routes: [
          "/__cf/start",
          "/healthz",
          "/ready",
          "/__mount_report.txt",
          "/api/v1/version",
          "/api/v1/mcp/sse",
          "/ws",
        ],
      });
    }

    const container = getContainer(env.BEECOUNT_APP, "app");
    if (url.pathname === "/__cf/start") {
      await container.startAndWaitForPorts({
        cancellationOptions: {
          instanceGetTimeoutMS: 20000,
          portReadyTimeoutMS: 180000,
        },
      });
      return Response.json({ ok: true, started: true });
    }
    return container.fetch(request);
  },
};
