#!/usr/bin/env python3
"""Builds the Textpad walkthrough pages from their templates.

    frontend/docs/textpad.html          web version (frontend/docs/textpad/app.html)
    frontend/docs/textpad-expo.html     Expo version (examples/textpad-expo)
    frontend/docs/textpad-flutter.html  Flutter version (examples/textpad-flutter)

In a template, each line of the form
    @@EXCERPT [file="..."] start="..." [anchor="..."] term="..."@@
becomes a code block quoting the page's source file (or `file`, relative to
the page's source folder): from the first line starting with `start`,
through the first line at or after `anchor` (default: `start`) that equals
`term` (or starts with it, when `term` is not just a closing brace). The
excerpt loses the indentation of its first line.

A line of the form
    @@SOURCE file="..."@@
becomes the whole file.

src/docs-textpad.test.js fails when a page no longer matches its app; run
this script after editing either:

    python3 scripts/docs/generate-textpad-docs.py
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "scripts/docs"

PAGES = [
    # template, output, source folder, default source file
    ("textpad-doc.template.html", "frontend/docs/textpad.html", "frontend/docs/textpad", "app.html"),
    ("textpad-expo-doc.template.html", "frontend/docs/textpad-expo.html", "examples/textpad-expo", "App.js"),
    ("textpad-flutter-doc.template.html", "frontend/docs/textpad-flutter.html", "examples/textpad-flutter", "lib/main.dart"),
]


def build(template, output, folder, default_file):
    def lines_of(name):
        return (ROOT / folder / name).read_text().split("\n")

    def excerpt(match):
        attrs = {key: html.unescape(value) for key, value in re.findall(r'(\w+)="([^"]*)"', match.group(1))}
        name = attrs.get("file", default_file)
        source = lines_of(name)
        start = next(i for i, line in enumerate(source) if line.startswith(attrs["start"]))
        anchor = start
        if "anchor" in attrs:
            anchor = next(i for i in range(start, len(source)) if source[i].startswith(attrs["anchor"]))
        term = attrs["term"]
        closing = term.strip() in ("}", "});", "};")
        end = next(i for i in range(anchor, len(source))
                   if (source[i] == term if closing else source[i].startswith(term)))
        indent = len(source[start]) - len(source[start].lstrip(" "))
        lines = [line[indent:] if line.startswith(" " * indent) else line for line in source[start:end + 1]]
        return (f'        <pre><code class="excerpt" data-file="{name}">'
                + html.escape("\n".join(lines), quote=False) + "</code></pre>")

    def full_source(match):
        name = match.group(1)
        text = (ROOT / folder / name).read_text()
        return (f'        <pre class="full-source"><code class="source" data-file="{name}">'
                + html.escape(text, quote=False) + "</code></pre>")

    page = (DOCS / template).read_text()
    page = re.sub(r"^@@EXCERPT (.*?)@@$", excerpt, page, flags=re.M)
    page = re.sub(r'^@@SOURCE file="([^"]*)"@@$', full_source, page, flags=re.M)
    if "@@" in page:
        raise SystemExit(f"Unprocessed @@ marker in {template}")
    (ROOT / output).write_text(page)
    print(f"Wrote {output} with {page.count('class=\"excerpt\"')} excerpts")


for page in PAGES:
    build(*page)
