#!/usr/bin/env python3
"""Check the generated portfolio and run its behavior-focused Node tests."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import ast
import json
import re
import struct
import subprocess
import sys

try:
    import tinycss2
except ImportError:
    raise SystemExit("Install check dependencies: python3 -m pip install -r requirements-dev.txt")

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.ids, self.references, self.assets = [], [], [], []
        self.headings = 0
        self.canvases = []

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "h1":
            self.headings += 1
        if tag == "canvas":
            self.canvases.append((attrs, list(self.stack)))
            assert attrs.get("aria-hidden") == "true" or any(a.get("aria-hidden") == "true" for _, a in self.stack), "Decorative canvas must be hidden from assistive technology"
        for name in ("aria-labelledby", "aria-describedby", "aria-controls"):
            self.references.extend(attrs.get(name, "").split())
        href = attrs.get("href", "")
        if href.startswith("#"):
            self.references.append(href[1:])
        if attrs.get("target") == "_blank":
            assert "noopener" in attrs.get("rel", "").split(), "External tabs need noopener"
        if tag == "img":
            assert "alt" in attrs and "width" in attrs and "height" in attrs, "Images need alt text and intrinsic dimensions"
        for name in ("src", "href"):
            value = attrs.get(name, "")
            if value and not value.startswith("#"):
                parsed = urlsplit(value)
                if not parsed.scheme and not parsed.netloc:
                    self.assets.append(unquote(parsed.path))
        if tag not in self.VOID:
            self.stack.append((tag, attrs))

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        assert self.stack and self.stack[-1][0] == tag, f"Unbalanced closing tag: {tag}"
        self.stack.pop()


def check_values(tokens):
    for token in tokens:
        assert token.type != "error", token
        if hasattr(token, "arguments"):
            check_values(token.arguments)
        if hasattr(token, "content"):
            check_values(token.content)


def check_rules(rules):
    for rule in rules:
        assert rule.type != "error", rule
        if rule.type == "qualified-rule" or rule.type == "at-rule" and rule.lower_at_keyword == "font-face":
            for declaration in tinycss2.parse_declaration_list(rule.content, skip_comments=True, skip_whitespace=True):
                assert declaration.type != "error", declaration
                if declaration.type == "declaration":
                    check_values(declaration.value)
        elif rule.type == "at-rule" and rule.content:
            check_rules(tinycss2.parse_rule_list(rule.content, skip_comments=True, skip_whitespace=True))


def main():
    subprocess.run([sys.executable, str(ROOT / "build.py"), "--check"], check=True)
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    page = Page()
    page.feed(html)
    assert not page.stack, "Unclosed HTML tags"
    assert page.headings == 1, "Expected one primary heading"
    assert all(n == 1 for n in Counter(page.ids).values()), "Duplicate HTML/SVG IDs"
    assert set(page.references) <= set(page.ids), f"Missing references: {set(page.references) - set(page.ids)}"
    assert len(page.canvases) == 2, "Expected the hero and page ASCII scenes"
    for attrs, ancestors in page.canvases:
        if attrs.get("id") == "heroAscii":
            assert any(a.get("id") == "top" for _, a in ancestors), "Hero canvas escaped its section"
    assert not re.search(r"<!-- @(styles|bootstrap|scripts|zenith) -->", html), "Unresolved build include"
    for css in re.findall(r"<style[^>]*>(.*?)</style>", html, re.S):
        check_rules(tinycss2.parse_stylesheet(css, skip_comments=True, skip_whitespace=True))
        page.assets.extend(re.findall(r"url\(['\"]?(fonts/[^)'\"]+)", css))
    for asset in page.assets:
        assert (ROOT / asset).is_file(), f"Missing asset: {asset}"
    print("PASS HTML landmarks, references, local assets and CSS parsing", flush=True)

    for attrs, code in re.findall(r"<script([^>]*)>(.*?)</script>", html, re.S):
        if "application/ld+json" in attrs:
            json.loads(code)
        else:
            subprocess.run(["node", "--check"], input=code, text=True, check=True)
    for file in (ROOT / "src/scripts").glob("*.js"):
        subprocess.run(["node", "--check", str(file)], check=True)
    for file in [ROOT / "build.py", ROOT / "make-og.py", *Path(__file__).parent.glob("*.py")]:
        ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
    png = (ROOT / "og.png").read_bytes()
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", png[16:24]) == (1200, 630), "Invalid social image"
    print("PASS JavaScript/Python syntax, JSON-LD and social image dimensions", flush=True)
    tests = sorted(str(file) for file in (ROOT / "tools").glob("*.test.cjs"))
    assert tests, "Behavior tests are missing"
    subprocess.run(["node", "--test", "--test-reporter=spec", *tests], cwd=ROOT, check=True)
    print("All portfolio checks passed.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, subprocess.CalledProcessError, FileNotFoundError) as error:
        raise SystemExit(f"Check failed: {error}")
