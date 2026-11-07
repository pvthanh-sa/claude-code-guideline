#!/usr/bin/env bash
# Copy the study docs into one flat folder, ready to upload to NotebookLM.
# Template from the dual-engine-study skill: copy to <docs>/scripts/, then fill
# NOTEBOOK_DIR_NAME, SOURCES and SKIP.
#
# Usage:  ./scripts/sync-notebooklm.sh                 (works from any directory)
#         NOTEBOOKLM_DIR=/other/dir ./scripts/sync-notebooklm.sh
#
# Each run rebuilds the folder from SOURCES and reports what changed since the last run:
#   NEW / CHANGED  -> upload (again) in NotebookLM; for CHANGED, delete the old source there first
#   REMOVED        -> delete that source in NotebookLM
# Any .md under the docs folder that is in neither SOURCES nor SKIP is reported as NOT LISTED,
# so a new doc is never left out silently: add it to one of the two lists.
set -euo pipefail

NOTEBOOK_DIR_NAME="notebooklm-SUBJECT"                          # e.g. notebooklm-k8s, notebooklm-aws
DOCS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"   # the docs folder (parent of scripts/)
DEST="$(realpath -m "${NOTEBOOKLM_DIR:-$DOCS/$NOTEBOOK_DIR_NAME}")"   # git-ignore this folder

# "path relative to the docs folder | file name in the NotebookLM folder"
# Names are flat and carry their origin, so NotebookLM citations show where a passage comes from.
SOURCES=(
  # "theory.md|SUBJECT-theory.md"
  # "labs/lab-1-something.md|lab-1-something.md"
  # "labs/lab-2/steps/01-first-step.md|lab-2-step-01-first-step.md"
)

# .md files under the docs folder that are deliberately not uploaded (path prefixes relative to it)
SKIP=(
  # "dual-engine-study-guide.md"   # the method itself is not study material
  # "labs/lab-2/app-source/"       # application code
)

(( ${#SOURCES[@]} )) || { echo "ERROR: SOURCES is empty: fill it in first" >&2; exit 1; }

# --- check the list -------------------------------------------------------------------------
declare -A by_name=() listed=()
fail=0
for entry in "${SOURCES[@]}"; do
  src="${entry%%|*}"; name="${entry##*|}"
  if [[ ! -f "$DOCS/$src" ]]; then echo "ERROR: source not found: $src" >&2; fail=1; fi
  if [[ -n "${by_name[$name]:-}" ]]; then echo "ERROR: two sources share the name $name" >&2; fail=1; fi
  by_name["$name"]="$src"
  listed["$(realpath -m "$DOCS/$src")"]=1
done
(( fail == 0 )) || exit 1

# --- copy -----------------------------------------------------------------------------------
mkdir -p "$DEST"
new=() changed=() removed=() unlisted=()
for entry in "${SOURCES[@]}"; do
  src="${entry%%|*}"; name="${entry##*|}"
  if [[ ! -e "$DEST/$name" ]]; then new+=("$name")
  elif ! cmp -s "$DOCS/$src" "$DEST/$name"; then changed+=("$name")
  fi
  cp "$DOCS/$src" "$DEST/$name"
done

# .md files left in DEST from an older list (renamed or dropped docs); nothing else is touched
shopt -s nullglob
for f in "$DEST"/*.md; do
  name="$(basename "$f")"
  if [[ -z "${by_name[$name]:-}" ]]; then removed+=("$name"); rm -- "$f"; fi
done

# docs that exist but are in neither list
while IFS= read -r -d '' f; do
  rel="${f#"$DOCS"/}"
  [[ -n "${listed[$(realpath -m "$f")]:-}" ]] && continue
  for p in "${SKIP[@]}"; do [[ "$rel" == "$p"* ]] && continue 2; done
  unlisted+=("$rel")
done < <(find "$DOCS" -name '*.md' -not -path '*/.git/*' -not -path "$DEST/*" -print0 | sort -z)

# --- report ---------------------------------------------------------------------------------
echo "NotebookLM folder: $DEST (${#SOURCES[@]} files)"
for n in "${new[@]}";     do echo "  NEW      $n"; done
for n in "${changed[@]}"; do echo "  CHANGED  $n"; done
for n in "${removed[@]}"; do echo "  REMOVED  $n"; done
if (( ${#new[@]} + ${#changed[@]} + ${#removed[@]} == 0 )); then
  echo "  nothing changed since the last run"
fi
if (( ${#unlisted[@]} )); then
  echo "WARNING: not in SOURCES or SKIP (add them to scripts/sync-notebooklm.sh):"
  for n in "${unlisted[@]}"; do echo "  NOT LISTED  $n"; done
fi
