# Party Infernum

Site estático (HTML/CSS/JS puro, sem build) para gerenciar personagens e times da guild — com busca automática de level direto do Rubinot.

## Estrutura de arquivos

- `index.html` — página inicial (resumo + cartões de navegação)
- `personagens.html` — Personagens (com busca de level)
- `times.html` — Times & Parties
- `style.css` — estilo compartilhado por todas as páginas
- `data.js` — dados de personagens e times + mapa de imagens de itens (usado nos campos de recompensa dos times)
- `app.js` — renderização, edição, persistência e busca de level
- `img/items/` — 92 ícones de itens (usados nos campos de recompensa de Primal/Soulwar/Rotten Blood dentro de Times)
- `server.py` — servidor local necessário para a busca de level funcionar (veja abaixo)

## Como publicar no GitHub Pages

1. Crie um repositório novo no GitHub.
2. Suba todo o conteúdo desta pasta, incluindo a subpasta `img/items/` inteira (o `server.py` também pode subir, é só documentação/uso local — ele não roda no GitHub Pages).
3. Em **Settings → Pages**, selecione a branch `main` e a pasta `/ (root)`.
4. O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`

## Busca de level (Rubinot) — como configurar

O Rubinot bloqueia acesso direto de sites externos (proteção anti-bot), então a busca de level **não funciona sozinha no GitHub Pages**. Ela precisa de um servidor rodando na sua máquina, que usa o FlareSolverr pra "passar" pela proteção.

**Passo a passo:**

1. **Instale o Docker** (se ainda não tiver): https://www.docker.com/products/docker-desktop/

2. **Rode o FlareSolverr:**
   ```bash
   docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
   ```

3. **Rode o `server.py`** (Python 3, sem dependências extras — só a biblioteca padrão):
   ```bash
   python server.py
   ```
   Ele sobe em `http://localhost:8080` e fica escutando enquanto a janela do terminal estiver aberta.

4. **No site**, abra a barra lateral → seção "Busca de level (Rubinot)" → confirme que o endereço está `http://localhost:8080` (é o padrão).

5. Na aba **Personagens**, clique em **"🌐 Buscar"** ao lado do personagem — o level atualizado aparece na coluna Level em poucos segundos.

⚠️ **Importante:** isso só funciona no navegador da máquina onde o `server.py` está rodando. Cada pessoa que quiser usar a busca de level precisa rodar o Docker + `server.py` na própria máquina.

### Se a busca não achar o level

O layout do Rubinot pode mudar. Se a busca sempre voltar "personagem não encontrado", olhe o terminal onde o `server.py` está rodando — ele imprime a URL buscada e um trecho do HTML retornado. Me manda esse trecho que eu ajusto o regex de extração em `extrair_level()` dentro do `server.py`.

## Modo edição

Clique em **"Modo edição"** na barra lateral para ativar adicionar/editar/excluir em:

- **Personagens**
- **Times** (incluindo membros de cada time — com campos de recompensa que reconhecem os ícones de item automaticamente)

Tudo fica salvo no navegador (localStorage). Para tornar uma edição permanente e visível pra todo mundo:

- **Exportar dados** — baixa um `data-export.js` pronto pra colar no `data.js` do repositório.
- **Importar dados** — carrega de volta um arquivo exportado.
- **Restaurar padrão** — apaga as edições locais e volta aos dados originais.

## Modo compacto

Botão ao lado do "Modo edição" — reduz o espaçamento das tabelas pra caber mais linhas na tela.

## Como atualizar os dados manualmente

Mexa nos arrays em `data.js`:

- `CHARACTERS` — personagens da guild
- `PARTIES` — composição dos times
- `ITEM_REFERENCE` / `ITEM_IMAGES` — catálogo de itens usado no autocomplete dos campos de recompensa dentro de Times
