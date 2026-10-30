"""Serve the project page for previews: gzip, keep-alive, and cache headers.

    python3 tools/serve.py [--port 8778] [--bind 0.0.0.0]

Text files (HTML, CSS, JS, SVG, JSON, TXT, XML) are sent gzip-compressed when the
browser accepts it; the compressed bytes are kept in memory until the file changes.
A URL with a ?v= version, written by tools/build_site.py, never changes, so the
browser keeps it for a year. Every other URL is revalidated on each visit with
Last-Modified, so a reload always shows the current page.
"""
import argparse
import email.utils
import functools
import gzip
import http.server
import os
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
TEXT = {'.html', '.css', '.js', '.mjs', '.svg', '.json', '.txt', '.xml', '.webmanifest'}


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                      '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
                      '.svg': 'image/svg+xml', '.webp': 'image/webp', '.xml': 'application/xml; charset=utf-8'}
    gz_cache = {}

    def log_message(self, *args):
        pass

    def end_headers(self):
        query = urlsplit(self.path).query
        versioned = any(part.startswith('v=') for part in query.split('&'))
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if versioned else 'no-cache')
        super().end_headers()

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            path = path / 'index.html'
        if (path.suffix not in TEXT or not path.is_file()
                or 'gzip' not in self.headers.get('Accept-Encoding', '')):
            return super().send_head()
        stat = path.stat()
        modified = email.utils.formatdate(stat.st_mtime, usegmt=True)
        since = self.headers.get('If-Modified-Since')
        if since and email.utils.parsedate_to_datetime(since).timestamp() >= int(stat.st_mtime):
            self.send_response(304)
            self.send_header('Last-Modified', modified)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        key = (str(path), stat.st_mtime_ns)
        cache = Handler.gz_cache
        body = cache.get(key)
        if body is None:
            body = gzip.compress(path.read_bytes(), compresslevel=9, mtime=0)
            for old in [k for k in cache if k[0] == key[0]]:
                cache.pop(old, None)  # an older version of this file
            cache[key] = body
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Vary', 'Accept-Encoding')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Last-Modified', modified)
        self.end_headers()
        return _Bytes(body)


class _Bytes:
    """A file-like body for SimpleHTTPRequestHandler.do_GET, which copies and closes it."""

    def __init__(self, data):
        self.data = data

    def read(self, *args):
        data, self.data = self.data, b''
        return data

    def close(self):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--port', type=int, default=8778)
    parser.add_argument('--bind', default='0.0.0.0')
    args = parser.parse_args()
    os.chdir(ROOT)
    http.server.ThreadingHTTPServer.request_queue_size = 64
    server = http.server.ThreadingHTTPServer((args.bind, args.port), functools.partial(Handler, directory=str(ROOT)))
    print(f'serving {ROOT} on {args.bind}:{args.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
