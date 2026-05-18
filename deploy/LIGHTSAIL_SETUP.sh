#!/usr/bin/env bash
# AI Legal — first-time Lightsail setup + every subsequent deploy.
#
# Target host: 52.56.143.231 (eu-west-2a, Ubuntu)
# Usage on the server:
#   ssh ubuntu@52.56.143.231
#   wget -q https://raw.githubusercontent.com/pauldevelopai/tracker/main/deploy/LIGHTSAIL_SETUP.sh
#   chmod +x LIGHTSAIL_SETUP.sh
#   bash LIGHTSAIL_SETUP.sh
#
# Idempotent — safe to run repeatedly. First run provisions everything;
# subsequent runs = deploy pipeline (pull + build + restart).
#
# Prerequisites the script does NOT handle (do once, before first run):
#   - Postgres installed + DATABASE_URL-reachable
#   - SSH access to the repo (this script uses HTTPS clone, so no key needed)
#   - DNS A + CNAME pointed at this box (see DEPLOY_RUNBOOK in chat)
#
# What this script does:
#   1. Apt-install Node 20, nginx, certbot, Puppeteer system libs, pm2
#   2. Clone / pull the tracker repo to /home/ubuntu/tracker
#   3. npm install (server + client) and build the Vite SPA
#   4. Prompt once for /home/ubuntu/tracker/.env (NOT created automatically —
#      you paste in DATABASE_URL, ANTHROPIC_API_KEY, etc.)
#   5. Run DB migrations
#   6. pm2 start the Node server
#   7. Symlink + reload the nginx server block
#   8. If DNS resolves to this host → run certbot for HTTPS
#      If DNS not propagated → print command to run later

set -euo pipefail

REPO_URL="https://github.com/pauldevelopai/tracker.git"
APP_DIR="/home/ubuntu/tracker"
DOMAIN="ailegal.co.za"
WWW_DOMAIN="www.ailegal.co.za"
EXPECTED_IP="52.56.143.231"

log()   { printf '\033[0;36m[setup]\033[0m %s\n' "$*"; }
warn()  { printf '\033[0;33m[warn]\033[0m %s\n'  "$*"; }
fatal() { printf '\033[0;31m[fatal]\033[0m %s\n' "$*"; exit 1; }

[[ "$(whoami)" == "ubuntu" ]] || fatal "Run as the 'ubuntu' user."

# ── 1. System packages ───────────────────────────────────────────────────────
log "Updating apt and installing base packages…"
sudo apt-get update -y
sudo apt-get install -y \
  curl git ca-certificates gnupg build-essential \
  nginx certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -c2- | cut -d. -f1)" -lt 20 ]]; then
  log "Installing Node.js 20.x…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing pm2…"
  sudo npm install -g pm2
fi

log "Installing Puppeteer / headless-Chromium system libs…"
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2t64 2>/dev/null || \
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2

# ── 1.5 One-time holly → tracker rename (May 2026 rebrand cut-over) ──────────
# Previous installs lived at /home/ubuntu/holly with a pm2 process named
# holly-server. Detect that layout and move it into place under the new name
# so the rest of this script can carry on as a normal redeploy.
if [[ -d /home/ubuntu/holly && ! -d "$APP_DIR" ]]; then
  log "Migrating /home/ubuntu/holly → $APP_DIR (one-time)…"
  pm2 stop holly-server  2>/dev/null || true
  pm2 delete holly-server 2>/dev/null || true
  mv /home/ubuntu/holly "$APP_DIR"
fi

# ── 2. Clone / pull the repo ─────────────────────────────────────────────────
if [[ -d "$APP_DIR/.git" ]]; then
  log "Repo exists — pulling latest…"
  git -C "$APP_DIR" fetch --all
  git -C "$APP_DIR" reset --hard origin/main
else
  log "Cloning repo…"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# ── 3. .env check ────────────────────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env" ]]; then
  warn "No .env found at $APP_DIR/.env — creating a template."
  cat > "$APP_DIR/.env" <<'ENV'
# Edit these values then re-run this script.
DATABASE_URL=postgresql://tracker:CHANGEME@localhost:5432/tracker
JWT_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_STRING
SERVER_PORT=3001
ADMIN_EMAIL=paul@developai.co.za
ADMIN_PASSWORD=CHANGE_ME

# Claude API — keep on a strict budget cap
ANTHROPIC_API_KEY=

# CourtListener (optional, limited utility on free tier)
COURTLISTENER_TOKEN=

# Google OAuth (admin-side Gmail integration)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://ailegal.co.za/api/gmail/callback

# LLM backend (ollama | anthropic) — default ollama, falls back to Claude if unset
LLM_BACKEND=anthropic
# OLLAMA_URL=http://100.x.y.z:11434   # set when Tailscale tunnel is up
# OLLAMA_MODEL=gemma3:12b

# Email provider (console | postmark | resend | ses)
EMAIL_PROVIDER=console
# RESEND_API_KEY=re_xxx
# RESEND_FROM=AI Legal <no-reply@ailegal.co.za>

# Public base URL (for OG tags, digest links)
PUBLIC_BASE_URL=https://ailegal.co.za
ENV
  fatal "Edit $APP_DIR/.env with real values (at minimum DATABASE_URL + JWT_SECRET), then re-run this script."
fi

# ── 4. Install deps + build client ───────────────────────────────────────────
log "Installing server deps…"
( cd "$APP_DIR/server" && npm ci --omit=dev 2>/dev/null || npm install --omit=dev )

log "Installing client deps + building Vite SPA…"
# --legacy-peer-deps: react-leaflet@5 peer-asks for React 19, but we're on
# React 18. client/.npmrc sets this too, but pass it explicitly here so older
# npm versions that ignore .npmrc during `ci` still succeed.
( cd "$APP_DIR/client" && npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps )
( cd "$APP_DIR/client" && npm run build )

# ── 5. Run DB migrations ─────────────────────────────────────────────────────
log "Running DB migrations…"
( cd "$APP_DIR" && npm run migrate ) || warn "Migrations failed — check DATABASE_URL + Postgres reachable."

# ── 6. pm2 ───────────────────────────────────────────────────────────────────
log "Starting / reloading Node server via pm2…"
# Clean up any previous mis-named process (older PM2 6.x treats the .cjs config
# file as a plain script and names the app after the filename).
pm2 delete ecosystem.production 2>/dev/null || true

if pm2 list | grep -q tracker-server; then
  pm2 reload tracker-server --update-env
else
  # Start the server directly by script + name, sidestepping the ecosystem file.
  ( cd "$APP_DIR/server" && \
    NODE_ENV=production PORT=3001 \
    pm2 start index.js \
      --name tracker-server \
      --max-memory-restart 512M \
      --log-date-format "YYYY-MM-DD HH:mm:ss" \
      --error /home/ubuntu/tracker/logs/server-error.log \
      --output /home/ubuntu/tracker/logs/server-out.log \
      --merge-logs )
  pm2 save
  # Install the pm2 startup hook (only the first time)
  sudo env PATH="$PATH" pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -n 1 | bash || true
fi

sleep 2
if ! curl -sSf http://127.0.0.1:3001/api/public/lawsuits >/dev/null 2>&1; then
  warn "API on 127.0.0.1:3001 isn't responding yet. Check: pm2 logs tracker-server"
fi

# ── 6.5 Make /home/ubuntu traversable by Caddy ───────────────────────────────
# Lightsail's default /home/ubuntu is 750, which blocks the caddy user from
# reaching the SPA static files. +x on "other" lets Caddy traverse into
# specific subpaths it knows; it can't list the home directory contents.
sudo chmod o+x /home/ubuntu

# ── 7. Caddy (reverse proxy + auto-HTTPS) ────────────────────────────────────
# The host already runs Caddy for other apps. We append our hostname block
# to the main Caddyfile via an import, then reload — Caddy auto-provisions
# Let's Encrypt certs for ailegal.co.za once DNS resolves here.
log "Installing Caddy site block…"
sudo mkdir -p /etc/caddy/sites
sudo cp "$APP_DIR/deploy/caddy/ailegal.co.za.caddy" /etc/caddy/sites/ailegal.co.za.caddy

# Ensure the main Caddyfile imports /etc/caddy/sites/*.caddy (idempotent).
if ! sudo grep -q "import /etc/caddy/sites/\*\.caddy" /etc/caddy/Caddyfile; then
  echo "" | sudo tee -a /etc/caddy/Caddyfile >/dev/null
  echo "import /etc/caddy/sites/*.caddy" | sudo tee -a /etc/caddy/Caddyfile >/dev/null
fi

# Validate + reload. Caddy will start auto-provisioning TLS for the new host.
if sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  sudo systemctl reload caddy
  log "Caddy reloaded — HTTPS will auto-provision when DNS points at this box."
else
  fatal "Caddy config invalid — check /etc/caddy/Caddyfile"
fi

log "Done. Visit: https://$DOMAIN  (Caddy provisions certs on first request)"
log "Health check: curl -sS https://$DOMAIN/api/public/lawsuits | head -c 200"
