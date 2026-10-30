"""Build the generated parts of the site after editing index.html.

Run from the project root:

    python3 tools/build_site.py                     # versions, zh.html, llms-full.txt
    python3 tools/build_site.py --site-url URL      # also absolute URLs, sitemap.xml, robots.txt

Steps:
1. Every local file that index.html links (static/..., favicon.ico) gets a ?v= version
   from its modification time, so tools/serve.py and other hosts can cache it for good
   and a changed file gets a new URL.
2. --site-url, the public address of the directory that holds index.html: the canonical,
   og:url, image and PDF URLs become absolute, and sitemap.xml and the Sitemap line of
   robots.txt are written.
3. i18n/build_zh.py writes zh.html, which then gets its own versions.
4. llms-full.txt: the English page as Markdown, rendered in a browser so that the result
   tables drawn by charts.js are included. Crawlers that do not run JavaScript read it.
"""
import argparse
import datetime
import functools
import http.server
import re
import subprocess
import sys
import threading
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup, NavigableString, Tag
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BLOCK = {'p', 'div', 'ul', 'ol', 'li', 'table', 'pre', 'section', 'figure', 'header', 'aside', 'details',
         'h1', 'h2', 'h3', 'h4', 'h5'}
# Inline tags that continue a word, so no space goes before them ("72.37<small>%</small>").
GLUED = {'small', 'sup', 'sub', 'code', 'a', 'strong', 'em', 'b', 'i'}
# Step badges such as <span class="step-no">1</span>Project the tree.
NUMBERS = ['.step-no', '.evo-stage > span', '.race-steps li > b', '.tl-dot']
CHROMIUM_ARGS = ['--disable-gpu', '--disable-gpu-compositing', '--disable-software-rasterizer']
# Interactive controls and drawings: their text means nothing without the picture.
DROP = ['script', 'style', 'svg', 'button', 'nav', 'dialog', 'input', 'label', 'template',
        '.chips', '.tabs', '.hero-actions', '.race-screens', '.race-lanes', '.race-controls', '.race-calls',
        '.atlas', '.tok-compare', '.result-grid', '.result-meta', '.trace-controls', '.hero-fig',
        '.chart', '.gd-stage', '.add-vis', '.why-vis', '[aria-hidden="true"]']


LINKED = re.compile(r'((?:href|src|data-motion-base|data-full)=")((?:static/|favicon\.ico)[^"?#]*)(?:\?v=[0-9a-z]+)?(")')


def stamp(name):
    """Version every linked local file by its modification time."""
    path = ROOT / name
    def versioned(m):
        target = ROOT / m[2]
        return f'{m[1]}{m[2]}?v={int(target.stat().st_mtime):x}{m[3]}' if target.is_file() else m[0]
    path.write_text(LINKED.sub(versioned, path.read_text()))


def render(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=CHROMIUM_ARGS)
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.emulate_media(reduced_motion='reduce')
        page.goto(url, wait_until='networkidle')
        # Sections load their data when they come near the screen; visit each one.
        page.evaluate('''async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } }''')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(500)
        html = page.content()
        browser.close()
    return html


def inline(node):
    """Inline Markdown for one element: code spans kept, whitespace collapsed."""
    out = ''
    for child in node.children:
        if isinstance(child, NavigableString):
            out += str(child)
            continue
        if child.name == 'code':
            text = f'`{child.get_text()}`'
        elif child.name == 'br':
            text = ' '
        elif child.name == 'a' and child.get('href', '').startswith('http'):
            text = f'[{inline(child)}]({child["href"]})'
        else:
            text = inline(child)
        # Adjacent spans are laid out apart on the page; keep a space between them.
        if out and text and not out[-1].isspace() and child.name not in GLUED:
            out += ' '
        out += text
    return re.sub(r'\s+', ' ', out).strip()


def table(node):
    rows = [[inline(c).replace('|', '\\|') for c in tr.find_all(['th', 'td'])] for tr in node.find_all('tr')]
    if not rows:
        return ''
    lines = ['| ' + ' | '.join(rows[0]) + ' |', '|' + ' --- |' * len(rows[0])]
    lines += ['| ' + ' | '.join(r) + ' |' for r in rows[1:]]
    return '\n'.join(lines)


def grid(node, out):
    """An ARIA grid of divs: emit each cell under its row and column names."""
    row = ''
    for child in node.find_all(True, recursive=False):
        role = child.get('role')
        if role == 'rowheader':
            row = inline(child)
        elif role == 'cell':
            stage = child.get('data-stage', '')
            out.append(f'#### {row} · {stage}' if stage else f'#### {row}')
            blocks(child, out)


def blocks(node, out):
    for child in node.children:
        if not isinstance(child, Tag):
            continue
        name = child.name
        if child.get('role') == 'table':
            grid(child, out)
        elif name in ('h1', 'h2', 'h3', 'h4', 'h5'):
            text = inline(child)
            if text:
                out.append('#' * int(name[1]) + ' ' + text)
        elif 'scoreboard' in (child.get('class') or []):
            out.append('\n'.join('- ' + inline(a) for a in child.select('a.score')))
        elif name in ('ul', 'ol'):
            items = []
            for li in child.find_all('li', recursive=False):
                if li.find(BLOCK):
                    # A list item with its own blocks, such as a code sample: keep them as blocks.
                    parts = []
                    blocks(li, parts)
                    out.append('\n'.join(f'- {i}' for i in items))
                    items = []
                    texts = [re.sub(r'^#+ ', '', x) for x in parts if not x.startswith('```')]
                    out.append('- ' + ' · '.join(texts))
                    out.extend(x for x in parts if x.startswith('```'))
                elif inline(li):
                    items.append(inline(li))
            if items:
                out.append('\n'.join(f'- {i}' for i in items))
        elif name == 'table':
            out.append(table(child))
        elif name == 'pre':
            lines = child.select('.ln')
            text = '\n'.join(l.get_text() for l in lines) if lines else child.get_text()
            out.append('```\n' + text.strip('\n') + '\n```')
        elif not child.find(BLOCK):
            # A leaf block such as <p>, <figcaption> or a <div> of inline text.
            text = inline(child)
            if text:
                out.append(text)
        else:
            blocks(child, out)


def markdown(html):
    soup = BeautifulSoup(html, 'html.parser')
    for selector in DROP:
        for tag in soup.select(selector):
            tag.decompose()
    for selector in NUMBERS:
        for tag in soup.select(selector):
            tag.replace_with(tag.get_text(strip=True) + '. ')
    for tag in soup.select('.authors > span, .affiliations > span'):
        for sup in tag.find_all('sup'):
            sup.replace_with('^' + sup.get_text())
        if tag.find_next_sibling('span'):
            tag.append(',')
    out = []
    blocks(soup.find('main'), out)
    return '\n\n'.join(b for b in out if b.strip())


def write_llms_full(url):
    head = [
        '# Hybrid Computer Use (HCU): full page text',
        '',
        '> The project page of Hybrid Computer Use as Markdown, with every result table.'
        ' The interactive page is index.html; the Chinese version is zh.html.'
        ' Code: https://github.com/microsoft/Hybrid-Computer-Use. Paper: assets/Hybrid-Computer-Use.pdf.',
        '',
        '',
    ]
    body = markdown(render(url))
    (ROOT / 'llms-full.txt').write_text('\n'.join(head) + body + '\n')
    print(f'llms-full.txt written ({len(body.split())} words)')


def apply_site_url(site):
    """Make the page's own URLs absolute for one deployment address."""
    path = ROOT / 'index.html'
    html = path.read_text()
    absolute = lambda rel: urljoin(site, rel)
    # A rerun with a new address first removes the previous one, read from the canonical link.
    old = re.search(r'<link rel="canonical" href="([^"]*)"', html)[1]
    if old.startswith('http'):
        html = html.replace(old, '')
    for pattern in (r'(<link rel="canonical" href=")([^"]*)(")',
                    r'(<link rel="alternate" hreflang="[^"]+" href=")([^"]*)(")',
                    r'(<meta property="og:(?:url|image)" content=")([^"]*)(")',
                    r'(<meta name="twitter:image" content=")([^"]*)(")',
                    r'(<meta name="citation_pdf_url" content=")([^"]*)(")',
                    r'("(?:contentUrl|image|primaryImageOfPage)": ")([^"]*)(")'):
        html = re.sub(pattern, lambda m: m[1] + absolute(m[2]) + m[3], html)
    path.write_text(html)

    today = datetime.date.today().isoformat()
    en, zh = absolute('./'), absolute('zh.html')
    alternates = (f'<xhtml:link rel="alternate" hreflang="en" href="{en}"/>'
                  f'<xhtml:link rel="alternate" hreflang="zh-CN" href="{zh}"/>'
                  f'<xhtml:link rel="alternate" hreflang="x-default" href="{en}"/>')
    urls = ''.join(f'  <url><loc>{u}</loc><lastmod>{today}</lastmod>{alternates}</url>\n'
                   for u in (en, zh))
    urls += f'  <url><loc>{absolute("assets/Hybrid-Computer-Use.pdf")}</loc><lastmod>{today}</lastmod></url>\n'
    (ROOT / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + urls + '</urlset>\n')
    robots = ROOT / 'robots.txt'
    lines = [l for l in robots.read_text().splitlines() if not l.startswith('Sitemap:')]
    robots.write_text('\n'.join(lines).rstrip() + f'\n\nSitemap: {absolute("sitemap.xml")}\n')
    print(f'absolute URLs set to {site}; sitemap.xml and robots.txt written')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--site-url', help='public URL of the directory that holds index.html')
    args = parser.parse_args()
    stamp('index.html')
    if args.site_url:
        apply_site_url(args.site_url if args.site_url.endswith('/') else args.site_url + '/')
    subprocess.run([sys.executable, str(ROOT / 'i18n/build_zh.py')], check=True, cwd=ROOT)
    stamp('zh.html')

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        write_llms_full(f'http://127.0.0.1:{server.server_port}/index.html')
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
