#!/usr/bin/env bash
###############################################################################
# guard-frontend-dist.sh — CI/build guard for the Cyethack HR Portal image.
#
# Fails the build if the built image does not contain
# /app/client-dist/index.html — the Vite build output that server/app.js
# serves (and whose absence triggers the fail-fast in production).
#
# Usage:
#   CI:   scripts/guard-frontend-dist.sh cyethack-hrm-portal:latest
#   Local: scripts/guard-frontend-dist.sh $(docker build -q .)
###############################################################################
set -euo pipefail

IMAGE="${1:?usage: guard-frontend-dist.sh :tag}"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "[guard] ERROR: image not found locally: $IMAGE" >&2
  exit 1
fi

if docker run --rm "$IMAGE" test -f /app/client-dist/index.html; then
  echo "[guard] OK: /app/client-dist/index.html present in $IMAGE"
  exit 0
fi

echo "[guard] FAIL: /app/client-dist/index.html missing from $IMAGE —" >&2
echo "[guard]        the client build output was not copied into the image." >&2
exit 1
