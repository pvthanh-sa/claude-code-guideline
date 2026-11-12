#!/usr/bin/env bash
# Copy one subject's study docs into a flat folder, ready to upload to NotebookLM.
# Part of the dual-engine-study skill: one script for every subject, one config per subject.
#
# Usage:  sync-notebooklm.sh <subject>          reads examples/<subject>-sync.conf in this skill
#         sync-notebooklm.sh path/to/file.conf  any config file
#         sync-notebooklm.sh                    lists the subjects that have a config
#         sync-notebooklm.sh <subject> --uploaded   after you have done the uploads it listed: clears the to-do list
#         NOTEBOOKLM_DIR=/other/dir sync-notebooklm.sh <subject>   overrides dest for one run
#
# Config format: one setting per line; lines starting with # are comments.
#   docs   = ~/path/to/docs                 folder whose .md files are checked
#   dest   = ~/path/to/copies               flat folder to upload from (git-ignore it)
#   source = rel/path.md | flat-name.md     one line per uploaded file; path relative to docs
#   skip   = rel/prefix                     .md files under docs that are deliberately not uploaded
#
# Each run rebuilds dest from the source lines and adds what changed to a to-do list kept in dest/.pending-upload:
#   NEW / CHANGED  -> upload (again) in NotebookLM; for CHANGED, remove the old source there first
#   REMOVED        -> remove that source in NotebookLM
# The list is shown on every run, whoever ran the script before, until it is cleared with --uploaded.
# Any .md under docs that is neither a source nor skipped is reported as NOT LISTED,
# so a new doc is never left out silently: add a source or skip line for it.
set -euo pipefail

SKILL="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")/.." && pwd -P)"

if (( $# == 0 )); then
  echo "Usage: $(basename "$0") <subject> | <config file>"
  echo "Subjects with a config in $SKILL/examples:"
  for c in "$SKILL"/examples/*-sync.conf; do [[ -e "$c" ]] && echo "  $(basename "$c" -sync.conf)"; done
  exit 1
fi
UPLOADED=0
if [[ "${2:-}" == "--uploaded" ]]; then UPLOADED=1
elif (( $# > 1 )); then echo "ERROR: unknown option '$2' (only --uploaded)" >&2; exit 1; fi
CONF="$1"
[[ -f "$CONF" ]] || CONF="$SKILL/examples/$1-sync.conf"
[[ -f "$CONF" ]] || { echo "ERROR: no config for '$1' (looked for $CONF)" >&2; exit 1; }

trim() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }
expand() { local p="$1"; [[ "$p" == "~/"* ]] && p="$HOME/${p#\~/}"; printf '%s' "$p"; }

# --- read the config ------------------------------------------------------------------------
DOCS="" DEST=""
SOURCES=() SKIP=()
n=0
while IFS= read -r line || [[ -n "$line" ]]; do
  n=$((n + 1))
  line="$(trim "$line")"
  [[ -z "$line" || "$line" == "#"* ]] && continue
  [[ "$line" == *"="* ]] || { echo "ERROR: $CONF:$n: expected 'key = value'" >&2; exit 1; }
  key="$(trim "${line%%=*}")"; val="$(trim "${line#*=}")"
  case "$key" in
    docs) DOCS="$(expand "$val")" ;;
    dest) DEST="$(expand "$val")" ;;
    source)
      src="$(trim "${val%%|*}")"; name="$(trim "${val##*|}")"
      [[ "$val" == *"|"* && -n "$src" && -n "$name" ]] || { echo "ERROR: $CONF:$n: source needs 'path | name'" >&2; exit 1; }
      SOURCES+=("$src|$name") ;;
    skip) SKIP+=("$val") ;;
    *) echo "ERROR: $CONF:$n: unknown setting '$key'" >&2; exit 1 ;;
  esac
done < "$CONF"
[[ -n "$DOCS" && -d "$DOCS" ]] || { echo "ERROR: docs folder not set or missing: '$DOCS'" >&2; exit 1; }
[[ -n "$DEST" ]] || { echo "ERROR: dest not set in $CONF" >&2; exit 1; }
(( ${#SOURCES[@]} )) || { echo "ERROR: no source lines in $CONF" >&2; exit 1; }
DOCS="$(cd "$DOCS" && pwd -P)"
DEST="$(realpath -m "${NOTEBOOKLM_DIR:-$DEST}")"

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

# docs that exist but are neither a source nor skipped
while IFS= read -r -d '' f; do
  rel="${f#"$DOCS"/}"
  [[ -n "${listed[$(realpath -m "$f")]:-}" ]] && continue
  for p in "${SKIP[@]}"; do [[ "$rel" == "$p"* ]] && continue 2; done
  unlisted+=("$rel")
done < <(find "$DOCS" -name '*.md' -not -path '*/.git/*' -not -path "$DEST/*" -print0 | sort -z)

# --- to-do list for NotebookLM: survives between runs ------------------------------------------
PENDING="$DEST/.pending-upload"
declare -A todo=()
if [[ -f "$PENDING" ]]; then
  while read -r st name; do [[ -n "${name:-}" ]] && todo["$name"]="$st"; done < "$PENDING"
fi
for x in "${new[@]}";     do todo["$x"]="NEW"; done
for x in "${changed[@]}"; do [[ "${todo[$x]:-}" == "NEW" ]] || todo["$x"]="CHANGED"; done   # NEW still means "upload"
for x in "${removed[@]}"; do todo["$x"]="REMOVED"; done
for x in "${!todo[@]}"; do   # a pending upload whose file is no longer listed needs nothing any more
  [[ "${todo[$x]}" != "REMOVED" && -z "${by_name[$x]:-}" ]] && unset 'todo[$x]'
done
if (( UPLOADED )); then todo=(); fi
: > "$PENDING"
for x in "${!todo[@]}"; do echo "${todo[$x]} $x" >> "$PENDING"; done
sort -o "$PENDING" "$PENDING"

# --- report ---------------------------------------------------------------------------------
echo "NotebookLM folder: $DEST (${#SOURCES[@]} files)"
if (( ${#new[@]} + ${#changed[@]} + ${#removed[@]} == 0 )); then
  echo "  no change in the docs since the last run"
fi
if (( UPLOADED )); then
  echo "Marked as uploaded: the to-do list is empty."
elif [[ -s "$PENDING" ]]; then
  echo "To do in NotebookLM (then run again with --uploaded):"
  while read -r st name; do
    case "$st" in
      NEW)     echo "  NEW      $name   -> upload it" ;;
      CHANGED) echo "  CHANGED  $name   -> remove the old source, then upload this copy" ;;
      REMOVED) echo "  REMOVED  $name   -> remove this source" ;;
    esac
  done < "$PENDING"
else
  echo "NotebookLM is up to date."
fi
if (( ${#unlisted[@]} )); then
  echo "WARNING: not a source or skip line in $CONF:"
  for x in "${unlisted[@]}"; do echo "  NOT LISTED  $x"; done
fi
