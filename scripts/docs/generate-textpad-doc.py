#!/usr/bin/env python3
"""Builds frontend/docs/textpad.html from its template.

Each line of the form
    @@EXCERPT start="..." [anchor="..."] term="..."@@
is replaced with a code block quoting frontend/docs/textpad/app.html: from
the first line starting with `start`, through the first line at or after
`anchor` (default: `start`) that equals `term` (or starts with it, when `term`
is not just a closing brace). Excerpts lose the script's 4-space indent.

src/docs-textpad.test.js fails when the page no longer matches the app; run
this script after editing either file:

    python3 scripts/docs/generate-textpad-doc.py
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "scripts/docs/textpad-doc.template.html"
APP = ROOT / "frontend/docs/textpad/app.html"
OUTPUT = ROOT / "frontend/docs/textpad.html"

app = APP.read_text().split("\n")


def excerpt(match):
    attrs = dict(re.findall(r'(\w+)="([^"]*)"', match.group(1)))
    start = next(i for i, line in enumerate(app) if line.startswith(attrs["start"]))
    anchor = start
    if "anchor" in attrs:
        anchor = next(i for i in range(start, len(app)) if app[i].startswith(attrs["anchor"]))
    term = attrs["term"]
    closing = term.strip() in ("}", "});")
    end = next(i for i in range(anchor, len(app)) if (app[i] == term if closing else app[i].startswith(term)))
    lines = [line[4:] if line.startswith("    ") else line for line in app[start:end + 1]]
    return '        <pre><code class="excerpt">' + html.escape("\n".join(lines), quote=False) + "</code></pre>"


page = re.sub(r"^@@EXCERPT (.*?)@@$", excerpt, TEMPLATE.read_text(), flags=re.M)
if "@@EXCERPT" in page:
    raise SystemExit("Unprocessed @@EXCERPT marker in template")
OUTPUT.write_text(page)
print(f"Wrote {OUTPUT.relative_to(ROOT)} with {page.count('class=\"excerpt\"')} excerpts")
