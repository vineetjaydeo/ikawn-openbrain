#!/bin/bash
# Post-deploy: capture changelog to Lucy's memory so she knows about her own updates.
# Usage: ./scripts/post-deploy.sh [app-name]
#   app-name defaults to "ikawn-openbrain" (Lucy)

set -e

APP="${1:-ikawn-openbrain}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Determine target URL based on app
if [ "$APP" = "ikawn-openbrain" ]; then
  BASE_URL="https://ruhi.ikawn.in"
elif [ "$APP" = "ruhi-os-brain" ]; then
  BASE_URL="https://ruhi-os-brain.fly.dev"
else
  echo "Unknown app: $APP"
  exit 1
fi

# Get the last 3 commits (covers most deploys)
cd "$REPO_DIR"
COMMITS=$(git log --oneline -3 --no-decorate)
LATEST_HASH=$(git log -1 --format="%H")
VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "unknown")

# Build the changelog summary
SUMMARY="Deploy to ${APP} (v${VERSION})

Recent changes:
${COMMITS}

Deployed at: $(date -u '+%Y-%m-%d %H:%M UTC')"

echo "=== Post-Deploy: Capturing changelog to ${APP} ==="
echo "$SUMMARY"
echo ""

# Post to /capture with the API key from environment
API_KEY="${OPENBRAIN_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "OPENBRAIN_API_KEY not set — skipping changelog capture."
  echo "Set it in your shell: export OPENBRAIN_API_KEY=ob_..."
  exit 0
fi

PAYLOAD=$(cat <<EOF
{
  "content": $(echo "$SUMMARY" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
  "source": "deploy-changelog",
  "memory_type": "note",
  "source_ref": "deploy_${APP}_${LATEST_HASH}",
  "tags": ["deploy", "changelog", "${APP}"],
  "author": "system",
  "brand_id": "ikawn",
  "hashtags": ["#deploy", "#changelog"]
}
EOF
)

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE_URL}/capture" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ${API_KEY}" \
  -d "$PAYLOAD")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "Changelog captured successfully (HTTP ${HTTP_CODE})."
else
  echo "WARNING: Changelog capture failed (HTTP ${HTTP_CODE}). Deploy still succeeded."
fi
