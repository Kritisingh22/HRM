#!/usr/bin/env bash
# build-frontend.sh — Build the React client for Render Static Site.
# Sets VITE_API_URL from the backend service and runs Vite build.
set -euo pipefail

# Resolve repo root (directory of this script)
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/client"

# Export VITE_API_URL so Vite inlines it into the build.
# The render.yaml provides this as a runtime env var; we read it from the
# environment (Render injects it at build time). If not set, fall back to
# the placeholder so the build doesn't fail, and the client will use
# import.meta.env.VITE_API_URL at runtime from the Render Web Service URL.
VITE_API_URL="${VITE_API_URL:-https://cyethack-hrm-backend.onrender.com}"
export VITE_API_URL

echo "Building client with VITE_API_URL=$VITE_API_URL"

# Install dependencies (production only, to keep build fast)
npm ci --omit=dev

# Run Vite build — output goes to client/dist
npm run build

echo "Client build complete: $(ls -la dist/ | head -5)"