#!/bin/bash
set -e

echo "=== OpenBrain Pre-Deploy Gate ==="
echo ""

# Step 0: Build design-app
echo "[0/3] Building design-app..."
(cd src/design-app && npm install && npm run build)
echo "  Design-app built."
echo ""

# Step 1: Lint (errors only — warnings don't block)
echo "[1/3] Running ESLint..."
npx eslint src/ --quiet
echo "  Lint passed."
echo ""

# Step 2: Tests
echo "[2/3] Running tests..."
npx vitest run tests/ --reporter=verbose
echo "  Tests passed."
echo ""

echo "=== All checks passed. Safe to deploy. ==="
