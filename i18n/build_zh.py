"""Build zh.html from index.html and the Chinese translation tables.

zh-units.json maps the English inner HTML of a page element to its Chinese HTML.
zh-attrs.json maps English attribute values (aria-label, alt, title, ...) to Chinese.
zh-text.json maps bare text nodes that sit next to an icon, such as button labels.
zh-js.json maps strings that the scripts look up with tr()/esc() to Chinese; it is
written to static/js/i18n-zh.js as window.HCU_I18N.

Run from the project root: python3 i18n/build_zh.py
English text that has no entry stays English, and the script lists it.
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import warnings

from bs4 import BeautifulSoup, Comment, MarkupResemblesLocatorWarning, NavigableString

# Short translated fragments such as "AX" look like file names to bs4.
warnings.filterwarnings('ignore', category=MarkupResemblesLocatorWarning)

ROOT = Path(__file__).resolve().parent.parent
BLOCK = {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'ul', 'ol', 'table', 'thead', 'tbody', 'tr', 'pre',
         'section', 'figure', 'article', 'header', 'footer', 'nav', 'main', 'dl', 'form', 'svg', 'script', 'style'}
SKIP = {'pre', 'script', 'style', 'svg', 'code', 'kbd', 'template'}
TEXTY = {'p', 'h1', 'h2', 'h3', 'h4', 'li', 'figcaption', 'th', 'td', 'dt', 'dd', 'button', 'label', 'span', 'a', 'summary',
         'strong', 'small', 'em', 'div', 'b', 'i', 'title', 'caption'}
ATTRS = ('aria-label', 'title', 'alt', 'placeholder', 'data-stage')


def norm(html):
    return re.sub(r'\s+', ' ', html).strip()


def text_units(soup):
    """Outermost elements that hold inline text only (same rule as the extractor)."""
    seen = set()
    for tag in soup.find_all(True):
        if tag.name not in TEXTY or tag.name in SKIP:
            continue
        if any(p.name in SKIP for p in tag.parents) or any(id(p) in seen for p in tag.parents):
            continue
        if any(getattr(d, 'name', None) in BLOCK for d in tag.descendants):
            continue
        if not re.search(r'[A-Za-z]{2,}', tag.get_text(' ', strip=True)):
            continue
        has_text = any(isinstance(c, NavigableString) and not isinstance(c, Comment) and re.search(r'[A-Za-z]', c)
                       for c in tag.children)
        if not has_text and not tag.find(['strong', 'em', 'b', 'a', 'span', 'small', 'i']):
            continue
        seen.add(id(tag))
        yield tag


def main():
    units = {norm(k): v for k, v in json.loads((ROOT / 'i18n/zh-units.json').read_text()).items()}
    attrs = json.loads((ROOT / 'i18n/zh-attrs.json').read_text())
    js = json.loads((ROOT / 'i18n/zh-js.json').read_text())
    # Bare text next to an icon (for example a button with an SVG) is not a text unit.
    bare = json.loads((ROOT / 'i18n/zh-text.json').read_text())
    soup = BeautifulSoup((ROOT / 'index.html').read_text(), 'html.parser')

    # A translation must keep the inline tags of its source, or styling breaks.
    tags = lambda h: sorted(re.findall(r'<(/?[a-z0-9]+)', h))
    for en, zh in units.items():
        if tags(en) != tags(zh):
            print('  tag mismatch:', en[:80])

    missing = []
    for tag in list(text_units(soup)):
        key = norm(tag.decode_contents())
        if key in units:
            tag.clear()
            tag.append(BeautifulSoup(units[key], 'html.parser'))
        else:
            missing.append(key[:80])
    for node in soup.find_all(string=True):
        if node.strip() in bare and not any(p.name in SKIP for p in node.parents):
            node.replace_with(node.replace(node.strip(), bare[node.strip()]))
    for tag in soup.find_all(True):
        for a in ATTRS:
            if tag.get(a) in attrs:
                tag[a] = attrs[tag[a]]
    for meta in soup.find_all('meta'):
        name = str(meta.get('name') or meta.get('property') or '')
        if meta.get('content') in attrs and (name in ('description', 'keywords') or name.startswith(('og:', 'twitter:'))):
            meta['content'] = attrs[meta['content']]

    soup.html['lang'] = 'zh-CN'
    # The Chinese page is its own canonical URL; tools/build_site.py may have made the
    # English URLs absolute, so resolve zh.html against them.
    canonical = soup.find('link', rel='canonical')
    zh_url = urljoin(canonical['href'], 'zh.html')
    canonical['href'] = zh_url
    soup.find('meta', property='og:url')['content'] = zh_url
    soup.find('meta', property='og:locale')['content'] = 'zh_CN'
    soup.find('meta', property='og:locale:alternate')['content'] = 'en_US'
    ld = soup.find('script', type='application/ld+json')
    graph = json.loads(ld.string)
    for node in graph['@graph']:
        if node['@type'] == 'WebPage':
            node['inLanguage'] = 'zh-CN'
            node['description'] = attrs.get(node['description'], node['description'])
    ld.string = '\n  ' + json.dumps(graph, ensure_ascii=False, indent=2).replace('\n', '\n  ') + '\n  '
    switch = soup.select_one('.lang-switch')
    switch['href'], switch['hreflang'], switch['lang'] = './', 'en', 'en'
    switch.string = 'EN'
    site = soup.find('script', src=re.compile(r'^static/js/site\.js'))
    site.insert_before(soup.new_tag('script', src='static/js/i18n-zh.js', defer=''))
    site.insert_before('\n  ')

    # tools/build_site.py versions these links again after zh.html is written.
    for img in soup.find_all('img', src=re.compile(r'^static/imgs/hcu-channels\.svg')):
        img['src'] = 'static/imgs/hcu-channels-zh.svg'
        img['data-motion-base'] = 'static/imgs/hcu-channels-base-zh.svg'
    (ROOT / 'zh.html').write_text(str(soup))
    (ROOT / 'static/js/i18n-zh.js').write_text(
        '// Chinese strings for zh.html, generated by i18n/build_zh.py from i18n/zh-js.json.\n'
        'window.HCU_I18N = ' + json.dumps(js, ensure_ascii=False, indent=0) + ';\n')
    print(f'zh.html written; {len(missing)} untranslated units')
    for m in missing:
        print('  missing:', m)
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
