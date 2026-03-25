#!/usr/bin/env bash
# generate_examples.sh
# Regenerates Examples.md by rendering each .flf/.tlf font using figlet.
# Usage: ./scripts/generate_examples.sh [--font-dir <dir>] [--output <file>]
#
# Compatible with bash 3+ (macOS system bash) and BSD/GNU tools.

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

# Collect and sort all .flf and .tlf files into a temp list
FONT_LIST="$(mktemp)"
trap 'rm -f "$FONT_LIST"' EXIT
ls -1 "$FONT_DIR"/*.[ft]lf 2>/dev/null | sort > "$FONT_LIST"

FONT_COUNT=$(wc -l < "$FONT_LIST" | tr -d ' ')
if [[ "$FONT_COUNT" -eq 0 ]]; then
  echo "No .flf/.tlf font files found in $FONT_DIR" >&2
  exit 1
fi

echo "Found $FONT_COUNT fonts. Generating..."

TMP="$(mktemp)"
trap 'rm -f "$FONT_LIST" "$TMP"' EXIT

{
  echo "Examples"
  echo "==="
  echo ""
  echo "Examples of the available fonts using the font name for the text."
  echo ""

  while IFS= read -r font_path; do
    font_file="$(basename "$font_path")"
    font_name="${font_file%.flf}"
    font_name="${font_name%.tlf}"

    echo "$font_file"
    echo '```'
    figlet -d "$FONT_DIR" -f "$font_name" "$font_name" 2>/dev/null || true
    echo '```'
    echo ""
    echo ""
  done < "$FONT_LIST"
} > "$TMP"

mv "$TMP" "$OUTPUT"
echo "Done! Examples written to $OUTPUT"
