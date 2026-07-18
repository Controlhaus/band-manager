#!/bin/sh
set -e

echo "→ Applying database migrations…"
node node_modules/prisma/build/index.js migrate deploy

echo "→ Seeding (idempotent)…"
node seed.cjs || echo "⚠ seed step failed; continuing"

echo "→ Starting Band Manager…"
exec node server.js
