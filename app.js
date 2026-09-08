// Renderização, filtros, edição e persistência do Livro de Espólios

/* ================= HELPERS GERAIS ================= */

function statusClass(status){
  const s = (status||"").toLowerCase();
  if(s.includes("vendido")) return "status-vendido";
  if(s.includes("usando")) return "status-usando";
  if(s.includes("venda")) return "status-avenda";
  if(s.includes("pendente")) return "status-pendente";
  if(s.includes("aberto")) return "status-aberto";
  if(s.includes("trocado")) return "status-trocado";
  return "status-none";
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[m]));
}

/* ---------------- VALOR PARSING (para totais e ordenação) ----------------
   Reconhece formatos como "7000rc", "150kk", "21k", "18.25k rc", "0".
   "kk" = milhão de gold; "k" = mil de gold; "rc" = Rubini Coin (com "k rc" = mil de rc).
*/
function parseValor(raw){
  if(!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^([\d]+(?:\.\d+)?)\s*(kk|k)?\s*(rc)?$/i);
  if(!m) return null;
  const num = parseFloat(m[1]);
  const mult = m[2] ? m[2].toLowerCase() : null;
  const isRc = !!m[3];
  if(isRc){
    const amount = mult === "k" ? num * 1000 : num;
    return {currency:"rc", amount};
  }
  let amount;
  if(mult === "kk") amount = num * 1000000;
  else if(mult === "k") amount = num * 1000;
  else amount = num;
  return {currency:"gold", amount};
}

function formatGold(n){
  if(n >= 1000000) return (n/1000000).toLocaleString("pt-BR", {maximumFractionDigits:2}) + "kk";
  if(n >= 1000) return (n/1000).toLocaleString("pt-BR", {maximumFractionDigits:2}) + "k";
  return n.toLocaleString("pt-BR");
}
function formatRc(n){
  return n.toLocaleString("pt-BR") + " rc";
}

/* ---------------- IMAGENS DE ITENS ---------------- */
const IMG_BASE = "img/items/";

function normalizeItemName(name){
  return String(name || "")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
    .trim()
    .toLowerCase();
}

let ITEM_IMAGES_NORMALIZED = null;
function getItemImageFile(itemName){
  if(!itemName) return null;
  if(ITEM_IMAGES_NORMALIZED === null){
    ITEM_IMAGES_NORMALIZED = {};
    Object.keys(ITEM_IMAGES).forEach(k=>{
      ITEM_IMAGES_NORMALIZED[normalizeItemName(k)] = ITEM_IMAGES[k];
    });
  }
  if(ITEM_IMAGES[itemName]) return ITEM_IMAGES[itemName];
  return ITEM_IMAGES_NORMALIZED[normalizeItemName(itemName)] || null;
}

function itemIconHtml(itemName, size){
  size = size || 28;
  const file = getItemImageFile(itemName);
  if(file){
    return `<img src="${IMG_BASE}${escapeHtml(file)}" alt="" class="item-icon" style="width:${size}px;height:${size}px;" loading="lazy">`;
  }
  return `<span class="item-icon-placeholder" style="width:${size}px;height:${size}px;"></span>`;
}

/* ================= PERSISTÊNCIA (localStorage) ================= */
const STORAGE_KEY = "tibia-guild-data-v1";
let uidCounter = 1;
function nextUid(){ return "u" + (uidCounter++); }

function assignUids(){
  DROPS.forEach(d => { if(!d._uid) d._uid = nextUid(); });
  CHARACTERS.forEach(c => { if(!c._uid) c._uid = nextUid(); });
  PARTIES.forEach(p => {
    if(!p._uid) p._uid = nextUid();
    p.membros.forEach(m => { if(!m._uid) m._uid = nextUid(); });
  });
}

function saveState(){
  try{
    const payload = { DROPS, CHARACTERS, PARTIES };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }catch(e){
    console.warn("Não foi possível salvar no localStorage:", e);
  }
}

function loadState(){
  let raw;
  try{ raw = localStorage.getItem(STORAGE_KEY); }
  catch(e){ return; }
  if(!raw) return;
  let parsed;
  try{ parsed = JSON.parse(raw); }
  catch(e){ return; }
  if(parsed.DROPS){ DROPS.length = 0; DROPS.push(...parsed.DROPS); }
  if(parsed.CHARACTERS){ CHARACTERS.length = 0; CHARACTERS.push(...parsed.CHARACTERS); }
  if(parsed.PARTIES){ PARTIES.length = 0; PARTIES.push(...parsed.PARTIES); }
}

function resetToDefault(){
  if(!confirm("Isso vai apagar todas as suas edições salvas neste navegador e voltar aos dados originais do arquivo. Continuar?")) return;
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  location.reload();
}

function exportData(){
  const stripUid = (arr) => arr.map(({_uid, ...rest}) => rest);
  const strippedParties = PARTIES.map(({_uid, membros, ...rest}) => ({
    ...rest,
    membros: membros.map(({_uid, ...m}) => m)
  }));
  const payload = {
    DROPS: stripUid(DROPS),
    CHARACTERS: stripUid(CHARACTERS),
    PARTIES: strippedParties,
  };
  const jsContent = `// Dados exportados do Livro de Espólios em ${new Date().toLocaleString("pt-BR")}
// Substitua as seções DROPS, CHARACTERS e PARTIES no seu data.js por este conteúdo
// (mantenha RATES, RATES_SERVERS, RANKINGS, ITEM_REFERENCE, ITEM_IMAGES e SHEET_USERS como estão).

const DROPS = ${JSON.stringify(payload.DROPS, null, 2)};

const CHARACTERS = ${JSON.stringify(payload.CHARACTERS, null, 2)};

const PARTIES = ${JSON.stringify(payload.PARTIES, null, 2)};
`;
  const blob = new Blob([jsContent], {type:"text/javascript"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data-export.js";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const text = reader.result;
      let parsed;
      if(text.trim().startsWith("{")){
        parsed = JSON.parse(text);
      } else {
        // tenta extrair objetos DROPS/CHARACTERS/PARTIES de um arquivo .js exportado
        parsed = {};
        ["DROPS","CHARACTERS","PARTIES"].forEach(key=>{
          const re = new RegExp("const\\s+" + key + "\\s*=\\s*(\\[[\\s\\S]*?\\]);");
          const m = text.match(re);
          if(m){
            // eslint-disable-next-line no-eval
            parsed[key] = JSON.parse(m[1]);
          }
        });
      }
      if(!parsed.DROPS && !parsed.CHARACTERS && !parsed.PARTIES){
        alert("Não foi possível reconhecer o arquivo. Use um arquivo exportado por este site (JSON ou .js).");
        return;
      }
      if(parsed.DROPS){ DROPS.length = 0; DROPS.push(...parsed.DROPS); }
      if(parsed.CHARACTERS){ CHARACTERS.length = 0; CHARACTERS.push(...parsed.CHARACTERS); }
      if(parsed.PARTIES){ PARTIES.length = 0; PARTIES.push(...parsed.PARTIES); }
      assignUids();
      saveState();
      renderAll();
      alert("Dados importados com sucesso.");
    }catch(e){
      alert("Erro ao importar: " + e.message);
    }
  };
  reader.readAsText(file);
}

/* ================= MODO EDIÇÃO ================= */
const EDIT_MODE_KEY = "tibia-guild-editmode";
let editMode = false;

function setEditMode(on){
  editMode = on;
  document.body.classList.toggle("edit-mode", editMode);
  const toggleBtn = document.getElementById("edit-toggle");
  if(toggleBtn) toggleBtn.classList.toggle("active", editMode);
  try{ localStorage.setItem(EDIT_MODE_KEY, editMode ? "1" : "0"); }catch(e){}
  renderAll();
}

/* ================= MODO COMPACTO ================= */
const COMPACT_MODE_KEY = "tibia-guild-compactmode";
let compactMode = false;

function setCompactMode(on){
  compactMode = on;
  document.body.classList.toggle("compact-mode", compactMode);
  const toggleBtn = document.getElementById("compact-toggle");
  if(toggleBtn) toggleBtn.classList.toggle("active", compactMode);
  try{ localStorage.setItem(COMPACT_MODE_KEY, compactMode ? "1" : "0"); }catch(e){}
}

/* ================= MODAL GENÉRICO ================= */
let modalOnSave = null;
let modalOnDelete = null;

function closeModal(){
  document.getElementById("modal-overlay").classList.add("hidden");
  modalOnSave = null;
  modalOnDelete = null;
}

function openModal({title, fields, values, onSave, onDelete}){
  const overlay = document.getElementById("modal-overlay");
  document.getElementById("modal-title").textContent = title;
  const body = document.getElementById("modal-body");
  body.innerHTML = "";

  fields.forEach(f=>{
    const wrap = document.createElement("div");
    wrap.className = "modal-field";
    const val = values && values[f.key] !== undefined ? values[f.key] : (f.default !== undefined ? f.default : "");

    if(f.type === "checkbox"){
      wrap.innerHTML = `
        <div class="checkbox-row">
          <input type="checkbox" id="mf-${f.key}" ${val ? "checked" : ""}>
          <label for="mf-${f.key}" style="margin:0;">${escapeHtml(f.label)}</label>
        </div>`;
    } else if(f.type === "select"){
      wrap.innerHTML = `
        <label>${escapeHtml(f.label)}</label>
        <select id="mf-${f.key}">
          ${f.options.map(o => `<option value="${escapeHtml(o)}" ${o===val?"selected":""}>${escapeHtml(o || "—")}</option>`).join("")}
        </select>`;
    } else if(f.type === "textarea"){
      wrap.innerHTML = `
        <label>${escapeHtml(f.label)}</label>
        <textarea id="mf-${f.key}" placeholder="${escapeHtml(f.placeholder||"")}">${escapeHtml(val)}</textarea>`;
    } else if(f.type === "number"){
      wrap.innerHTML = `
        <label>${escapeHtml(f.label)}</label>
        <input type="number" id="mf-${f.key}" value="${val ?? ""}" placeholder="${escapeHtml(f.placeholder||"")}">`;
    } else if(f.type === "item"){
      wrap.innerHTML = `
        <label>${escapeHtml(f.label)}</label>
        <input type="text" id="mf-${f.key}" list="item-datalist" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.placeholder||"")}">
        <div class="item-preview" id="mf-${f.key}-preview"></div>`;
    } else {
      wrap.innerHTML = `
        <label>${escapeHtml(f.label)}</label>
        <input type="text" id="mf-${f.key}" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.placeholder||"")}">`;
    }
    body.appendChild(wrap);

    if(f.type === "item"){
      const input = wrap.querySelector("input");
      const preview = wrap.querySelector(".item-preview");
      const updatePreview = ()=>{
        const file = getItemImageFile(input.value);
        preview.innerHTML = file
          ? `<img src="${IMG_BASE}${escapeHtml(file)}" alt=""><span>ícone encontrado</span>`
          : `<span>sem ícone correspondente (o item ainda será salvo normalmente)</span>`;
      };
      input.addEventListener("input", updatePreview);
      updatePreview();
    }
  });

  const deleteBtn = document.getElementById("modal-delete");
  if(onDelete){
    deleteBtn.classList.remove("hidden");
  } else {
    deleteBtn.classList.add("hidden");
  }

  modalOnSave = () => {
    const result = {};
    fields.forEach(f=>{
      const el = document.getElementById(`mf-${f.key}`);
      if(f.type === "checkbox") result[f.key] = el.checked;
      else if(f.type === "number") result[f.key] = el.value === "" ? null : Number(el.value);
      else result[f.key] = el.value;
    });
    onSave(result);
    closeModal();
  };
  modalOnDelete = () => {
    if(confirm("Tem certeza que deseja excluir? Essa ação não pode ser desfeita.")){
      onDelete();
      closeModal();
    }
  };

  overlay.classList.remove("hidden");
}

function setupModalChrome(){
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-save").addEventListener("click", ()=> modalOnSave && modalOnSave());
  document.getElementById("modal-delete").addEventListener("click", ()=> modalOnDelete && modalOnDelete());
  document.getElementById("modal-overlay").addEventListener("click", (e)=>{
    if(e.target.id === "modal-overlay") closeModal();
  });
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") closeModal();
  });

  // datalist global para autocomplete de itens
  const datalist = document.createElement("datalist");
  datalist.id = "item-datalist";
  datalist.innerHTML = ITEM_REFERENCE.map(n => `<option value="${escapeHtml(n)}">`).join("");
  document.body.appendChild(datalist);
}

/* ================= DROPS ================= */
let dropsStatusFilter = "todos";
let dropsSort = {key:null, dir:1};

const DROP_STATUSES = ["Vendido(a)","Usando","A Venda","Pendente","Aberto(a)","Trocado(a)"];

function renderDropsTotals(){
  const sold = DROPS.filter(d => (d.status||"").includes("Vendido"));
  let totalGold = 0, totalRc = 0, unparsed = 0;
  const byResp = {};

  sold.forEach(d=>{
    const parsed = parseValor(d.valor);
    if(!parsed){ if(d.valor) unparsed++; return; }
    if(parsed.currency === "gold") totalGold += parsed.amount;
    else totalRc += parsed.amount;

    const resp = d.resp || "—";
    if(!byResp[resp]) byResp[resp] = {gold:0, rc:0};
    if(parsed.currency === "gold") byResp[resp].gold += parsed.amount;
    else byResp[resp].rc += parsed.amount;
  });

  const panel = document.getElementById("drops-totals");
  panel.innerHTML = `
    <div class="totals-card">
      <div class="label">Total vendido em ouro</div>
      <div class="value">${formatGold(totalGold)} <small>gold</small></div>
    </div>
    <div class="totals-card">
      <div class="label">Total vendido em Rubini Coin</div>
      <div class="value">${formatRc(totalRc)}</div>
    </div>
    <div class="totals-card">
      <div class="label">Itens vendidos</div>
      <div class="value">${sold.length} <small>${unparsed ? `(${unparsed} sem valor legível)` : ""}</small></div>
    </div>
    <div class="totals-breakdown">
      <div class="label">Por responsável</div>
      <table>
        <thead><tr><th>Responsável</th><th class="num">Ouro</th><th class="num">Rubini Coin</th></tr></thead>
        <tbody>
          ${Object.entries(byResp)
            .sort((a,b) => (b[1].gold - a[1].gold))
            .map(([resp, v]) => `
              <tr>
                <td>${escapeHtml(resp)}</td>
                <td class="num">${v.gold ? formatGold(v.gold) : '<span class="muted">—</span>'}</td>
                <td class="num">${v.rc ? formatRc(v.rc) : '<span class="muted">—</span>'}</td>
              </tr>
            `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDropsFilters(){
  const statuses = Array.from(new Set(DROPS.map(d => d.status).filter(Boolean)));
  const wrap = document.getElementById("drops-status-filter");
  const all = [["todos","Todos"]].concat(statuses.map(s => [s,s]));
  wrap.innerHTML = all.map(([val,label]) =>
    `<button class="chip ${val===dropsStatusFilter?'active':''}" data-status="${escapeHtml(val)}">${escapeHtml(label)}</button>`
  ).join("");
  wrap.querySelectorAll(".chip").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      dropsStatusFilter = btn.dataset.status;
      renderDropsFilters();
      renderDrops();
    });
  });
}

function parseDataBr(str){
  if(!str) return -Infinity;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m) return -Infinity;
  return new Date(+m[3], +m[2]-1, +m[1]).getTime();
}

function sortDrops(list){
  if(!dropsSort.key) return list;
  const key = dropsSort.key, dir = dropsSort.dir;
  return [...list].sort((a,b)=>{
    let av, bv;
    if(key === "id"){ av = a.id ?? -Infinity; bv = b.id ?? -Infinity; }
    else if(key === "data"){ av = parseDataBr(a.data); bv = parseDataBr(b.data); }
    else if(key === "valor"){
      const pa = parseValor(a.valor), pb = parseValor(b.valor);
      av = pa ? pa.amount : -Infinity;
      bv = pb ? pb.amount : -Infinity;
    } else {
      av = (a[key] || "").toString().toLowerCase();
      bv = (b[key] || "").toString().toLowerCase();
    }
    if(av < bv) return -1 * dir;
    if(av > bv) return 1 * dir;
    return 0;
  });
}

function updateSortHeaders(tableId, sortState){
  document.querySelectorAll(`#${tableId} thead th.sortable`).forEach(th=>{
    th.classList.remove("sort-asc","sort-desc");
    const arrow = th.querySelector(".arrow");
    if(th.dataset.key === sortState.key){
      th.classList.add(sortState.dir === 1 ? "sort-asc" : "sort-desc");
      if(arrow) arrow.textContent = sortState.dir === 1 ? "▲" : "▼";
    } else if(arrow){
      arrow.textContent = "▲";
    }
  });
}

function dropFields(){
  return [
    {key:"item", label:"Item", type:"item", placeholder:"Ex: Soulbleeder"},
    {key:"servidor", label:"Servidor", type:"text", placeholder:"Ex: Grimoria II [Malveria]"},
    {key:"origem", label:"Origem", type:"text", placeholder:"Ex: Soulwar [chest]"},
    {key:"resp", label:"Responsável", type:"text", placeholder:"Ex: PT, Alif, Rafa…"},
    {key:"data", label:"Data (dd/mm/aaaa)", type:"text", placeholder:"10/09/2026"},
    {key:"status", label:"Status", type:"select", options:["", ...DROP_STATUSES]},
    {key:"valor", label:"Valor", type:"text", placeholder:"Ex: 150kk, 7000rc"},
    {key:"obs", label:"Comentários", type:"textarea"},
  ];
}

function openAddDropModal(){
  openModal({
    title: "Adicionar item",
    fields: dropFields(),
    values: {},
    onSave: (vals)=>{
      const maxId = DROPS.reduce((m,d)=> d.id && d.id > m ? d.id : m, 0);
      DROPS.push({ id: maxId + 1, _uid: nextUid(), ...vals });
      saveState();
      renderDrops();
      renderStats();
    }
  });
}

function openEditDropModal(uid){
  const drop = DROPS.find(d => d._uid === uid);
  if(!drop) return;
  openModal({
    title: "Editar item",
    fields: dropFields(),
    values: drop,
    onSave: (vals)=>{
      Object.assign(drop, vals);
      saveState();
      renderDrops();
      renderStats();
    },
    onDelete: ()=>{
      const idx = DROPS.findIndex(d => d._uid === uid);
      if(idx > -1) DROPS.splice(idx, 1);
      saveState();
      renderDrops();
      renderStats();
    }
  });
}

function renderDrops(){
  renderDropsTotals();
  const q = (document.getElementById("drops-search").value || "").toLowerCase().trim();
  const tbody = document.querySelector("#drops-table tbody");
  let filtered = DROPS.filter(d=>{
    if(dropsStatusFilter !== "todos" && d.status !== dropsStatusFilter) return false;
    if(!q) return true;
    const hay = [d.item, d.servidor, d.origem, d.resp, d.status, d.valor, d.obs].join(" ").toLowerCase();
    return hay.includes(q);
  });
  filtered = sortDrops(filtered);
  updateSortHeaders("drops-table", dropsSort);

  document.getElementById("drops-empty").style.display = filtered.length ? "none" : "block";

  tbody.innerHTML = filtered.map(d => `
    <tr>
      <td class="num muted">${d.id ?? "—"}</td>
      <td>${itemIconHtml(d.item)}</td>
      <td>${escapeHtml(d.item)}</td>
      <td class="muted">${escapeHtml(d.servidor)}</td>
      <td>${escapeHtml(d.origem)}</td>
      <td>${escapeHtml(d.resp) || '<span class="muted">—</span>'}</td>
      <td class="muted">${escapeHtml(d.data) || "—"}</td>
      <td>${d.status ? `<span class="status-pill ${statusClass(d.status)}">${escapeHtml(d.status)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(d.valor) || '<span class="muted">—</span>'}</td>
      <td class="muted">${escapeHtml(d.obs) || "—"}</td>
      <td class="edit-only-cell">
        <button class="icon-btn" data-edit-drop="${d._uid}" title="Editar">✎</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-drop]").forEach(btn=>{
    btn.addEventListener("click", ()=> openEditDropModal(btn.dataset.editDrop));
  });
}

/* ================= CHARACTERS ================= */
function flagCell(v){
  if(v === true) return '<span class="flag-true">✓</span>';
  if(v === false) return '<span class="flag-false">–</span>';
  return '<span class="muted">?</span>';
}

function boolSelectValue(v){
  if(v === true) return "true";
  if(v === false) return "false";
  return "";
}
function boolFromSelect(v){
  if(v === "true") return true;
  if(v === "false") return false;
  return null;
}

function charFields(){
  return [
    {key:"nome", label:"Nome do personagem", type:"text"},
    {key:"servidor", label:"Servidor", type:"text"},
    {key:"conta", label:"Conta", type:"text"},
    {key:"voc", label:"Vocação", type:"text", placeholder:"Ex: 🧑‍🚒 EK [Elite Knight]"},
    {key:"level", label:"Level", type:"number"},
    {key:"primal", label:"Primal (ex: 7/12)", type:"text"},
    {key:"soulwar", label:"Soulwar", type:"select", options:["","true","false"]},
    {key:"sanguine", label:"Sanguine", type:"select", options:["","true","false"]},
    {key:"graveborn", label:"Graveborn", type:"select", options:["","true","false"]},
    {key:"vendido", label:"Vendido", type:"checkbox"},
  ];
}

function openAddCharModal(){
  openModal({
    title: "Adicionar personagem",
    fields: charFields(),
    values: {soulwar:"", sanguine:"", graveborn:""},
    onSave: (vals)=>{
      CHARACTERS.push({
        _uid: nextUid(),
        nome: vals.nome, servidor: vals.servidor, conta: vals.conta, voc: vals.voc,
        level: vals.level, primal: vals.primal,
        soulwar: boolFromSelect(vals.soulwar), sanguine: boolFromSelect(vals.sanguine),
        graveborn: boolFromSelect(vals.graveborn), vendido: vals.vendido,
      });
      saveState();
      renderChars();
      renderStats();
    }
  });
}

function openEditCharModal(uid){
  const c = CHARACTERS.find(c => c._uid === uid);
  if(!c) return;
  openModal({
    title: "Editar personagem",
    fields: charFields(),
    values: {...c, soulwar: boolSelectValue(c.soulwar), sanguine: boolSelectValue(c.sanguine), graveborn: boolSelectValue(c.graveborn)},
    onSave: (vals)=>{
      Object.assign(c, {
        nome: vals.nome, servidor: vals.servidor, conta: vals.conta, voc: vals.voc,
        level: vals.level, primal: vals.primal,
        soulwar: boolFromSelect(vals.soulwar), sanguine: boolFromSelect(vals.sanguine),
        graveborn: boolFromSelect(vals.graveborn), vendido: vals.vendido,
      });
      saveState();
      renderChars();
      renderStats();
    },
    onDelete: ()=>{
      const idx = CHARACTERS.findIndex(c => c._uid === uid);
      if(idx > -1) CHARACTERS.splice(idx, 1);
      saveState();
      renderChars();
      renderStats();
    }
  });
}

function renderChars(){
  const q = (document.getElementById("chars-search").value || "").toLowerCase().trim();
  const sortMode = document.getElementById("chars-sort").value;
  const tbody = document.querySelector("#chars-table tbody");

  let list = CHARACTERS.filter(c=>{
    if(!q) return true;
    const hay = [c.nome, c.servidor, c.conta, c.voc].join(" ").toLowerCase();
    return hay.includes(q);
  });

  if(sortMode === "level-desc") list = [...list].sort((a,b)=>(b.level??-1)-(a.level??-1));
  if(sortMode === "level-asc") list = [...list].sort((a,b)=>(a.level??1e9)-(b.level??1e9));
  if(sortMode === "nome") list = [...list].sort((a,b)=>(a.nome||"").localeCompare(b.nome||""));

  document.getElementById("chars-empty").style.display = list.length ? "none" : "block";

  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.vendido ? '<span class="status-pill status-vendido">vendido</span>' : '<span class="muted">–</span>'}</td>
      <td>${escapeHtml(c.nome) || '<span class="muted">—</span>'}</td>
      <td class="muted">${escapeHtml(c.servidor) || "—"}</td>
      <td class="muted">${escapeHtml(c.conta) || "—"}</td>
      <td>${escapeHtml(c.voc) || '<span class="muted">—</span>'}</td>
      <td class="num">${c.level ?? '<span class="muted">—</span>'}</td>
      <td class="muted">${escapeHtml(c.primal) || "—"}</td>
      <td>${flagCell(c.soulwar)}</td>
      <td>${flagCell(c.sanguine)}</td>
      <td>${flagCell(c.graveborn)}</td>
      <td class="edit-only-cell">
        <button class="icon-btn" data-edit-char="${c._uid}" title="Editar">✎</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-char]").forEach(btn=>{
    btn.addEventListener("click", ()=> openEditCharModal(btn.dataset.editChar));
  });
}

/* ================= PARTIES ================= */
function partyFields(){
  return [{key:"nome", label:"Nome do time", type:"text", placeholder:"Ex: PT3 (Malveria)"}];
}

function memberFields(){
  return [
    {key:"nome", label:"Nome do personagem", type:"text"},
    {key:"voc", label:"Vocação", type:"text"},
    {key:"level", label:"Level", type:"number"},
    {key:"primal", label:"Primal (ex: 12/12)", type:"text"},
    {key:"primalReward", label:"Recompensa do Primal", type:"item", placeholder:"Ex: Arboreal Crown"},
    {key:"soulwar", label:"Soulwar concluído", type:"checkbox"},
    {key:"soulwarItem", label:"Item do Soulwar", type:"item", placeholder:"Ex: Soulbleeder"},
    {key:"rotten", label:"Rotten Blood concluído", type:"checkbox"},
    {key:"rottenItem", label:"Item do Rotten Blood", type:"item", placeholder:"Ex: Sanguine Cudgel"},
  ];
}

function openAddPartyModal(){
  openModal({
    title: "Novo time",
    fields: partyFields(),
    values: {},
    onSave: (vals)=>{
      PARTIES.push({_uid: nextUid(), nome: vals.nome || "Novo time", membros: []});
      saveState();
      renderParties();
      renderStats();
    }
  });
}

function openEditPartyModal(uid){
  const pt = PARTIES.find(p => p._uid === uid);
  if(!pt) return;
  openModal({
    title: "Editar time",
    fields: partyFields(),
    values: pt,
    onSave: (vals)=>{
      pt.nome = vals.nome;
      saveState();
      renderParties();
    },
    onDelete: ()=>{
      const idx = PARTIES.findIndex(p => p._uid === uid);
      if(idx > -1) PARTIES.splice(idx, 1);
      saveState();
      renderParties();
      renderStats();
    }
  });
}

function openAddMemberModal(partyUid){
  const pt = PARTIES.find(p => p._uid === partyUid);
  if(!pt) return;
  openModal({
    title: `Adicionar membro — ${pt.nome}`,
    fields: memberFields(),
    values: {},
    onSave: (vals)=>{
      pt.membros.push({_uid: nextUid(), ...vals});
      saveState();
      renderParties();
    }
  });
}

function openEditMemberModal(partyUid, memberUid){
  const pt = PARTIES.find(p => p._uid === partyUid);
  if(!pt) return;
  const m = pt.membros.find(m => m._uid === memberUid);
  if(!m) return;
  openModal({
    title: `Editar membro — ${pt.nome}`,
    fields: memberFields(),
    values: m,
    onSave: (vals)=>{
      Object.assign(m, vals);
      saveState();
      renderParties();
    },
    onDelete: ()=>{
      const idx = pt.membros.findIndex(mm => mm._uid === memberUid);
      if(idx > -1) pt.membros.splice(idx, 1);
      saveState();
      renderParties();
    }
  });
}

function renderParties(){
  const q = (document.getElementById("parties-search").value || "").toLowerCase().trim();
  const grid = document.getElementById("parties-grid");

  const filtered = PARTIES.map(pt=>{
    const membros = editMode ? pt.membros : pt.membros.filter(m=>{
      if(!q) return true;
      return (pt.nome + " " + m.nome).toLowerCase().includes(q);
    });
    return {...pt, membros, matchesName: pt.nome.toLowerCase().includes(q)};
  }).filter(pt => !q || pt.matchesName || pt.membros.length);

  grid.innerHTML = filtered.map(pt => `
    <div class="party-card">
      <div class="party-card-head">
        <h3>${escapeHtml(pt.nome)} <span class="n">${pt.membros.length} membro${pt.membros.length===1?'':'s'}</span></h3>
        <button class="icon-btn edit-only" data-edit-party="${pt._uid}" title="Editar time">✎</button>
      </div>
      ${
        pt.membros.length === 0
        ? '<div class="party-empty">Sem membros registrados.</div>'
        : pt.membros.map(m => `
          <div class="member">
            <span class="name">${escapeHtml(m.nome) || '<span class="muted">—</span>'}</span>
            <span class="lvl">${m.level ? 'lvl ' + m.level : ''}</span>
            <span class="voc">${escapeHtml(m.voc) || ''}</span>
            <div class="tags">
              ${m.primal ? `<span class="tag on">Primal ${escapeHtml(m.primal)}</span>` : ''}
              ${m.primalReward ? `<span class="tag on">${escapeHtml(m.primalReward)}</span>` : ''}
              <span class="tag ${m.soulwar ? 'on':'off'}">Soulwar${m.soulwarItem ? ': '+escapeHtml(m.soulwarItem):''}</span>
              <span class="tag ${m.rotten ? 'on':'off'}">Rotten${m.rottenItem ? ': '+escapeHtml(m.rottenItem):''}</span>
              <button class="icon-btn edit-only" data-edit-member="${pt._uid}|${m._uid}" title="Editar membro" style="margin-left:auto;">✎</button>
            </div>
          </div>
        `).join("")
      }
      <button class="add-member-btn edit-only" data-add-member="${pt._uid}" type="button">+ Adicionar membro</button>
    </div>
  `).join("") || '<div class="empty-note">Nenhum time encontrado.</div>';

  grid.querySelectorAll("[data-edit-party]").forEach(btn=>{
    btn.addEventListener("click", ()=> openEditPartyModal(btn.dataset.editParty));
  });
  grid.querySelectorAll("[data-add-member]").forEach(btn=>{
    btn.addEventListener("click", ()=> openAddMemberModal(btn.dataset.addMember));
  });
  grid.querySelectorAll("[data-edit-member]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const [partyUid, memberUid] = btn.dataset.editMember.split("|");
      openEditMemberModal(partyUid, memberUid);
    });
  });
}

/* ================= RATES ================= */
function fmtNumber(n){
  return n.toLocaleString("pt-BR");
}

function renderRates(){
  const head = document.getElementById("rates-head");
  head.innerHTML = "<th>Moeda</th>" + RATES_SERVERS.map(s => `<th class="num" colspan="2">${escapeHtml(s)}</th>`).join("");

  const subHeadRow = document.createElement("tr");
  subHeadRow.innerHTML = "<th></th>" + RATES_SERVERS.map(()=>`<th class="num">Venda</th><th class="num">Compra</th>`).join("");
  document.querySelector("#rates-table thead").appendChild(subHeadRow);

  const tbody = document.querySelector("#rates-table tbody");
  tbody.innerHTML = RATES.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.moeda)}</strong></td>
      ${RATES_SERVERS.map(s => {
        const v = r.valores[s];
        if(!v) return '<td class="num muted">—</td><td class="num muted">—</td>';
        return `<td class="num">${fmtNumber(v.venda)}</td><td class="num muted">${fmtNumber(v.compra)}</td>`;
      }).join("")}
    </tr>
  `).join("");
}

/* ================= RANKINGS ================= */
function renderRankings(){
  const tbody = document.querySelector("#rankings-table tbody");
  tbody.innerHTML = RANKINGS.map(r => `
    <tr>
      <td>${escapeHtml(r.servidor)}</td>
      <td>${escapeHtml(r.topLevel) || '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(r.mvDrop) || '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(r.lessDeaths) || '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(r.topAvgDrop) || '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(r.goldenDrop) || '<span class="muted">—</span>'}</td>
    </tr>
  `).join("");
}

/* ================= GALERIA DE ITENS ================= */
function renderGallery(){
  const q = (document.getElementById("ref-search").value || "").toLowerCase().trim();
  const grid = document.getElementById("ref-gallery");
  const filtered = ITEM_REFERENCE.filter(name => !q || name.toLowerCase().includes(q));
  document.getElementById("ref-empty").style.display = filtered.length ? "none" : "block";

  grid.innerHTML = filtered.map(name => `
    <div class="gallery-item">
      ${itemIconHtml(name, 40)}
      <div class="gname">${escapeHtml(name)}</div>
    </div>
  `).join("");
}

/* ================= STATS + NAV ================= */
function setText(id, value){
  const el = document.getElementById(id);
  if(el) el.textContent = value;
}

function renderStats(){
  setText("stat-drops", DROPS.length);
  setText("stat-sold", DROPS.filter(d => (d.status||"").includes("Vendido")).length);
  setText("stat-chars", CHARACTERS.length);
  setText("stat-parties", PARTIES.length);

  setText("cnt-drops", DROPS.length);
  setText("cnt-chars", CHARACTERS.length);
  setText("cnt-parties", PARTIES.length);
  setText("cnt-ref", ITEM_REFERENCE.length);

  // cards da página inicial (se existirem)
  setText("cnt-drops-card", DROPS.length);
  setText("cnt-chars-card", CHARACTERS.length);
  setText("cnt-parties-card", PARTIES.length);
  setText("cnt-ref-card", ITEM_REFERENCE.length);
}

function setupActiveNav(){
  const links = Array.from(document.querySelectorAll("nav.toc a"));
  let current = location.pathname.split("/").pop();
  if(!current || !current.endsWith(".html")) current = "index.html";
  links.forEach(l=>{
    const href = l.getAttribute("href");
    l.classList.toggle("active", href === current);
  });
}

/* ================= RENDER ALL ================= */
function renderAll(){
  renderStats();
  if(document.getElementById("drops-table")){
    renderDropsFilters();
    renderDrops();
  }
  if(document.getElementById("chars-table")) renderChars();
  if(document.getElementById("parties-grid")) renderParties();
  if(document.getElementById("ref-gallery")) renderGallery();
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", ()=>{
  assignUids();
  loadState();
  assignUids();

  setupModalChrome();
  setupActiveNav();

  renderStats();

  if(document.getElementById("drops-table")){
    renderDropsFilters();
    renderDrops();
    document.getElementById("drops-search").addEventListener("input", renderDrops);
    document.querySelectorAll("#drops-table thead th.sortable").forEach(th=>{
      th.addEventListener("click", ()=>{
        const key = th.dataset.key;
        dropsSort.dir = (dropsSort.key === key) ? -dropsSort.dir : 1;
        dropsSort.key = key;
        renderDrops();
      });
    });
    document.getElementById("btn-add-drop").addEventListener("click", openAddDropModal);
  }

  if(document.getElementById("chars-table")){
    renderChars();
    document.getElementById("chars-search").addEventListener("input", renderChars);
    document.getElementById("chars-sort").addEventListener("change", renderChars);
    document.getElementById("btn-add-char").addEventListener("click", openAddCharModal);
  }

  if(document.getElementById("parties-grid")){
    renderParties();
    document.getElementById("parties-search").addEventListener("input", renderParties);
    document.getElementById("btn-add-party").addEventListener("click", openAddPartyModal);
  }

  if(document.getElementById("rates-table")){
    renderRates();
  }

  if(document.getElementById("rankings-table")){
    renderRankings();
  }

  if(document.getElementById("ref-gallery")){
    renderGallery();
    document.getElementById("ref-search").addEventListener("input", renderGallery);
  }

  const editToggleBtn = document.getElementById("edit-toggle");
  if(editToggleBtn){
    editToggleBtn.addEventListener("click", ()=> setEditMode(!editMode));
  }
  if(localStorage.getItem(EDIT_MODE_KEY) === "1"){
    setEditMode(true);
  }

  const compactToggleBtn = document.getElementById("compact-toggle");
  if(compactToggleBtn){
    compactToggleBtn.addEventListener("click", ()=> setCompactMode(!compactMode));
  }
  if(localStorage.getItem(COMPACT_MODE_KEY) === "1"){
    setCompactMode(true);
  }

  const btnExport = document.getElementById("btn-export");
  if(btnExport) btnExport.addEventListener("click", exportData);
  const btnReset = document.getElementById("btn-reset");
  if(btnReset) btnReset.addEventListener("click", resetToDefault);
  const btnImport = document.getElementById("btn-import");
  if(btnImport){
    btnImport.addEventListener("click", ()=>{
      document.getElementById("import-file-input").click();
    });
  }
  const importInput = document.getElementById("import-file-input");
  if(importInput){
    importInput.addEventListener("change", (e)=>{
      const file = e.target.files[0];
      if(file) importData(file);
      e.target.value = "";
    });
  }
});
