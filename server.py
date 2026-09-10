#!/usr/bin/env python3
"""
Party Infernum — servidor local de busca de level (Rubinot)
=============================================================

O site (hospedado no GitHub Pages) não consegue acessar rubinot.com.br
diretamente do navegador porque o site tem proteção anti-bot (Cloudflare).
Este servidor roda na SUA máquina, repassa a busca pro FlareSolverr
(que abre um navegador headless capaz de passar pela proteção) e devolve
só o level pro site.

COMO USAR
---------
1. Instale e rode o FlareSolverr (via Docker é o mais simples):
     docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
   Ele precisa estar escutando em http://localhost:8191

2. Rode este arquivo:
     python server.py
   Por padrão ele sobe em http://localhost:8080

3. No site (Party Infernum), abra a barra lateral → "Busca de level (Rubinot)"
   e confira se o endereço está como http://localhost:8080 (padrão já vem assim).

4. Na aba Personagens, clique em "🌐 Buscar" ao lado do personagem desejado.

DEBUG
-----
Se a busca sempre falhar ou não achar o level, olhe o terminal onde este
servidor está rodando — ele imprime a URL buscada e um trecho do HTML
retornado pelo Rubinot, o que ajuda a ajustar o regex de extração em
`extrair_level()` abaixo caso o site mude de layout.
"""

import json
import re
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8080
FLARESOLVERR_URL = "http://localhost:8191/v1"
RUBINOT_CHAR_URL = "https://rubinot.com.br/characters?name={name}"
FLARE_TIMEOUT_MS = 60000
REQUEST_TIMEOUT_S = 90


def extrair_level(html):
    """Tenta achar o level do personagem no HTML retornado pelo Rubinot.
    Várias tentativas em sequência, da mais específica pra mais genérica,
    porque o layout exato pode variar."""

    padroes = [
        # Tabela típica: <td>Level:</td><td>1234</td>
        r'(?:N[íi]vel|Level)\s*:?\s*</(?:td|b|span)>\s*<(?:td|span)[^>]*>\s*(\d{1,5})',
        # Rótulo e valor na mesma célula: "Level: 1234"
        r'(?:N[íi]vel|Level)\s*:\s*</?[^>]*>?\s*(\d{1,5})',
        # JSON embutido no HTML (algumas páginas carregam dados via script)
        r'"level"\s*:\s*"?(\d{1,5})"?',
        # Texto puro sem tags (último recurso)
        r'(?:N[íi]vel|Level)\D{0,20}(\d{1,5})',
    ]
    for padrao in padroes:
        m = re.search(padrao, html, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def buscar_via_flaresolverr(target_url):
    payload = json.dumps({
        "cmd": "request.get",
        "url": target_url,
        "maxTimeout": FLARE_TIMEOUT_MS,
    }).encode()

    req = urllib.request.Request(
        FLARESOLVERR_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
        flare_data = json.loads(resp.read())

    html = flare_data.get("solution", {}).get("response", "")
    if not html:
        raise ValueError("Resposta vazia do FlareSolverr (cheque se ele está rodando em " + FLARESOLVERR_URL + ")")
    return html


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/":
            self._json(200, {"status": "ok", "message": "Party Infernum level server rodando."})
        else:
            self._json(404, {"error": "não encontrado"})

    def do_POST(self):
        if self.path != "/flare":
            self._json(404, {"error": "rota não encontrada"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            payload = json.loads(body) if body else {}
        except Exception:
            self._json(400, {"error": "corpo da requisição inválido"})
            return

        name = (payload.get("name") or "").strip()
        url = payload.get("url")

        if not url:
            if not name:
                self._json(400, {"error": "informe 'name' ou 'url'"})
                return
            import urllib.parse as _p
            url = RUBINOT_CHAR_URL.format(name=_p.quote(name))

        try:
            html = buscar_via_flaresolverr(url)
        except urllib.error.URLError:
            self._json(502, {"error": "não consegui conectar ao FlareSolverr em " + FLARESOLVERR_URL + " — ele está rodando?"})
            return
        except Exception as e:
            self._json(502, {"error": str(e)})
            return

        level = extrair_level(html)

        print(f"[flare] url={url} | level={level} | html snippet: {html[:300]!r}")

        if not level:
            self._json(200, {"error": "personagem não encontrado ou layout do site mudou (veja o terminal)"})
            return

        self._json(200, {"level": level})

    def log_message(self, format, *args):
        # log mais enxuto no terminal
        print("[server]", format % args)


if __name__ == "__main__":
    print(f"Party Infernum — servidor de busca de level rodando em http://localhost:{PORT}")
    print(f"Repassando buscas para o FlareSolverr em {FLARESOLVERR_URL}")
    print("Deixe esta janela aberta enquanto usa a busca de level no site.\n")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando servidor.")
        server.shutdown()
