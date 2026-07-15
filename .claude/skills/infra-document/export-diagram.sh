#!/usr/bin/env bash
# Export a .drawio diagram to PNG via the draw.io desktop CLI, headless-safe.
# Part of the /infra-document skill (Stage 5). Fallback chain:
#   drawio -x  →  drawio --no-sandbox -x  →  xvfb-run -a drawio --no-sandbox -x
# Success is judged ONLY by the output file (PNG magic + size) — the deb build
# prints autoupdate noise and can exit 0 without producing anything.
#
# Usage: bash export-diagram.sh <in.drawio> <out.png> [scale]   (scale default 2)
# Exit:  0 = verified PNG written
#        1 = drawio CLI present but every attempt failed (see stderr)
#        2 = drawio CLI not installed
set -u

IN="${1:?usage: export-diagram.sh <in.drawio> <out.png> [scale]}"
OUT="${2:?usage: export-diagram.sh <in.drawio> <out.png> [scale]}"
SCALE="${3:-2}"

command -v drawio >/dev/null 2>&1 || {
  echo "export-diagram: drawio CLI not installed — install draw.io desktop (github.com/jgraph/drawio-desktop/releases)" >&2
  echo "FALLBACK: manual export + Mermaid mirror" >&2
  exit 2
}
[ -f "$IN" ] || { echo "export-diagram: input not found: $IN" >&2; exit 1; }

export DRAWIO_DISABLE_UPDATE=true
mkdir -p "$(dirname "$OUT")"
# Export to a temp path and mv onto $OUT only after verification — a failed run must
# neither destroy a pre-existing good PNG nor leave non-PNG garbage at $OUT.
TMP_OUT="${OUT%.png}.tmp.$$.png"

png_ok() { # PNG magic + sane size — never trust drawio's exit code/stdout
  [ -f "$TMP_OUT" ] && [ "$(wc -c < "$TMP_OUT")" -gt 1024 ] &&
    [ "$(head -c 8 "$TMP_OUT" | od -An -tx1 | tr -d ' \n')" = "89504e470d0a1a0a" ]
}

LAST_LOG=""
attempt() {
  local label="$1"; shift
  [ -n "$LAST_LOG" ] && rm -f "$LAST_LOG"
  LAST_LOG="$(mktemp)"
  rm -f "$TMP_OUT"
  timeout 120 "$@" -x -f png -b 20 -s "$SCALE" -o "$TMP_OUT" "$IN" >"$LAST_LOG" 2>&1
  if png_ok; then
    mv -f "$TMP_OUT" "$OUT"
    echo "exported: $OUT ($label, scale $SCALE)"
    rm -f "$LAST_LOG"
    return 0
  fi
  rm -f "$TMP_OUT"
  return 1
}

if [ -n "${DISPLAY:-}" ]; then
  attempt "drawio" drawio && exit 0
  attempt "drawio --no-sandbox" drawio --no-sandbox && exit 0
fi
if command -v xvfb-run >/dev/null 2>&1; then
  attempt "xvfb-run drawio --no-sandbox" xvfb-run -a drawio --no-sandbox && exit 0
fi

rm -f "$TMP_OUT"
echo "export-diagram: all export attempts failed for $IN" >&2
if [ -n "$LAST_LOG" ] && [ -f "$LAST_LOG" ]; then
  echo "--- last attempt output:" >&2
  tail -20 "$LAST_LOG" >&2
  rm -f "$LAST_LOG"
else
  echo "(no attempt could run: no DISPLAY and no xvfb-run — install xvfb for headless export)" >&2
fi
echo "FALLBACK: manual export + Mermaid mirror" >&2
exit 1
