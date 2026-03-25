#!/usr/bin/env bash
# install.sh
# Installs figlet fonts and control files system-wide or per-user.
# Usage: ./scripts/install.sh [--user] [--font-dir <dir>]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Default to system install; --user installs to ~/.figlet/
USER_INSTALL=0
DEST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)     USER_INSTALL=1; shift ;;
    --font-dir) DEST="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--user] [--font-dir <dir>]"
      echo "  --user        Install to ~/.figlet/ (no root required)"
      echo "  --font-dir    Override destination directory"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Determine destination
if [[ -n "$DEST" ]]; then
  : # already set via --font-dir
elif [[ $USER_INSTALL -eq 1 ]]; then
  DEST="$HOME/.figlet"
else
  if [[ "$EUID" -ne 0 ]]; then
    echo "Error: system install requires root. Use --user for a per-user install, or --font-dir to specify a path." >&2
    exit 1
  fi
  # Try common system paths
  if [[ -d /usr/share/figlet/fonts ]]; then
    DEST=/usr/share/figlet/fonts
  elif [[ -d /usr/share/figlet ]]; then
    DEST=/usr/share/figlet
  else
    DEST=/usr/share/figlet
  fi
fi

echo "Installing to: $DEST"
mkdir -p "$DEST"

# Install fonts (.flf and .tlf)
font_count=0
for f in "$REPO_DIR"/*.[ft]lf; do
  cp "$f" "$DEST/"
  font_count=$((font_count + 1))
done

# Install control files (.flc)
ctrl_count=0
for f in "$REPO_DIR"/control/*.flc; do
  cp "$f" "$DEST/"
  ctrl_count=$((ctrl_count + 1))
done

echo "Installed $font_count font files and $ctrl_count control files to $DEST"
