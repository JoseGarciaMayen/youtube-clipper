#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure backend systemd service is active
if ! systemctl --user is-active --quiet math-clipper.service; then
  echo "[Studio] Starting local backend service..."
  systemctl --user start math-clipper.service
fi

echo "[Studio] Launching Math Clipper Desktop Studio..."
cd "$DIR/client"
npx electron .
