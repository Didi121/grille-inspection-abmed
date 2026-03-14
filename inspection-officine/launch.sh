#!/bin/bash
# ═══════════════════════════════════════════════════
# Lanceur — Inspections Pharma ABMed
# ═══════════════════════════════════════════════════
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE="$APP_DIR/src-tauri/target/release/inspection-officine"

if [ -f "$RELEASE" ]; then
    exec "$RELEASE"
else
    cd "$APP_DIR"
    exec npm run dev
fi
