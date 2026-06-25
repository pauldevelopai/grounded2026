#!/usr/bin/env bash
# test-local.sh — run BE AI READY locally to click through before deploying.
# Applies migrations, seeds local test logins + sample data, prints how to get in,
# then starts the server (:3001) + client (:5173) together. Ctrl-C stops both.
set -e
cd "$(dirname "$0")"

echo "→ Applying migrations…"
( cd server && node db/migrate.js )

echo "→ Seeding local test fixtures…"
node server/db/scripts/seed-bair-local.mjs

cat <<'EOF'

──────────────────────────────────────────────────────────────────────────────
  BE AI READY — local test
──────────────────────────────────────────────────────────────────────────────
  Open the client door:   http://beaiready.localhost:5173
      (if that host won't load, use http://localhost:5173 then run this in the
       browser console once:  sessionStorage.beaiready='1'; location.reload()  )

  Log in:
    • Consultant (admin):  admin@local  / localtest123   → the admin console
    • Client teammate:     member@local / localtest123   → the client dashboard

  Try: Team AI workspace (ask + pool), admin Insight (Derive), admin Workspace
  (promote a pinned answer), KnowHow (link a client + Add to company knowledge),
  and self-registration with company access code "joinus".
──────────────────────────────────────────────────────────────────────────────

EOF

echo "→ Starting server (:3001) + client (:5173).  Ctrl-C to stop both."
# Run both directly (no 'concurrently' dependency). Server in the background; the
# client in the foreground so Ctrl-C stops it, and the trap then stops the server.
( cd server && node index.js ) &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM
( cd client && npm run dev )
