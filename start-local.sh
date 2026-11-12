#!/usr/bin/env bash
# ScanCart.ai — run everything on this computer.
#   ./start-local.sh          build the extension + start the backend on http://localhost:4000
#   ./start-local.sh --test   also run the backend tests first
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

command -v node >/dev/null || { echo "Node.js is not installed. Install Node 20+ first."; exit 1; }

# 1. Backend settings
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env — add your ANTHROPIC_API_KEY there for real AI checks (without it, backup rules only)."
fi

# 2. Install packages the first time
[ -d backend/node_modules ]   || (cd backend && npm install)
[ -d extension/node_modules ] || (cd extension && npm install)

# 3. Tests (optional)
[ "$1" = "--test" ] && (cd backend && npm test)

# 4. Build the extension
(cd extension && npm run build >/dev/null) && echo "Extension built: $ROOT/extension/dist"

# 5. Stop an old backend on port 4000, then start the new one
OLD=$(lsof -ti tcp:4000 2>/dev/null || true)
[ -n "$OLD" ] && { echo "Stopping old backend (pid $OLD)"; kill $OLD; sleep 1; }

cat <<MSG

──────────────────────────────────────────────
 Load the extension in Chrome:
   1. Open chrome://extensions
   2. Turn on "Developer mode" (top right)
   3. "Load unpacked" → choose: $ROOT/extension/dist
      (already loaded? press the reload ↻ button on the ScanCart card)
 Then open any Amazon.in / Flipkart product page.
 Test steps: $ROOT/TESTING-v1.1.md
 Stop the backend: Ctrl+C
──────────────────────────────────────────────

MSG
cd backend && exec npm start
