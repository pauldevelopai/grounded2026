#!/usr/bin/env bash
#
# deploy.sh — pull + build + restart the Grounded tracker on the box.
#
#   cd /home/ubuntu/tracker && bash deploy.sh
#
# Run after pushing changes. Handles the things that are easy to forget:
#   - the CLIENT must be rebuilt (npm run build) for any front-end change to go
#     live — editing source alone does nothing until the bundle is rebuilt;
#   - DB migrations run;
#   - the SERVER is restarted under pm2 to load route changes.
#
# Caddy is NOT touched here (it rarely changes). If you changed the Caddy config,
# remember: `sudo systemctl restart caddy` (it has `admin off`, so `reload` fails).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Stashing any local box edits, then pulling"
git stash push -m "deploy-autostash-$(date +%s)" --quiet 2>/dev/null || true
git pull --ff-only

echo "==> Server dependencies"
( cd server && npm install --no-audit --no-fund --loglevel=error )

echo "==> Database migrations"
node server/db/migrate.js

echo "==> Building the client (this is what actually ships front-end changes)"
( cd client && npm install --no-audit --no-fund --loglevel=error && npm run build )

echo "==> Restarting the server under pm2"
pm2 restart tracker-server && (pm2 save >/dev/null 2>&1 || true)

echo ""
echo "Done. One build + server serves both doors:"
echo "  • Grounded (main):  https://grounded.developai.co.za/"
echo "  • Be AI Ready:      https://beaiready.developai.co.za/"
echo "If a front-end change still looks stale, hard-refresh the browser (Cmd/Ctrl+Shift+R)."
