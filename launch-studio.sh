#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure backend systemd service is active
if ! systemctl --user is-active --quiet clipper-studio.service; then
  echo "[Studio] Starting local backend service..."
  systemctl --user start clipper-studio.service
fi

echo "[Studio] Launching ClipperStudio Desktop..."
cd "$DIR/client"
npx electron . --no-sandbox
