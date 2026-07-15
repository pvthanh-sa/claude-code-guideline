#!/usr/bin/env python3
"""Deterministic gate for hand-authored .drawio diagrams (Stage 5 /infra-document).

Checks a draw.io XML file against the AWS4 stencil catalog (aws4-stencils.json)
plus geometry/edge lints. Philosophy = checkov/trivy: one actionable finding per
line, non-zero exit on ERROR, fix and re-run.

Usage:  python3 validate-drawio.py <file.drawio> [--catalog <aws4-stencils.json>]
Exit:   0 = pass (WARNs allowed) · 1 = one or more ERRORs · 2 = tooling problem

Why a catalog: a wrong resIcon/grIcon renders as a BLANK glyph in draw.io with
no error at all — the one failure mode XML well-formedness can never catch.
Catalog regeneration: see _meta.regenerate inside aws4-stencils.json.
"""

import argparse
import difflib
import json
import math
import sys
from pathlib import Path

AWS4 = "mxgraph.aws4."
ICON_SIZE = 78  # convention: resource icons are 78x78 (drawio-reference.md)


def load_xml(path):
    """Parse safely: prefer defusedxml; stdlib fallback only after rejecting
    DOCTYPE/ENTITY bytes (drawio files legitimately never contain either)."""
    raw = path.read_bytes()
    if b"<!DOCTYPE" in raw or b"<!ENTITY" in raw:
        return None, "file contains <!DOCTYPE>/<!ENTITY> — refusing to parse (XXE guard); drawio files never need these"
    try:
        import defusedxml.ElementTree as ET
    except ImportError:
        import xml.etree.ElementTree as ET  # safe: DOCTYPE/ENTITY rejected above
    try:
        return ET.fromstring(raw.decode("utf-8")), None
    except Exception as exc:  # ParseError or bad UTF-8
        return None, f"not well-formed XML: {exc}"


def parse_style(style):
    """'a=b;c;points=[[0,0]]' -> {'a':'b','c':'','points':'[[0,0]]'} (points
    values contain no ';', so a plain split is safe for drawio styles)."""
    out = {}
    for tok in (style or "").split(";"):
        if not tok:
            continue
        key, _, val = tok.partition("=")
        out[key] = val
    return out


def collect_cells(scope):
    """All mxCell elements in scope (flat under <root>, nesting is via the parent attr).

    draw.io wraps a cell in <object>/<UserObject> when the user adds metadata/links in the
    editor — the id and label then live on the WRAPPER, not the mxCell. Returns
    (cells, duplicate_ids)."""
    wrapped = {}  # id(inner mxCell element) -> wrapper element
    for w in scope.iter():
        if w.tag in ("object", "UserObject"):
            inner = w.find("mxCell")
            if inner is not None:
                wrapped[id(inner)] = w

    cells, dup_ids = {}, []
    for el in scope.iter("mxCell"):
        wrapper = wrapped.get(id(el))
        geo = el.find("mxGeometry")
        g = None
        if geo is not None:
            def num(attr):
                try:
                    v = float(geo.get(attr))
                except (TypeError, ValueError):
                    return None
                return v if math.isfinite(v) else None
            g = {
                "x": num("x"), "y": num("y"),
                "w": num("width"), "h": num("height"),
                "relative": geo.get("relative") == "1",
            }
        cid = wrapper.get("id") if wrapper is not None else el.get("id")
        value = (wrapper.get("label") if wrapper is not None else el.get("value")) or ""
        if cid in cells:
            dup_ids.append(cid)
        cells[cid] = {
            "id": cid,
            "value": value,
            "style": parse_style(el.get("style")),
            "raw_style": el.get("style") or "",
            "parent": el.get("parent"),
            "vertex": el.get("vertex") == "1",
            "edge": el.get("edge") == "1",
            "source": el.get("source"),
            "target": el.get("target"),
            "geo": g,
        }
    return cells, dup_ids


def is_container(cell):
    s = cell["style"]
    return s.get("container") == "1" or "grIcon" in s


def rect(cell):
    g = cell["geo"]
    if not g or g["relative"] or g["w"] is None or g["h"] is None:
        return None
    return (g["x"] or 0.0, g["y"] or 0.0, g["w"], g["h"])


def overlaps(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


class Findings:
    def __init__(self, fname):
        self.fname = fname
        self.errors = []
        self.warns = []

    def error(self, msg):
        self.errors.append(f"ERROR {self.fname} {msg}")

    def warn(self, msg):
        self.warns.append(f"WARN  {self.fname} {msg}")


def check_stencils(cells, catalog, f):
    res_set = set(catalog["resource_icons"])
    grp_set = set(catalog["group_icons"])
    all_set = res_set | grp_set | set(catalog["shapes"])

    def suggest(leaf, pool):
        close = difflib.get_close_matches(leaf, pool, n=3, cutoff=0.6)
        hint = f" — closest: {', '.join(close)}" if close else ""
        return hint + " (or use the labeled fallback box, see drawio-reference.md §Special shapes)"

    for c in cells.values():
        s = c["style"]
        where = f"[cell id={c['id']}{' ' + repr(c['value'][:30]) if c['value'] else ''}]"
        for key, pool, pool_name in (("resIcon", res_set, "resource_icons"),
                                     ("grIcon", grp_set, "group_icons")):
            val = s.get(key)
            if not val:
                continue
            if not val.startswith(AWS4):
                f.warn(f"{where} {key}='{val}' is not an {AWS4}* name — cannot validate it")
                continue
            leaf = val[len(AWS4):]
            if leaf not in pool:
                extra = ""
                if leaf in all_set:
                    extra = f" (the name exists but not as a {pool_name.rstrip('s')} — wrong key?)"
                f.error(f"{where} unknown {key} '{val}'{extra}{suggest(leaf, pool)}")
        shape = s.get("shape")
        if shape and shape.startswith(AWS4):
            leaf = shape[len(AWS4):]
            if leaf not in all_set:
                f.error(f"{where} unknown shape '{shape}'{suggest(leaf, all_set)}")


def check_geometry(cells, f):
    for c in cells.values():
        if not c["vertex"]:
            continue
        g = c["geo"]
        where = f"[cell id={c['id']}]"
        if g is None:
            f.error(f"{where} vertex has no mxGeometry")
            continue
        if g["relative"]:
            continue  # edge labels etc. — sized by the renderer
        if not g["w"] or not g["h"]:
            f.error(f"{where} vertex missing width/height")

    # child must fit inside its parent container's box (child x/y are parent-relative)
    for c in cells.values():
        r = rect(c) if c["vertex"] else None
        parent = cells.get(c["parent"])
        if not r or not parent or not parent["vertex"]:
            continue
        pr = rect(parent)
        if not pr:
            continue
        x, y, w, h = r
        if x < 0 or y < 0 or x + w > pr[2] or y + h > pr[3]:
            f.error(f"[cell id={c['id']}] extends outside parent container "
                    f"'{c['parent']}' ({x:g},{y:g} {w:g}x{h:g} vs parent {pr[2]:g}x{pr[3]:g})")

    # sibling overlap: leaf-leaf = ERROR, container-involved = WARN (SG/ASG overlays are legit).
    # Decorations (line dividers, text blocks) are z-layered on purpose — skip them.
    def decorative(cell):
        return cell["raw_style"].startswith(("line", "text;"))

    by_parent = {}
    for c in cells.values():
        if c["vertex"] and rect(c) and not decorative(c):
            by_parent.setdefault(c["parent"], []).append(c)
    for sibs in by_parent.values():
        for i, a in enumerate(sibs):
            for b in sibs[i + 1:]:
                if not overlaps(rect(a), rect(b)):
                    continue
                msg = (f"[cell id={a['id']}] overlaps sibling [cell id={b['id']}] "
                       f"(both children of '{a['parent']}'): {rect(a)} vs {rect(b)}")
                if is_container(a) or is_container(b):
                    f.warn(msg + " — container overlay, check it is intentional")
                else:
                    f.error(msg)


def check_edges(cells, f):
    for c in cells.values():
        if not c["edge"]:
            continue
        where = f"[cell id={c['id']}]"
        src, tgt = c["source"], c["target"]
        if not src and not tgt:
            f.error(f"{where} edge has neither source nor target")
            continue
        for name, ref in (("source", src), ("target", tgt)):
            if ref and ref not in cells:
                f.error(f"{where} edge {name} references nonexistent cell id '{ref}'")
            elif not ref:
                f.warn(f"{where} edge has a floating {name} endpoint — attach it to a cell")


def check_conventions(cells, f):
    has_title = has_legend = False
    for c in cells.values():
        s = c["style"]
        if c["raw_style"].startswith("text;") and s.get("fontStyle") == "1":
            has_title = True
        if "legend" in c["value"].lower():
            has_legend = True
        if s.get("shape") == AWS4 + "resourceIcon":
            r = rect(c)
            if r and (r[2] != ICON_SIZE or r[3] != ICON_SIZE):
                f.warn(f"[cell id={c['id']}] resourceIcon is {r[2]:g}x{r[3]:g} — convention is {ICON_SIZE}x{ICON_SIZE}")
            if s.get("strokeColor", "").lower() != "#ffffff":
                f.warn(f"[cell id={c['id']}] resourceIcon strokeColor="
                       f"{s.get('strokeColor') or '(missing)'} — use #ffffff or the glyph may "
                       f"render invisibly (drawio-reference.md §Gotchas)")
    if not has_title:
        f.warn("no title cell found (text; style with fontStyle=1) — convention: title above the AWS Cloud group")
    if not has_legend:
        f.warn("no legend cell found (a vertex whose label contains 'Legend') — convention: explain edges/numbering")


def main():
    ap = argparse.ArgumentParser(description="Validate a hand-authored .drawio diagram (AWS4 conventions)")
    ap.add_argument("file", help="path to the .drawio file")
    ap.add_argument("--catalog", default=str(Path(__file__).resolve().parent / "aws4-stencils.json"),
                    help="stencil catalog (default: aws4-stencils.json next to this script)")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.is_file():
        print(f"validate-drawio: file not found: {path}", file=sys.stderr)
        return 2
    try:
        catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
        for bucket in ("resource_icons", "group_icons", "shapes"):
            if bucket not in catalog:
                raise KeyError(bucket)
    except (OSError, ValueError, KeyError) as exc:
        print(f"validate-drawio: cannot load catalog '{args.catalog}': {exc}", file=sys.stderr)
        return 2

    f = Findings(path.name)
    try:
        root, err = load_xml(path)
    except OSError as exc:
        print(f"validate-drawio: cannot read '{path}': {exc}", file=sys.stderr)
        return 2
    if err:
        f.error(err)
    else:
        diagrams = list(root.iter("diagram")) or [root]
        if len(diagrams) > 1:
            f.warn(f"{len(diagrams)} <diagram> pages — project convention is one combined page")
        compressed = [d for d in diagrams
                      if d.find("mxGraphModel") is None and (d.text or "").strip()]
        if compressed:
            f.error("compressed .drawio detected — author uncompressed XML (skeleton in drawio-reference.md)")
        else:
            # validate each page independently — ids/geometry never cross pages in draw.io
            for page in diagrams:
                cells, dup_ids = collect_cells(page)
                for d in dup_ids:
                    f.error(f"duplicate cell id '{d}' — the first cell with that id escapes "
                            f"every check and edges bind unpredictably; make ids unique")
                if "0" not in cells or "1" not in cells:
                    f.error("base cells id=0/id=1 missing — copy the skeleton from drawio-reference.md")
                check_stencils(cells, catalog, f)
                check_geometry(cells, f)
                check_edges(cells, f)
                check_conventions(cells, f)

    for line in f.errors + f.warns:
        print(line)
    verdict = "FAIL" if f.errors else "PASS"
    print(f"validate-drawio: {len(f.errors)} error(s), {len(f.warns)} warning(s) — {verdict}")
    return 1 if f.errors else 0


if __name__ == "__main__":
    sys.exit(main())
