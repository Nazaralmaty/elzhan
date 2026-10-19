#!/bin/bash
# engine/cloud_setup.sh — делает облачную сессию Claude Code (Linux) похожей на Mac Елжана, чтобы скиллы
# /podcast-reel и /speaker-canvas работали по своим путям. Идемпотентно; на Mac ничего не делает.
#   ~/.claude/engine → <репо>/engine;  puppeteer без скачивания Chrome (browser.js на Linux берёт Chromium Playwright).
[ "$(uname)" = Linux ] || exit 0
REPO="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p ~/.claude
[ -e ~/.claude/engine ] || ln -s "$REPO/engine" ~/.claude/engine
if [ ! -d "$REPO/engine/node_modules/puppeteer" ]; then
  (cd "$REPO/engine" && PUPPETEER_SKIP_DOWNLOAD=1 npm install --no-audit --no-fund >/dev/null 2>&1) || echo "cloud_setup: npm install не прошёл"
fi
python3 -c "import numpy, cv2, fontTools" 2>/dev/null || pip install -q numpy opencv-python-headless fonttools >/dev/null 2>&1 || true
echo "cloud_setup: engine → ~/.claude/engine готов"
