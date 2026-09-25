#!/usr/bin/env bash

set -euo pipefail

if [ -z "${BASH_VERSION:-}" ]; then
  echo "Error: run-local.sh must be started from Bash (Git Bash or WSL)." >&2
  echo "On Windows, run .\\run-local.ps1 instead." >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required. Install Node.js 16 or newer and try again." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required. Install npm with Node.js and try again." >&2
  exit 1
fi

echo "Node.js: $(node --version)"
echo "Starting Cyethack HR Portal locally..."
echo "The portal and API will be available at http://localhost:5000"
echo "Press Ctrl+C to stop the application."

cd "$SERVER_DIR"

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/mongodb-memory-server ]; then
  echo "Installing server dependencies..."
  npm install
fi

exec npm run dev:mem