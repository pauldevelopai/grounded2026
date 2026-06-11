#!/usr/bin/env bash
# GROUNDED — local dev launcher + resume. THE WHOLE PLATFORM runs locally:
#   tracker server (:3001) + client (:5173)
#   the 5 hosted Nodes (:4101–4105, multi-tenant, against the local DB)
#   the Nodes front door (static, served by the Vite dev proxy at /nodes/)
#   AIKit (:8000, served at /tools/)
# Safe to run repeatedly — anything already up is left alone.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODES_DIR="$DIR/../Nodes"
AIKIT_DIR="$DIR/../../aikit_bundle/aikit_source"
AIKIT_VENV="$HOME/.venvs/aikit"

is_up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

echo "GROUNDED — local dev (full platform)"
echo "────────────────────────────────────"

# ── Postgres ────────────────────────────────────────────────────────────────
if psql "postgresql://localhost:5433/tracker" -At -c "SELECT 1" >/dev/null 2>&1; then
  echo "  ✓ Postgres :5433 (db tracker)"
else
  echo "  ✗ Postgres :5433 NOT reachable — start it first (the rest will fail without it)"
fi

# ── Tracker server + client ────────────────────────────────────────────────
start_npm() { # port  name  dir
  if is_up "$1"; then
    echo "  ✓ $2 already running on :$1"
  else
    echo "  → starting $2 on :$1 …"
    ( cd "$3" && nohup npm run dev > "/tmp/grounded-$2.log" 2>&1 & )
  fi
}
start_npm 3001 server "$DIR/server"
start_npm 5173 client "$DIR/client"

# ── Hosted Nodes (multi-tenant, local DB) ──────────────────────────────────
# Same env contract as deploy-node.sh on the box: JWT_SECRET (tracker's),
# DATABASE_URL, PORT — injected at start so the Nodes' own .env files stay
# untouched (their dotenv only overrides keys present in the file).
JWT=$(grep '^JWT_SECRET=' "$DIR/.env" | cut -d= -f2-)
DB_URL="postgresql://localhost:5433/tracker"
start_node() { # slug  repo  port
  if is_up "$3"; then
    echo "  ✓ node $1 already running on :$3"
  elif [ ! -d "$NODES_DIR/$2" ]; then
    echo "  ✗ node $1 — repo not found at Nodes/$2 (skipped)"
  else
    echo "  → starting node $1 (hosted) on :$3 …"
    ( cd "$NODES_DIR/$2" && JWT_SECRET="$JWT" DATABASE_URL="$DB_URL" PORT="$3" \
        nohup npm run start:hosted > "/tmp/grounded-node-$1.log" 2>&1 & )
  fi
}
start_node analytics node-analytics 4101
start_node verifier  node-verifier  4102
start_node progress  node-progress  4103
start_node aiready   node-aiready   4104
start_node salesrep  node-salesrep  4105
# node-podcasting: hosted mode not wired (needs blob storage) — local-lite only.

# ── AIKit (/tools) ──────────────────────────────────────────────────────────
if is_up 8000; then
  echo "  ✓ aikit already running on :8000"
elif [ -x "$AIKIT_VENV/bin/uvicorn" ] && [ -d "$AIKIT_DIR" ]; then
  echo "  → starting aikit on :8000 …"
  ( cd "$AIKIT_DIR" && nohup "$AIKIT_VENV/bin/uvicorn" app.main:app --port 8000 > /tmp/grounded-aikit.log 2>&1 & )
else
  echo "  ✗ aikit — venv ($AIKIT_VENV) or source ($AIKIT_DIR) missing (skipped)"
fi

# give fresh starts a moment to bind
for _ in 1 2 3 4 5 6 7 8 9 10; do is_up 5173 && is_up 3001 && break; sleep 1; done

echo ""
echo "  Hub (public):    http://localhost:5173/"
echo "  Product:         http://localhost:5173/sections"
echo "  Functions:       http://localhost:5173/functions"
echo "  Nodes:           http://localhost:5173/nodes/        ← local front door + local hosted Nodes"
echo "  Tools (AIKit):   http://localhost:5173/tools/        ← local FastAPI"
echo "  Server API:      http://localhost:3001/api/public/overview"
echo "  Logs:            /tmp/grounded-*.log"
echo ""
echo "Where we are: Phase 1 COMPLETE (branch phase-1-ia-restructure). Phase 2 step 2a DONE (newsroom_id foundation) → next is 2b (auth carries newsroom)."
echo "Full state:   grounded2026/docs/RESUME.md"
echo "Resume w/ Claude: say \"Pick up the GROUNDED V3 plan\"."
