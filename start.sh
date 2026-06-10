#!/usr/bin/env bash
# GROUNDED — local dev launcher + resume.
# Starts the server (:3001) and client (:5173) if they aren't already running,
# then prints where the V3 build is up to. Safe to run repeatedly.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

is_up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

start() { # port  name  subdir
  if is_up "$1"; then
    echo "  ✓ $2 already running on :$1"
  else
    echo "  → starting $2 on :$1 …"
    ( cd "$DIR/$3" && nohup npm run dev > "/tmp/grounded-$2.log" 2>&1 & )
  fi
}

echo "GROUNDED — local dev"
echo "────────────────────"
start 3001 server server
start 5173 client client

# give fresh starts a moment to bind
for _ in 1 2 3 4 5 6 7 8; do is_up 5173 && is_up 3001 && break; sleep 1; done

echo ""
echo "  App:            http://localhost:5173/"
echo "  Phase-1 preview: http://localhost:5173/_preview"
echo "  Server API:     http://localhost:3001/api/public/overview"
echo "  Logs:           /tmp/grounded-server.log  /tmp/grounded-client.log"
echo ""
echo "Where we are: Phase 1 step 1 DONE → next is step 2 (ProductShell + 5-section nav)."
echo "Full state:   grounded2026/docs/RESUME.md"
echo "Resume w/ Claude: say \"Pick up the GROUNDED V3 plan\"."
