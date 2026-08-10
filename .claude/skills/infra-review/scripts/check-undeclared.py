import re, sys
src = open(sys.argv[1]).read()
src = re.sub(r'^export const meta[\s\S]*?\n\}\n', '', src)
# STRINGS FIRST, THEN COMMENTS. The other order lets a `//` inside a string (https://, a path)
# start a fake comment and swallow the rest of that line -- which silently deleted a real
# `const HAS_TF = ...` and produced a false "undeclared" report.
code = re.sub(r'`(?:\\.|\$\{[^{}]*\}|[^`\\])*`', '``', src)
code = re.sub(r"'(?:\\.|[^'\n\\])*'", "''", code)
code = re.sub(r'"(?:\\.|[^"\n\\])*"', '""', code)
code = re.sub(r'/\*[\s\S]*?\*/', ' ', code)
code = re.sub(r'//[^\n]*', ' ', code)
declared = set(re.findall(r'\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)', code))
GLOBALS = {'agent','parallel','pipeline','log','phase','args','budget','workflow',
           'JSON','Object','Array','Math','Set','Map','String','Number','Boolean',
           'Promise','Error','console','undefined','NaN','Infinity'}
used = set(re.findall(r'\b([A-Z][A-Z0-9_]{2,})\b', code))
missing = sorted(u for u in used if u not in declared and u not in GLOBALS)
print(f"  ALL_CAPS trong code: {len(used)} · đã khai báo: {len(used)-len(missing)}")
print("  CHƯA KHAI BÁO:", ', '.join(missing) if missing else "(không có)")
sys.exit(1 if missing else 0)
