#!/usr/bin/env bash
# generate_examples.sh
# Regenerates Examples.md by rendering each .flf font using figlet.
# Usage: ./scripts/generate_examples.sh [--font-dir <dir>] [--output <file>]
#
# Compatible with bash 3+ (macOS system bash) and GNU/BSD find.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FONT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT="$FONT_DIR/Examples.md"

# Parse named flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --font-dir) FONT_DIR="$2"; shift 2 ;;
    --output)   OUTPUT="$2";   shift 2 ;;
    *) shift ;;
  esac
done

if ! command -v figlet &>/dev/null; then
  echo "Error: figlet is not installed or not in PATH." >&2
  exit 1
fi

echo "Font directory : $FONT_DIR"
echo "Output file    : $OUTPUT"

# Collect and sort all .flf files (compatible with BSD & GNU find)
FONTS=()
while IFS= read -r f; do
  FONTS+=("$f")
done < <(ls -1 "$FONT_DIR"/*.flf 2>/dev/null | sort)

if [[ ${#FONTS[@]} -eq 0 ]]; then
  echo "No .flf font files found in $FONT_DIR" >&2
  exit 1
fi

echo "Found ${#FONTS[@]} fonts. Generating..."

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "Examples"
  echo "==="
  echo ""
  echo "Examples of the available fonts using the font name for the text."
  echo ""

  for font_path in "${FONTS[@]}"; do
    font_file="$(basename "$font_path")"
    font_name="${font_file%.flf}"

    echo "$font_file"
    echo '```'
    # Use the font name as the sample text; fall back gracefully on errors
    figlet -d "$FONT_DIR" -f "$font_name" "$font_name" 2>/dev/null || true
    echo '```'
    echo ""
    echo ""
  done
} > "$TMP"

mv "$TMP" "$OUTPUT"
echo "Done! Examples written to $OUTPUT"
