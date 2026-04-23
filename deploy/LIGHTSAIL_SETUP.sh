#!/usr/bin/env bash
# AI Legal — first-time Lightsail setup + every subsequent deploy.
#
# Target host: 52.56.143.231 (eu-west-2a, Ubuntu)
# Usage on the server:
#   ssh ubuntu@52.56.143.231
#   wget -q https://raw.githubusercontent.com/pauldevelopai/holly/main/deploy/LIGHTSAIL_SETUP.sh
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
#   2. Clone / pull the holly repo to /home/ubuntu/holly
#   3. npm install (server + client) and build the Vite SPA
#   4. Prompt once for /home/ubuntu/holly/.env (NOT created automatically —
#      you paste in DATABASE_URL, ANTHROPIC_API_KEY, etc.)
#   5. Run DB migrations
#   6. pm2 start the Node server
#   7. Symlink + reload the nginx server block
#   8. If DNS resolves to this host → run certbot for HTTPS
#      If DNS not propagated → print command to run later

set -euo pipefail

REPO_URL="https://github.com/pauldevelopai/holly.git"
APP_DIR="/home/ubuntu/holly"
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
DATABASE_URL=postgresql://holly:CHANGEME@localhost:5432/holly
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
if pm2 list | grep -q holly-server; then
  pm2 reload holly-server
else
  pm2 start "$APP_DIR/deploy/ecosystem.production.cjs"
  pm2 save
  # Install the pm2 startup hook (only the first time)
  sudo env PATH="$PATH" pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -n 1 | bash || true
fi

sleep 2
if ! curl -sSf http://127.0.0.1:3001/api/public/lawsuits >/dev/null 2>&1; then
  warn "API on 127.0.0.1:3001 isn't responding yet. Check: pm2 logs holly-server"
fi

# ── 7. Nginx ─────────────────────────────────────────────────────────────────
log "Installing nginx server block…"
sudo cp "$APP_DIR/deploy/nginx/ailegal.co.za.conf" "/etc/nginx/sites-available/ailegal.co.za"
sudo ln -sf "/etc/nginx/sites-available/ailegal.co.za" "/etc/nginx/sites-enabled/ailegal.co.za"
# Disable the default welcome site if present — it competes for port 80.
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
log "Nginx reloaded (HTTP only — HTTPS comes after DNS propagates + certbot)."

# ── 8. Certbot (only if DNS already points here) ─────────────────────────────
ACTUAL_IP=$(dig +short "$DOMAIN" | tail -n 1)
if [[ "$ACTUAL_IP" == "$EXPECTED_IP" ]]; then
  log "DNS resolves correctly → running certbot…"
  sudo certbot --nginx --non-interactive --agree-tos \
    -m paul@developai.co.za \
    -d "$DOMAIN" -d "$WWW_DOMAIN" --redirect || warn "certbot failed — see /var/log/letsencrypt/"
else
  warn "DNS for $DOMAIN resolves to '$ACTUAL_IP' (expected $EXPECTED_IP)."
  warn "Once GoDaddy has propagated (check with: dig +short $DOMAIN), run:"
  warn "  sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN --redirect"
fi

log "Done. Visit: http://$DOMAIN  (or https:// after certbot)"
log "Health check: curl http://$DOMAIN/api/public/lawsuits | head -c 200"
