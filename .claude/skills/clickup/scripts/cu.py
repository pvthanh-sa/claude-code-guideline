#!/usr/bin/env python3
"""ClickUp REST v2 helper. Read freely; every write needs --apply."""
import argparse, datetime, json, math, os, sys, time, urllib.error, urllib.request

API = "https://api.clickup.com/api/v2"
TZ = datetime.timezone(datetime.timedelta(hours=float(os.environ.get("CLICKUP_TZ_OFFSET", "7"))))
ALLDAY_HOUR = int(os.environ.get("CLICKUP_ALLDAY_HOUR", "4"))
MS_PER_MANDAY = 8 * 3600 * 1000


def token():
    t = os.environ.get("CLICKUP_TOKEN")
    if not t:
        for p in (os.path.expanduser("~/.clickup.env"), ".clickup.env"):
            if os.path.exists(p):
                for line in open(p):
                    if line.startswith("CLICKUP_TOKEN="):
                        t = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not t:
        sys.exit("CLICKUP_TOKEN not set and ~/.clickup.env has none")
    return t


def call(method, path, body=None, params=None):
    url = API + path + (("?" + "&".join(f"{k}={v}" for k, v in params.items())) if params else "")
    req = urllib.request.Request(
        url, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": token(), "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:400]}")


def to_ms(datestr):
    y, m, d = (int(x) for x in datestr.split("-"))
    return int(datetime.datetime(y, m, d, ALLDAY_HOUR, tzinfo=TZ).timestamp() * 1000)


def fmt(ms):
    return datetime.datetime.fromtimestamp(int(ms) / 1000, TZ).strftime("%Y-%m-%d %a") if ms else "-"


def md(ms):
    return round(ms / MS_PER_MANDAY, 2) if ms else None


def fetch_list(list_id):
    out, page = [], 0
    while True:
        d = call("GET", f"/list/{list_id}/task",
                 params={"subtasks": "true", "include_closed": "true", "page": page})
        out += d.get("tasks", [])
        if d.get("last_page") or not d.get("tasks"):
            return out
        page += 1


def workdays(start, holidays, n=400):
    hol = {datetime.date.fromisoformat(h) for h in holidays if h}
    days, d = [], datetime.date.fromisoformat(start)
    while len(days) < n:
        if d.weekday() < 5 and d not in hol:
            days.append(d)
        d += datetime.timedelta(days=1)
    return days


# ---------------------------------------------------------------- commands
def cmd_tree(a):
    ts = fetch_list(a.list_id)
    by_parent = {}
    for t in ts:
        by_parent.setdefault(t.get("parent"), []).append(t)
    roots = by_parent.get(a.root, []) if a.root else by_parent.get(None, [])

    def walk(nodes, depth):
        for t in sorted(nodes, key=lambda x: x["name"]):
            e = md(t.get("time_estimate") or 0)
            print("{}{:<10} {:<48} {:>6} md  {:>14} -> {:<14} [{}]".format(
                "  " * depth, t.get("custom_id") or t["id"], t["name"][:48],
                e if e else "-", fmt(t.get("start_date")), fmt(t.get("due_date")),
                t["status"]["status"]))
            walk(by_parent.get(t["id"], []), depth + 1)

    if a.root:
        me = [t for t in ts if t["id"] == a.root or t.get("custom_id") == a.root]
        walk(me, 0)
    else:
        walk(roots, 0)


def cmd_get(a):
    p = {"custom_task_ids": "true", "team_id": a.team} if a.team else None
    t = call("GET", f"/task/{a.id}", params=p)
    print(json.dumps({k: t.get(k) for k in
                      ("id", "custom_id", "name", "parent", "time_estimate", "start_date", "due_date")},
                     indent=2))
    print("start:", fmt(t.get("start_date")), "| due:", fmt(t.get("due_date")),
          "| estimate:", md(t.get("time_estimate") or 0), "md | status:", t["status"]["status"])


def cmd_set(a):
    body = {}
    if a.clear_dates:
        body.update({"start_date": None, "due_date": None})
    if a.start:
        body.update({"start_date": to_ms(a.start), "start_date_time": False})
    if a.due:
        body.update({"due_date": to_ms(a.due), "due_date_time": False})
    if a.estimate is not None:
        body["time_estimate"] = int(a.estimate * MS_PER_MANDAY)
    if not body:
        sys.exit("nothing to set")
    print(("APPLY  " if a.apply else "DRYRUN ") + a.id, json.dumps(body))
    if a.apply:
        call("PUT", f"/task/{a.id}", body)


def cmd_comment(a):
    body = {"comment_text": a.text, "notify_all": a.notify}
    print(("APPLY  " if a.apply else "DRYRUN ") + a.id, "comment", len(a.text), "chars")
    if a.apply:
        print(call("POST", f"/task/{a.id}/comment", body).get("id"))


def cmd_plan(a):
    items = []
    for spec in a.tasks:
        tid, days = spec.rsplit(":", 1)
        items.append((tid, float(days)))
    days = workdays(a.start, (a.holidays or "").split(","))
    cum, rows = 0.0, []
    for tid, d in items:
        s = days[int(math.floor(cum))]
        cum += d
        e = days[max(int(math.ceil(cum)) - 1, int(math.floor(cum - d)))]
        rows.append((tid, d, s, e))
    for tid, d, s, e in rows:
        print("{:<12} {:>5} md   {} -> {}".format(tid, d, s.strftime("%Y-%m-%d %a"), e.strftime("%Y-%m-%d %a")))
    print("total %.2f md   %s -> %s" % (cum, days[0], rows[-1][3]))
    if not a.apply:
        print("\n(dry run — re-run with --apply to write)")
        return
    for tid, d, s, e in rows:
        call("PUT", f"/task/{tid}", {"start_date": to_ms(s.isoformat()), "start_date_time": False,
                                     "due_date": to_ms(e.isoformat()), "due_date_time": False})
        time.sleep(0.25)
    print("written:", len(rows))


def cmd_verify(a):
    ts = fetch_list(a.list_id)
    hol = {datetime.date.fromisoformat(h) for h in (a.holidays or "").split(",") if h}
    bad = []
    for t in ts:
        if not t.get("start_date"):
            continue
        for k in ("start_date", "due_date"):
            if not t.get(k):
                continue
            d = datetime.datetime.fromtimestamp(int(t[k]) / 1000, TZ).date()
            if d.weekday() > 4 or d in hol:
                bad.append((t.get("custom_id") or t["id"], k, d.isoformat()))
    print("tasks:", len(ts), "| dated:", sum(1 for t in ts if t.get("start_date") and t.get("due_date")))
    print("on a weekend or holiday:", bad or "none")


p = argparse.ArgumentParser(prog="cu.py")
sub = p.add_subparsers(dest="cmd", required=True)

s = sub.add_parser("tree", help="print a list as a task tree")
s.add_argument("list_id"); s.add_argument("--root", help="only this task id and its descendants")
s.set_defaults(f=cmd_tree)

s = sub.add_parser("get", help="one task")
s.add_argument("id"); s.add_argument("--team", help="team id, required for custom ids like DEV-1234")
s.set_defaults(f=cmd_get)

s = sub.add_parser("set", help="dates and/or estimate on one task")
s.add_argument("id"); s.add_argument("--start"); s.add_argument("--due")
s.add_argument("--estimate", type=float, help="man-days (8h = 1)")
s.add_argument("--clear-dates", action="store_true"); s.add_argument("--apply", action="store_true")
s.set_defaults(f=cmd_set)

s = sub.add_parser("comment", help="post a comment")
s.add_argument("id"); s.add_argument("text")
s.add_argument("--notify", action="store_true"); s.add_argument("--apply", action="store_true")
s.set_defaults(f=cmd_comment)

s = sub.add_parser("plan", help="lay ordered tasks on working days")
s.add_argument("--start", required=True); s.add_argument("--holidays", default="")
s.add_argument("--tasks", nargs="+", required=True, metavar="ID:MANDAYS")
s.add_argument("--apply", action="store_true")
s.set_defaults(f=cmd_plan)

s = sub.add_parser("verify", help="read back and check nothing landed on a weekend")
s.add_argument("list_id"); s.add_argument("--holidays", default="")
s.set_defaults(f=cmd_verify)

a = p.parse_args()
a.f(a)
