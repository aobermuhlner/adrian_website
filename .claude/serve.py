# Local preview server: like `python -m http.server`, but tells the browser not to cache,
# so edited scripts and styles always show up after a reload.
import http.server, socketserver, sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):   # Python 3.6 has no ThreadingHTTPServer
    daemon_threads = True


Server(("", port), NoCache).serve_forever()
