# Livro de Espólios — Registro da Guild

Site estático (HTML/CSS/JS puro, sem build) com todos os dados da planilha de controle de loot: itens/drops, personagens, times (parties), cotações entre servidores, rankings e catálogo visual de itens — e agora **editável diretamente no navegador**.

## Arquivos

- `index.html` — estrutura e estilo do site
- `data.js` — todos os dados (edite aqui para atualizar permanentemente) + mapa de imagens dos itens
- `app.js` — renderização, filtros, ordenação, modo edição e persistência
- `img/items/` — 92 ícones dos itens, extraídos da planilha original

## Como publicar no GitHub Pages

1. Crie um repositório novo no GitHub.
2. Suba **todo o conteúdo desta pasta**, incluindo a subpasta `img/items/` inteira, mantendo essa estrutura de pastas.
3. No repositório, vá em **Settings → Pages**.
4. Em **Source**, selecione a branch `main` (ou `master`) e a pasta `/ (root)`.
5. Salve. Em alguns minutos o site estará disponível em:
   `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`

⚠️ Se a pasta `img/items/` não for enviada junto, os ícones não aparecem (mas o site continua funcionando normalmente, só sem as imagens).

## Modo edição (novo)

Clique em **"Modo edição"** na barra lateral para ativar botões de adicionar/editar/excluir em:

- **Itens & Drops**
- **Personagens**
- **Times** (incluindo membros de cada time)

Tudo que você mexer é salvo automaticamente no navegador (localStorage) — funciona mesmo offline, mas **fica só naquele navegador/dispositivo**. Para tornar uma mudança permanente e visível para todo mundo (outros dispositivos, outras pessoas acessando o link do GitHub Pages), use:

- **Exportar dados** — baixa um arquivo `data-export.js` com o estado atual. Copie o conteúdo dele para dentro do `data.js` do repositório (substituindo os blocos `DROPS`, `CHARACTERS` e `PARTIES`) e suba (`commit` + `push`). O GitHub Pages atualiza sozinho em seguida.
- **Importar dados** — carrega de volta um arquivo exportado anteriormente (útil para sincronizar edições feitas em outro navegador).
- **Restaurar padrão** — apaga as edições salvas localmente e volta aos dados originais do `data.js`.

## Como atualizar os dados manualmente

Sempre que quiser editar direto no arquivo (sem usar o modo edição do site), mexa nos arrays em `data.js`:

- `DROPS` — itens retirados (baú/quest), status e valor
- `CHARACTERS` — personagens da guild
- `PARTIES` — composição dos times por servidor
- `RATES` / `RATES_SERVERS` — cotações de compra/venda
- `RANKINGS` — recordes por servidor
- `ITEM_REFERENCE` — lista de nomes de itens usada na galeria e no autocomplete
- `ITEM_IMAGES` — mapa "Nome do item" → nome do arquivo em `img/items/`

Para adicionar um item novo à galeria com ícone: coloque a imagem em `img/items/`, adicione uma linha em `ITEM_IMAGES` apontando para ela, e adicione o nome em `ITEM_REFERENCE`.
