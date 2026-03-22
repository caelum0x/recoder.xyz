#!/usr/bin/env python3
"""Generate HTML docs from markdown."""
import re
import sys
import os

def md_to_html(md, title="Recoder Documentation"):
    html = md
    html = re.sub(r"^### (.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"^# (.+)$", r"<h1>\1</h1>", html, flags=re.MULTILINE)
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    html = re.sub(r"```(\w*)\n(.*?)```", r"<pre><code>\2</code></pre>", html, flags=re.DOTALL)
    html = re.sub(r"`(.+?)`", r"<code>\1</code>", html)
    html = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a href="\2">\1</a>', html)
    html = re.sub(r"^- (.+)$", r"<li>\1</li>", html, flags=re.MULTILINE)
    html = re.sub(r"^---$", r"<hr>", html, flags=re.MULTILINE)
    html = re.sub(r"\n\n", r"\n<br><br>\n", html)

    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title}</title>
<style>
body{{font-family:-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:2rem;background:#0a0a0a;color:#e0e0e0;line-height:1.6}}
h1{{color:#F79009;border-bottom:2px solid #F79009;padding-bottom:.5rem}}
h2{{color:#A855F7;margin-top:2rem}}h3{{color:#3B82F6}}
a{{color:#F79009}}code{{background:#1a1a1a;padding:2px 6px;border-radius:4px}}
pre{{background:#111;padding:1rem;border-radius:8px;overflow-x:auto;border:1px solid #333}}
pre code{{background:none;padding:0}}
table{{width:100%;border-collapse:collapse;margin:1rem 0}}
th,td{{padding:.5rem 1rem;border:1px solid #333;text-align:left}}
th{{background:#1a1a1a;color:#F79009}}li{{margin:.3rem 0}}hr{{border:none;border-top:1px solid #333;margin:2rem 0}}
.nav{{background:#111;padding:1rem;border-radius:8px;margin-bottom:2rem}}.nav a{{margin-right:1.5rem}}
</style></head><body>
<div class="nav"><a href="/">Docs</a> <a href="/api">API</a> <a href="https://recoder.xyz">recoder.xyz</a> <a href="https://agents.recoder.xyz">Agents</a></div>
{html}
</body></html>"""

base = "/root/recoder.xyz/docs/user-guide"
out = "/var/www/docs"

with open(f"{base}/README.md") as f:
    readme = f.read()
with open(f"{base}/api-reference.md") as f:
    api = f.read()

os.makedirs(out, exist_ok=True)
with open(f"{out}/index.html", "w") as f:
    f.write(md_to_html(readme, "Recoder Documentation"))
with open(f"{out}/api.html", "w") as f:
    f.write(md_to_html(api, "Recoder API Reference"))

print(f"Generated: {out}/index.html, {out}/api.html")
