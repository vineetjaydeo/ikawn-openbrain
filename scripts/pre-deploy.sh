#!/bin/bash
set -e

echo "=== OpenBrain Pre-Deploy Gate ==="
echo ""

# Step 1: Lint (clean dist first so it doesn't pollute eslint)
echo "[1/3] Running ESLint..."
rm -rf src/design-app-dist
npx eslint src/ --quiet
echo "  Lint passed."
echo ""

# Step 2: Tests
echo "[2/3] Running tests (root + packages/agent-api)..."
npx vitest run tests/ packages/agent-api/test/ --reporter=verbose
echo "  Tests passed."
echo ""

# Step 3: Build design-app
echo "[3/3] Building design-app..."
(cd src/design-app && npm install && npm run build)
echo "  Design-app built."
echo ""

echo "=== All checks passed. Safe to deploy. ==="
