#!/bin/bash
set -e

echo "=== OpenBrain Pre-Deploy Gate ==="
echo ""

# Step 1: Lint (errors only — warnings don't block)
echo "[1/2] Running ESLint..."
npx eslint src/ --quiet
echo "  Lint passed."
echo ""

# Step 2: Tests
echo "[2/2] Running tests..."
npx vitest run --reporter=verbose
echo "  Tests passed."
echo ""

echo "=== All checks passed. Safe to deploy. ==="
