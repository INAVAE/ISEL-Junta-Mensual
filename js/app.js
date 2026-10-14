/* ===========================================================================
   ISEL · Junta mensual de resultados de ventas
   Página estática: los datos base vienen de los reportes de Excel; las
   ediciones, notas y compromisos se guardan en este navegador y se pueden
   respaldar o pasar a otro equipo con un archivo de respaldo.
   =========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------ utilidades */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const MC = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fin = (v) => typeof v === "number" && isFinite(v);
  const div = (a, b) => (fin(a) && fin(b) && b !== 0 ? a / b : null);
  const fmt$ = (v) => (fin(v) ? (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("es-MX") : "—");
  const fmtM = (v, d = 2) => (fin(v) ? (v < 0 ? "−$" : "$") + (Math.abs(v) / 1e6).toFixed(d) + " M" : "—");
  const fmtS = (v) => (fin(v) ? (v >= 0 ? "+" : "−") + "$" + (Math.abs(v) / 1e6).toFixed(2) + " M" : "—");
  const fmtP = (v, d = 0) => (fin(v) ? (v * 100).toFixed(d) + "%" : "—");
  const fmtPs = (v, d = 0) => (fin(v) ? (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(d) + "%" : "—");
  const fmtX = (v) => (fin(v) ? v.toFixed(2) + "×" : "—");
  const semClase = (r) => (!fin(r) ? "na" : r >= 1 ? "ok" : r >= 0.8 ? "warn" : "bad");
  const semTexto = { ok: "Cumple", warn: "80–99%", bad: "<80%", na: "s/meta" };
  const sem = (r, txt) => `<span class="sem ${semClase(r)}" title="${semTexto[semClase(r)]}">${txt ?? fmtP(r)}</span>`;
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const hoy = new Date();
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  /* ----------------------------------------------------- almacenamiento local */
  const LS = "isel-junta-mensual-v1", LS_BASE = "isel-junta-mensual-base-v1", LS_PASS = "isel-junta-mensual-clave", LS_PREFS = "isel-jm-prefs";
  const vacio = () => ({ ed: { h: {}, k: {}, c: {}, s: {} }, juntas: {}, compromisos: [], prefs: {}, analisis: {}, cliCart: {}, campanas: {}, oport: {}, config: {} });
  // Modo nube (Supabase) cuando la página trae configuración y no datos incrustados
  const CONF = window.DATOS_BASE ? null : window.JM_CONFIG || null;
  let NUBE = null, YO = null;
  const esAdmin = () => (NUBE ? !!(YO && YO.rol === "admin") : window.ROL_PRUEBA !== "lector");
  let G = vacio();
  if (!CONF) try { const x = JSON.parse(localStorage.getItem(LS) || "null"); if (x) G = Object.assign(vacio(), x, { ed: Object.assign(vacio().ed, x.ed || {}) }); } catch (e) { /* sin almacenamiento */ }
  try { G.prefs = Object.assign({}, G.prefs, JSON.parse(localStorage.getItem(LS_PREFS) || "{}")); } catch (e) {}
  let guardadoPend = null;
  function guardar() {
    try { localStorage.setItem(LS_PREFS, JSON.stringify(G.prefs || {})); } catch (e) {}
    if (NUBE) { if (esAdmin()) programarSync(); return; }
    clearTimeout(guardadoPend);
    guardadoPend = setTimeout(() => {
      try { localStorage.setItem(LS, JSON.stringify(G)); } catch (e) { toast("Este navegador no permite guardar. Descarga un respaldo para no perder cambios."); }
    }, 250);
  }
  const junta = (k) => (G.juntas[k] = G.juntas[k] || { diagnostico: "", notas: {}, forecast: {}, canceladas: [], kpisExtra: [] });

  /* ------------------------------------------------------------ datos base */
  let BASE = null, IDX = null;

  function indexar() {
    const h = new Map(), anios = new Set(), corte = {};
    for (const r of BASE.hechos) {
      const key = `${r.a}-${r.m}-${r.d}-${r.k}`, e = G.ed.h[key];
      h.set(key, { ...r, meta: e && fin(e.meta) ? e.meta : r.meta, log: e && fin(e.log) ? e.log : r.log, edM: !!(e && fin(e.meta)), edL: !!(e && fin(e.log)) });
      anios.add(r.a);
      if (r.d === "total" && r.log > 0) corte[r.a] = Math.max(corte[r.a] || 0, r.m);
    }
    const kp = new Map();
    for (const k of BASE.kpis || []) kp.set(`${k.a}-${k.m}-${k.k}`, k.v);
    const hist = new Map((BASE.historico || []).map((x) => [`${x.a}-${x.m}`, x.v]));
    const cartNom = {};
    [...BASE.hechos].filter((r) => r.d === "cartera" && r.n && r.n !== "(sin asignar)").sort((x, y) => x.a * 12 + x.m - (y.a * 12 + y.m)).forEach((r) => (cartNom[r.k] = r.n));
    IDX = { h, kp, hist, anios: [...anios].sort(), corte, cartNom };
  }
  const hecho = (a, m, d, k) => IDX.h.get(`${a}-${m}-${d}-${k}`);
  const tot = (a, m) => hecho(a, m, "total", "total");

  // Último mes cerrado de un año: el mes anterior al actual si es el año en curso
  function cerrado(a) {
    const c = IDX.corte[a] || 0;
    if (a < hoy.getFullYear()) return c;
    if (a === hoy.getFullYear()) return Math.min(c, hoy.getMonth());
    return c;
  }

  const KPI_DEF = {
    margen: { n: "Margen de seguridad", u: "x", meta: 3.75, ayuda: "Cotizaciones abiertas ÷ meta del mes" },
    efectividad: { n: "Efectividad de cierre", u: "%", meta: 0.32, ayuda: "Pedidos ganados ÷ cotizado" },
    pendientes: { n: "Vaciado de pendientes por surtir", u: "%", meta: 1, ayuda: "Facturado de lo disponible para surtir" },
    pendientes_monto: { n: "Pendientes disponibles por facturar", u: "$", meta: null, ayuda: "Monto disponible sin facturar" },
    cotizaciones: { n: "Cotizaciones abiertas (pipeline)", u: "$", meta: null },
    pedidos: { n: "Pedidos del mes", u: "$", meta: null },
    retencion: { n: "Retención de clientes", u: "%", meta: null, ayuda: "Clientes del trimestre anterior que volvieron a comprar" },
  };
  function kpi(a, m, k) {
    const e = G.ed.k[`${a}-${m}-${k}`] || {};
    let v = fin(e.v) ? e.v : IDX.kp.get(`${a}-${m}-${k}`);
    if (k === "retencion" && !fin(e.v)) { const c = clientesDe(a, m); v = c && c.datos.retencion ? c.datos.retencion.pct_cli : null; }
    let meta = fin(e.meta) ? e.meta : (BASE.metasKpi && fin(BASE.metasKpi[k]) ? BASE.metasKpi[k] : KPI_DEF[k] && KPI_DEF[k].meta);
    if (k === "cotizaciones" && !fin(e.meta)) { const t = tableroDe(a, m); meta = t && t.a === a && t.m === m ? t.datos.cotizaciones_meta : meta; }
    if (k === "pedidos" && !fin(e.meta)) { const t = tableroDe(a, m); meta = t && t.a === a && t.m === m ? t.datos.pedidos_meta : meta; }
    return { v: fin(v) ? v : null, meta: fin(meta) ? meta : null, ed: fin(e.v) || fin(e.meta) };
  }
  // Datos con fecha (tablero, clientes…): el más reciente que no pase del mes indicado
  function snapshot(campo, a, m) {
    const obj = BASE[campo] || {};
    const claves = Object.keys(obj).sort();
    let mejor = null;
    for (const k of claves) { const [ka, km] = k.split("-").map(Number); if (ka * 12 + km <= a * 12 + m) mejor = k; }
    if (!mejor && claves.length) mejor = claves[0];
    if (!mejor) return null;
    const [ka, km] = mejor.split("-").map(Number);
    return { clave: mejor, a: ka, m: km, datos: obj[mejor] };
  }
  const tableroDe = (a, m) => snapshot("tablero", a, m);
  function clientesDe(a, m) {
    const s = snapshot("clientes", a, m); if (!s) return null;
    const ed = G.ed.c[s.clave] || {};
    const d = JSON.parse(JSON.stringify(s.datos));
    for (const [ruta, v] of Object.entries(ed)) { const [x, y] = ruta.split("."); if (y) { d[x] = d[x] || {}; d[x][y] = v; } else d[x] = v; }
    return { ...s, datos: d, editado: Object.keys(ed).length > 0 };
  }

  /* --------------------------------------------------------------- periodo */
  const P = { tipo: "mes", anio: null, mes: null, trim: 3, sem: 2, desde: "", hasta: "" };
  const UI = { tab: "junta", modoEdicion: false, filtros: {}, vistas: {}, abierto: null, busq: {}, orden: {} };

  function periodoMeses() {
    const a = P.anio, cap = Math.max(cerrado(a), 1);
    let L = [];
    if (P.tipo === "mes") L = [[a, P.mes]];
    else if (P.tipo === "trim") for (let i = 1; i <= 3; i++) L.push([a, (P.trim - 1) * 3 + i]);
    else if (P.tipo === "sem") for (let i = 1; i <= 6; i++) L.push([a, (P.sem - 1) * 6 + i]);
    else if (P.tipo === "anio") for (let i = 1; i <= 12; i++) L.push([a, i]);
    else if (P.tipo === "rango") {
      const d = new Date(P.desde + "T12:00:00"), h = new Date(P.hasta + "T12:00:00");
      if (!isNaN(d) && !isNaN(h) && d <= h) {
        let y = d.getFullYear(), m = d.getMonth() + 1;
        while (y * 12 + m <= h.getFullYear() * 12 + h.getMonth() + 1 && L.length < 60) { L.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
      }
    }
    if (P.tipo !== "mes" && P.tipo !== "rango") { const rec = L.filter(([y, m]) => m <= cap); if (rec.length) L = rec; }
    return L.length ? L : [[a, P.mes || 1]];
  }
  function etiquetaPeriodo(L) {
    if (L.length === 1) return `${MESES[L[0][1] - 1]} ${L[0][0]}`;
    const [a1, m1] = L[0], [a2, m2] = L[L.length - 1];
    const base = a1 === a2 ? `${MC[m1 - 1]}–${MC[m2 - 1]} ${a2}` : `${MC[m1 - 1]} ${a1} – ${MC[m2 - 1]} ${a2}`;
    const pref = { trim: `T${P.trim} · `, sem: `S${P.sem} · `, anio: `Año · `, rango: "" }[P.tipo] || "";
    return pref + base;
  }

  /* ------------------------------------------------------------ agregados */
  function sumaDim(dim, L) {
    const out = new Map();
    for (const [a, m] of L) for (const r of IDX.h.values()) {
      if (r.a !== a || r.m !== m || r.d !== dim) continue;
      const x = out.get(r.k) || { k: r.k, n: r.n, meta: 0, log: 0, o: r.o, ag: r.ag, ed: false };
      x.meta += r.meta; x.log += r.log; x.n = r.n; x.ed = x.ed || r.edM || r.edL;
      out.set(r.k, x);
    }
    return out;
  }
  function totalDe(L) {
    let meta = 0, log = 0, hay = false;
    for (const [a, m] of L) { const t = tot(a, m); if (t) { meta += t.meta; log += t.log; hay = true; } }
    return hay ? { meta, log } : null;
  }
  const anteriorDe = (L) => L.map(([a, m]) => [a - 1, m]);
  const acumDe = (a, m) => Array.from({ length: m }, (_, i) => [a, i + 1]);
  const metaAnual = (a) => { let s = 0; for (let m = 1; m <= 12; m++) { const t = tot(a, m); if (t) s += t.meta; } return s; };
  // Tabla por dimensión con comparativo contra el año anterior
  function tablaDim(dim, L) {
    const act = sumaDim(dim, L), ant = sumaDim(dim, anteriorDe(L));
    const sinAg = [...act.values()].filter((x) => !x.ag);
    const totLog = sinAg.reduce((s, x) => s + x.log, 0);
    return [...act.values()].map((x) => {
      const p = ant.get(x.k);
      const prev = p ? p.log : null;
      return { ...x, cumpl: div(x.log, x.meta), desv: x.log - x.meta, part: div(x.log, totLog), prev, crec: prev ? x.log / prev - 1 : null, dif: prev !== null ? x.log - prev : null };
    });
  }

  /* --------------------------------------------------------- selector múltiple */
  function opcionesSel(id) { return UI.filtros[id]; }
  function pasa(id, v) { const f = UI.filtros[id]; return !f || f.includes(v); }
  function ms(id, opciones, etiqueta, der) {
    const f = UI.filtros[id];
    const sel = f ? opciones.filter((o) => f.includes(o.v)) : opciones;
    const txt = !f || sel.length === opciones.length ? `${etiqueta}: todos (${opciones.length})` : sel.length === 0 ? `${etiqueta}: ninguno` : sel.length <= 2 ? `${etiqueta}: ${sel.map((o) => o.t).join(", ")}` : `${etiqueta}: ${sel.length} de ${opciones.length}`;
    const q = (UI.busq[id] || "").toLowerCase();
    const abierto = UI.abierto === id;
    return `<div class="ms" data-ms="${id}"><button type="button" aria-expanded="${abierto}" data-ms-btn="${id}"><span>${esc(txt)}</span></button>${abierto ? `<div class="ms-panel ${der ? "der" : ""}" role="dialog" aria-label="${esc(etiqueta)}">
      <input type="search" placeholder="Buscar…" value="${esc(UI.busq[id] || "")}" data-ms-q="${id}" id="msq-${id}">
      <div class="ms-acc"><button class="btn chico" data-ms-todos="${id}" type="button">Todos</button><button class="btn chico" data-ms-ninguno="${id}" type="button">Ninguno</button><button class="btn chico" data-ms-cerrar type="button" style="margin-left:auto">Listo</button></div>
      <div class="ms-lista">${opciones.filter((o) => !q || o.t.toLowerCase().includes(q)).map((o) => `<label><input type="checkbox" data-ms-opt="${id}" value="${esc(o.v)}" ${!f || f.includes(o.v) ? "checked" : ""}> ${esc(o.t)}</label>`).join("")}</div>
      </div>` : ""}</div>`;
  }
  UI.msOpciones = {};
  function registrarMs(id, opciones) { UI.msOpciones[id] = opciones.map((o) => o.v); }
  const seg = (id, valores, actual) => `<div class="seg-claro" role="group">${valores.map(([v, t]) => `<button type="button" data-vista="${id}" data-v="${v}" aria-pressed="${actual === v}">${t}</button>`).join("")}</div>`;
  const vista = (id, def) => UI.vistas[id] || def;

  /* --------------------------------------------------------------- gráficas */
  const CH = new Map(); let PEND = [];
  function chart(id, cfg) { PEND.push(() => { const el = document.getElementById(id); if (!el || !window.Chart) return; if (CH.has(id)) CH.get(id).destroy(); agregarTendencias(cfg); CH.set(id, new Chart(el, cfg)); }); }
  function colores() {
    return { s1: css("--s1"), s2: css("--s2"), s3: css("--s3"), s4: css("--s4"), s5: css("--s5"), s6: css("--s6"), meta: css("--meta"), ok: css("--ok"), warn: css("--warn"), bad: css("--bad"), ink: css("--ink"), ink2: css("--ink2"), muted: css("--muted"), grid: css("--grid"), panel: css("--panel"), signal: css("--signal") };
  }
  function alfa(hex, a) {
    const h = hex.replace("#", ""); if (h.length !== 6) return hex;
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }
  function baseChart() {
    if (!window.Chart) return;
    const C = colores();
    Chart.defaults.font.family = css("--f-body") || "system-ui";
    Chart.defaults.font.size = UI.foco ? Math.max(12, Math.min(20, Math.round(window.innerWidth / 100))) : 12;
    Chart.defaults.color = C.ink2;
    Chart.defaults.borderColor = C.grid;
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.tooltip.backgroundColor = C.ink;
    Chart.defaults.plugins.tooltip.titleColor = C.panel;
    Chart.defaults.plugins.tooltip.bodyColor = C.panel;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.elements.bar.borderRadius = 3;
    Chart.defaults.elements.line.borderWidth = 2;
    Chart.defaults.elements.point.radius = 3;
    Chart.defaults.interaction = { mode: "index", intersect: false };
  }
  const etqM = (v) => { const a = Math.abs(v), sg = v < 0 ? "−$" : "$"; if (a === 0) return "$0"; if (a < 1e6) return sg + Math.round(a / 1e3) + " k"; return sg + (a / 1e6).toFixed(a < 1e7 && a % 1e6 !== 0 ? 1 : 0) + " M"; };
  const ejeM = (extra = {}) => ({ ticks: { callback: etqM }, grid: { color: css("--grid") }, ...extra });
  const ejeP = (extra = {}) => ({ ticks: { callback: (v) => Math.round(v * 100) + "%" }, grid: { color: css("--grid") }, ...extra });
  const tipM = (ctx) => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y ?? ctx.parsed.x)}`;

  /* ------------------------------------------------------------- edición */
  const editable = () => UI.modoEdicion && periodoMeses().length === 1;
  function celdaNum(tipo, clave, campo, valor, editado, extra = "") {
    if (!UI.modoEdicion) return `<td class="n${editado ? " editado" : ""}">${fmt$(valor)}</td>`;
    if (tipo === "h" && !editable()) return `<td class="n${editado ? " editado" : ""}" title="Para modificar cifras elige un solo mes">${fmt$(valor)}</td>`;
    return `<td class="n${editado ? " editado" : ""}"><input class="ed ${extra}" inputmode="decimal" data-ed="${tipo}" data-clave="${esc(clave)}" data-campo="${campo}" value="${fin(valor) ? Math.round(valor * 100) / 100 : ""}" aria-label="${campo}">${editado ? `<button class="restaurar" title="Volver al valor del reporte" data-rest="${tipo}" data-clave="${esc(clave)}" data-campo="${campo}" type="button">↺</button>` : ""}</td>`;
  }
  function aplicarEdicion(tipo, clave, campo, valorTxt) {
    const v = valorTxt === "" ? null : Number(String(valorTxt).replace(/[$,\s]/g, "").replace("%", ""));
    if (valorTxt !== "" && !fin(v)) { toast("Escribe solo números."); return; }
    const bolsa = G.ed[tipo];
    const e = bolsa[clave] || {};
    if (v === null) delete e[campo]; else e[campo] = v;
    if (Object.keys(e).length) bolsa[clave] = e; else delete bolsa[clave];
    guardar(); indexar(); render(); toast("Valor actualizado");
  }

  /* ===================================================================== */
  /*                         PARTE 1 · JUNTA MENSUAL                        */
  /* ===================================================================== */
  const BLOQUES = [
    ["seguimiento", "00", "Seguimiento", "¿Cumplimos lo acordado?"],
    ["marcador", "01", "Marcador", "¿Dónde estamos?"],
    ["tendencia", "02", "Tendencia", "¿Mejoramos o empeoramos?"],
    ["contribucion", "03", "Contribución", "¿Quién explica el resultado?"],
    ["diagnostico", "04", "Diagnóstico", "¿Por qué ocurrió?"],
    ["salud", "05", "Salud", "¿Estamos fortaleciendo el negocio?"],
    ["portafolio", "06", "Portafolio", "¿Dónde crecemos o perdemos?"],
    ["pronostico", "07", "Pronóstico", "¿Qué viene?"],
    ["accion", "08", "Acción", "¿Qué vamos a hacer?"],
    ["otros", "09", "Otros", "Facturas que afectaron el cierre"],
  ];
  function bloque(id, cuerpo, acciones = "") {
    const b = BLOQUES.find((x) => x[0] === id);
    const J = ctx().clave;
    const nota = (junta(J).notas || {})[id] || "";
    return `<section class="bloque" id="b-${id}"><header><span class="bloque-num">${b[1]}</span><h2>${b[2]}</h2><span class="pregunta">${b[3]}</span><div class="acciones-h">${acciones}${botonAmpliar(id)}</div></header>
      <div class="bloque-cuerpo">${cuerpo}
      <details ${nota ? "open" : ""}><summary class="campo-label" style="cursor:pointer">Notas de la junta · ${b[2]}</summary><textarea class="notas" data-nota="${id}" id="nota-${id}" placeholder="Lo que se comentó, acuerdos o aclaraciones de este bloque">${esc(nota)}</textarea></details>
      </div></section>`;
  }

  // Contexto del periodo seleccionado
  let CTX = null;
  function ctx() {
    if (CTX) return CTX;
    const L = periodoMeses();
    const [Ja, Jm] = L[L.length - 1];
    const per = totalDe(L) || { meta: 0, log: 0 };
    const perAnt = totalDe(anteriorDe(L));
    const acum = totalDe(acumDe(Ja, Jm)) || { meta: 0, log: 0 };
    const acumAnt = totalDe(acumDe(Ja - 1, Jm));
    const acumPrev = Jm > 1 ? totalDe(acumDe(Ja, Jm - 1)) : { meta: 0, log: 0 };
    const mAnual = metaAnual(Ja);
    CTX = { L, Ja, Jm, clave: `${Ja}-${pad(Jm)}`, etiqueta: etiquetaPeriodo(L), per, perAnt, acum, acumAnt, acumPrev, mAnual, unMes: L.length === 1 };
    return CTX;
  }

  /* ----------------------------------------------------- 00 Seguimiento */
  function bSeguimiento() {
    const c = ctx();
    const previos = G.compromisos.filter((x) => x.junta < c.clave);
    const ultimaJunta = previos.map((x) => x.junta).sort().pop();
    const lista = previos.filter((x) => x.junta === ultimaJunta || ["pendiente", "en_proceso", "reprogramado"].includes(x.estado));
    let cuerpo;
    if (!lista.length) cuerpo = `<div class="vacio">No hay compromisos de juntas anteriores a ${esc(c.etiqueta)}. Los que registres en el bloque <b>08 · Acción</b> aparecerán aquí en la siguiente junta para revisar qué pasó con ellos.</div>`;
    else {
      const cumpl = lista.filter((x) => x.estado === "cumplido").length;
      cuerpo = `<div class="grupos-sem">
        <div class="grupo-sem ok"><strong>${cumpl}</strong><span>cumplidos</span></div>
        <div class="grupo-sem warn"><strong>${lista.filter((x) => ["pendiente", "en_proceso", "reprogramado"].includes(x.estado)).length}</strong><span>abiertos</span></div>
        <div class="grupo-sem bad"><strong>${lista.filter((x) => x.estado === "no_cumplido").length}</strong><span>no cumplidos</span></div></div>
        ${tablaCompromisos(lista, true)}`;
    }
    return bloque("seguimiento", cuerpo);
  }

  /* ---------------------------------------------------------- 01 Marcador */
  function diagnosticoAuto() {
    const c = ctx();
    const defJ = c.acum.log - c.acum.meta, defP = (c.acumPrev ? c.acumPrev.log - c.acumPrev.meta : 0);
    const delta = defJ - defP;
    const umbral = (tot(c.Ja, c.Jm) || { meta: 0 }).meta * 0.02;
    let estado, txt, cl;
    if (defJ >= 0 && defP >= 0) { estado = delta >= 0 ? "ampliamos el superávit" : "redujimos el superávit"; cl = delta >= 0 ? "ok" : "warn"; }
    else if (delta > umbral) { estado = "recuperamos"; cl = "ok"; }
    else if (delta < -umbral) { estado = "ampliamos el déficit"; cl = "bad"; }
    else { estado = "mantuvimos"; cl = "warn"; }
    txt = `Diagnóstico del mes: ${estado}`;
    return { defJ, defP, delta, estado, txt, cl };
  }
  function bMarcador() {
    const c = ctx(), d = diagnosticoAuto();
    const cumP = div(c.per.log, c.per.meta), cumA = div(c.acum.log, c.acum.meta);
    const avanceAnual = div(c.acum.log, c.mAnual);
    const restantes = 12 - c.Jm, falta = c.mAnual - c.acum.log;
    const necesario = restantes > 0 ? falta / restantes : null;
    const promedio = c.acum.log / c.Jm;
    const crecP = c.perAnt && c.perAnt.log ? c.per.log / c.perAnt.log - 1 : null;
    const crecA = c.acumAnt && c.acumAnt.log ? c.acum.log / c.acumAnt.log - 1 : null;
    const J = junta(c.clave);
    const dial = (lab, val, det, cl, barra) => `<div class="dial ${cl || ""}"><label>${lab}</label><div class="valor">${val}</div><div class="det">${det}</div>${barra != null ? `<div class="barra-avance" style="color:var(--${cl === "ok" ? "ok" : cl === "warn" ? "warn" : "bad"})"><i style="width:${Math.min(100, Math.max(0, barra * 100))}%"></i></div>` : ""}</div>`;
    // Revisión de consistencia: suma de carteras vs total
    let aviso = "";
    if (c.unMes) {
      const sc = [...sumaDim("cartera", c.L).values()].reduce((s, x) => s + x.log, 0);
      if (Math.abs(sc - c.per.log) > 1) aviso = `<div class="aviso">La suma de las carteras (${fmt$(sc)}) no coincide con la venta total del mes (${fmt$(c.per.log)}). ${UI.modoEdicion ? `<button class="btn chico" data-igualar="${c.Ja}-${c.Jm}" type="button">Igualar el total a la suma de carteras</button>` : "Activa <b>Modificar cifras</b> para corregirlo."}</div>`;
    }
    const enCurso = c.L.some(([a, m]) => m > cerrado(a) && a >= hoy.getFullYear());
    const AF = c.unMes ? afectaciones(c.Ja, c.Jm) : null;
    if (AF && (AF.salieron.length || Math.abs(AF.odooHoy - c.per.log) > 1)) aviso += `<div class="aviso info">${AF.salieron.length ? `${AF.salieron.length} facturas emitidas en ${MESES[c.Jm - 1]} por ${fmtM(AF.suma(AF.salieron))} se re-fecharon a otro mes. ` : ""}${Math.abs(AF.odooHoy - c.per.log) > 1 ? `Odoo registra hoy ${fmtM(AF.odooHoy)} para el mes (${fmtS(AF.odooHoy - c.per.log)} contra lo reportado). ` : ""}Detalle en el bloque 09.</div>`;
    const guion = `<b>${esc(c.etiqueta)}</b> cerró en <b>${fmtM(c.per.log)}</b> contra una meta de <b>${fmtM(c.per.meta)}</b>, equivalente a <b>${fmtP(cumP)}</b>. Acumulamos <b>${fmtM(c.acum.log)}</b> contra <b>${fmtM(c.acum.meta)}</b>, con ${c.acum.log - c.acum.meta < 0 ? "un déficit" : "un superávit"} de <b>${fmtM(Math.abs(c.acum.log - c.acum.meta))}</b>. Respecto al mes anterior ${d.delta >= 0 ? "recuperamos" : "ampliamos la brecha en"} <b>${fmtM(Math.abs(d.delta))}</b>${restantes > 0 ? ` y para alcanzar la meta anual de <b>${fmtM(c.mAnual, 1)}</b> necesitamos vender <b>${fmtM(necesario)}</b> por mes en los ${restantes} meses restantes (${fmtP(div(necesario, promedio))} del promedio mensual actual)` : ""}.`;
    const tablaRes = `<div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>Resultado</th><th class="n">${esc(c.etiqueta)}</th><th class="n">Acumulado a ${MC[c.Jm - 1]} ${c.Ja}</th></tr></thead><tbody>
      <tr><td>Venta</td>${c.unMes ? celdaNum("h", `${c.Ja}-${c.Jm}-total-total`, "log", c.per.log, tot(c.Ja, c.Jm)?.edL) : `<td class="n">${fmt$(c.per.log)}</td>`}<td class="n">${fmt$(c.acum.log)}</td></tr>
      <tr><td>Meta</td>${c.unMes ? celdaNum("h", `${c.Ja}-${c.Jm}-total-total`, "meta", c.per.meta, tot(c.Ja, c.Jm)?.edM) : `<td class="n">${fmt$(c.per.meta)}</td>`}<td class="n">${fmt$(c.acum.meta)}</td></tr>
      <tr><td>Cumplimiento</td><td class="n">${sem(cumP)}</td><td class="n">${sem(cumA)}</td></tr>
      <tr><td>Brecha contra meta</td><td class="n ${c.per.log - c.per.meta < 0 ? "neg" : "pos"}">${fmt$(c.per.log - c.per.meta)}</td><td class="n ${c.acum.log - c.acum.meta < 0 ? "neg" : "pos"}">${fmt$(c.acum.log - c.acum.meta)}</td></tr>
      <tr><td>Venta ${c.Ja - 1} (mismo periodo)</td><td class="n">${fmt$(c.perAnt?.log)}</td><td class="n">${fmt$(c.acumAnt?.log)}</td></tr>
      <tr><td>Crecimiento vs ${c.Ja - 1}</td><td class="n ${crecP < 0 ? "neg" : "pos"}">${fmtPs(crecP, 1)}</td><td class="n ${crecA < 0 ? "neg" : "pos"}">${fmtPs(crecA, 1)}</td></tr>
      </tbody></table></div>`;
    const cuerpo = `${enCurso ? `<div class="aviso">El periodo incluye un mes que todavía no cierra; sus cifras son parciales.</div>` : ""}${aviso}
      <div class="marcador">
        ${dial(c.unMes ? "Venta del mes" : "Venta del periodo", fmtM(c.per.log), `Meta ${fmtM(c.per.meta)}`)}
        ${dial("Cumplimiento", fmtP(cumP), `${fmtS(c.per.log - c.per.meta)} vs meta`, semClase(cumP), cumP)}
        ${dial(`Venta acumulada ${c.Ja}`, fmtM(c.acum.log), `Meta a ${MC[c.Jm - 1]} ${fmtM(c.acum.meta)}`)}
        ${dial("Cumplimiento acumulado", fmtP(cumA), `${fmtP(avanceAnual)} de la meta anual`, semClase(cumA), cumA)}
        ${dial(c.acum.log - c.acum.meta < 0 ? "Déficit anual acumulado" : "Superávit anual acumulado", fmtM(c.acum.log - c.acum.meta), `${fmtS(d.delta)} vs mes anterior`, c.acum.log - c.acum.meta < 0 ? "bad" : "ok")}
      </div>
      <div class="diag-frase"><span class="lampara" style="background:var(--${d.cl})"></span><strong>${esc(d.txt)}</strong>
        <span style="color:var(--ink2);font-size:13px">El déficit acumulado pasó de ${fmtM(d.defP)} a ${fmtM(d.defJ)}.</span></div>
      <div class="grid-6-4">
        <div><div class="sub">Guion para abrir la junta <span class="der"><button class="btn chico" data-copiar="guion" type="button">Copiar texto</button></span></div><p class="guion" id="guion">${guion}</p>
          <label class="campo-label" for="diag-txt">Diagnóstico en una frase</label>
          <textarea class="campo" id="diag-txt" data-junta-campo="diagnostico" placeholder="${esc(d.txt)}. Ej.: seguimos ${fmtP(1 - (cumA || 0))} debajo del objetivo; en el mes ${d.estado} ${fmtM(Math.abs(d.delta))}.">${esc(J.diagnostico || "")}</textarea></div>
        <div>${tablaRes}
          <p class="nota-pie">Meta anual ${c.Ja}: ${fmt$(c.mAnual)} · Falta ${fmt$(falta)} · ${restantes} meses por delante · Promedio mensual actual ${fmtM(promedio)}.</p></div>
      </div>`;
    return bloque("marcador", cuerpo);
  }

  /* ---------------------------------------------------------- 02 Tendencia */
  function bTendencia() {
    const c = ctx(), C = colores();
    const a = c.Ja, enPer = new Set(c.L.filter((x) => x[0] === a).map((x) => x[1]));
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);
    const limT = Math.max(cerrado(a), c.Jm);
    const venta = meses.map((m) => (m <= limT ? tot(a, m)?.log ?? null : null));
    const meta = meses.map((m) => tot(a, m)?.meta ?? null);
    const prev = meses.map((m) => tot(a - 1, m)?.log ?? IDX.hist.get(`${a - 1}-${m}`) ?? null);
    const series = [
      { v: "venta", t: `Venta ${a}` }, { v: "meta", t: `Meta ${a}` }, { v: "prev", t: `Venta ${a - 1}` },
    ];
    registrarMs("tend-series", series);
    const ds = [];
    if (pasa("tend-series", "venta")) ds.push({ type: "bar", label: `Venta ${a}`, tend: "M", tendColor: C.s1, borderColor: C.s1, data: venta, backgroundColor: meses.map((m) => (enPer.has(m) ? C.s1 : alfa(C.s1, 0.45))), order: 2 });
    if (pasa("tend-series", "meta")) ds.push({ type: "line", label: `Meta ${a}`, data: meta, borderColor: C.meta, backgroundColor: C.meta, borderDash: [5, 4], pointRadius: 0, order: 1 });
    if (pasa("tend-series", "prev")) ds.push({ type: "line", label: `Venta ${a - 1}`, tend: "M", data: prev, borderColor: C.s2, backgroundColor: C.s2, pointRadius: 3, order: 0 });
    chart("g-tend", { data: { labels: MC, datasets: ds }, options: { scales: { y: ejeM({ beginAtZero: true }), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: tipM, afterBody: (it) => { const m = it[0].dataIndex; const r = div(venta[m], meta[m]); return fin(r) ? `Cumplimiento: ${fmtP(r)}` : ""; } } } } } });

    // Déficit acumulado por año
    const aniosMeta = IDX.anios.filter((y) => metaAnual(y) > 0);
    const opA = aniosMeta.map((y) => ({ v: String(y), t: String(y) }));
    registrarMs("tend-anios", opA);
    const paleta = [C.s1, C.s2, C.s3, C.s4];
    const dsD = aniosMeta.filter((y) => (UI.filtros["tend-anios"] ? pasa("tend-anios", String(y)) : y >= a - 1 && y <= a)).map((y, i) => {
      let acM = 0, acL = 0;
      const lim = Math.max(cerrado(y), y === a ? c.Jm : 0);
      return { label: `Déficit ${y}`, data: meses.map((m) => { const t = tot(y, m); if (!t || m > lim) return null; acM += t.meta; acL += t.log; return acL - acM; }), borderColor: y === a ? C.s1 : paleta[(i + 1) % 4], backgroundColor: y === a ? alfa(C.s1, 0.12) : "transparent", fill: y === a ? "origin" : false, tend: y === a ? "M" : false };
    });
    chart("g-def", { type: "line", data: { labels: MC, datasets: dsD }, options: { scales: { y: ejeM(), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: tipM } } } } });
    // Brecha de cada mes
    const brecha = meses.map((m) => (venta[m - 1] !== null && meta[m - 1] !== null ? venta[m - 1] - meta[m - 1] : null));
    chart("g-brecha", { type: "bar", data: { labels: MC, datasets: [{ label: "Brecha del mes", tend: "M", borderColor: C.ink2, data: brecha, backgroundColor: brecha.map((v) => (v >= 0 ? C.ok : C.bad)) }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${x.parsed.y >= 0 ? "Recupera" : "Amplía"} ${fmt$(Math.abs(x.parsed.y))}` } } }, scales: { y: ejeM(), x: { grid: { display: false } } } } });

    // Velocidad semanal
    const fin_ = new Date(c.L[c.L.length - 1][0], c.L[c.L.length - 1][1], 0);
    const ini_ = new Date(c.L[0][0], c.L[0][1] - 1, 1);
    const sem_ = (BASE.semanal || []).filter((w) => w.a === a).map((w) => {
      const e = G.ed.s[`${w.a}-${w.s}`] || {};
      return { ...w, venta_acum: fin(e.venta_acum) ? e.venta_acum : w.venta_acum, meta_acum: fin(e.meta_acum) ? e.meta_acum : w.meta_acum };
    }).filter((w) => w.venta_acum !== null && new Date(w.fecha + "T12:00:00") <= fin_);
    let html2 = "";
    if (sem_.length > 1) {
      const deltas = sem_.map((w, i) => ({ s: w.s, f: w.fecha, def: w.venta_acum - w.meta_acum, d: i ? (w.venta_acum - w.meta_acum) - (sem_[i - 1].venta_acum - sem_[i - 1].meta_acum) : 0 }));
      const enRango = (x) => new Date(x.f + "T12:00:00") >= ini_;
      const rec = deltas.slice(1).filter((x) => x.d > 0).length, amp = deltas.slice(1).filter((x) => x.d < 0).length;
      const ult3 = deltas.slice(-3).reduce((s, x) => s + x.d, 0);
      const perW = deltas.filter(enRango);
      const vel = perW.length ? perW.reduce((s, x) => s + x.d, 0) / perW.length : null;
      const ultimo = deltas[deltas.length - 1];
      const semRest = Math.max(1, 52 - ultimo.s);
      const defAnual = (sem_[sem_.length - 1].venta_acum) - c.mAnual;
      chart("g-vel", { type: "bar", data: { labels: deltas.map((x) => "S" + x.s), datasets: [{ label: "Cambio del déficit", tend: "M", tendPaso: "sem", borderColor: C.ink2, data: deltas.map((x) => x.d), backgroundColor: deltas.map((x) => alfa(x.d >= 0 ? C.ok : C.bad, enRango(x) ? 1 : 0.4)) }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => `Semana ${deltas[it[0].dataIndex].s} · ${deltas[it[0].dataIndex].f}`, label: (x) => `${x.parsed.y >= 0 ? "Recupera" : "Amplía"} ${fmt$(Math.abs(x.parsed.y))}`, afterLabel: (x) => `Déficit acumulado ${fmt$(deltas[x.dataIndex].def)}` } } }, scales: { y: ejeM(), x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } } } } });
      html2 = `<div><div class="sub">Velocidad de recuperación del déficit · semanal</div>
        <div class="tira">
          <div class="celda"><label>Semanas recuperando</label><div class="valor pos">${rec}</div><small>de ${rec + amp} con captura</small></div>
          <div class="celda"><label>Semanas ampliando</label><div class="valor neg">${amp}</div><small>en ${a}</small></div>
          <div class="celda"><label>Tendencia últimas 3 sem.</label><div class="valor ${ult3 >= 0 ? "pos" : "neg"}">${ult3 >= 0 ? "⬆ Recupera" : "⬇ Amplía"}</div><small>${fmtS(ult3)}</small></div>
          <div class="celda"><label>Velocidad del periodo</label><div class="valor ${vel >= 0 ? "pos" : "neg"}">${fmtS(vel)}</div><small>por semana · necesaria ${fmtS(-defAnual / semRest)}</small></div>
        </div>
        <div class="graf baja" style="margin-top:12px"><canvas id="g-vel" role="img" aria-label="Cambio semanal del déficit"></canvas></div>
        <p class="nota-pie">Verde: la semana redujo el déficit acumulado. Rojo: lo amplió. Barras tenues: semanas fuera del periodo seleccionado. Fuente: Tablero ISEL (meta semanal acumulada).</p></div>`;
    } else html2 = `<div class="aviso info">No hay avance semanal capturado para ${a}. Carga el Tablero ISEL de ese año en la pestaña Datos.</div>`;

    const cuerpo = `<div><div class="sub">Venta mensual contra meta · ${a} <span class="der">${ms("tend-series", series, "Series")}</span></div>
        <div class="graf"><canvas id="g-tend" role="img" aria-label="Venta mensual contra meta"></canvas></div>
        <p class="nota-pie">Barras sólidas: meses del periodo seleccionado.</p></div>
      <div class="grid2">
        <div><div class="sub">Déficit acumulado <span class="der">${ms("tend-anios", opA, "Años")}</span></div><div class="graf baja"><canvas id="g-def" role="img" aria-label="Déficit acumulado por mes"></canvas></div></div>
        <div><div class="sub">Brecha de cada mes (recupera / amplía)</div><div class="graf baja"><canvas id="g-brecha" role="img" aria-label="Brecha mensual"></canvas></div></div>
      </div>${html2}`;
    return bloque("tendencia", cuerpo);
  }

  /* ------------------------------------------------- tabla por dimensión */
  const DIMS = { cartera: "Cartera", equipo: "Equipo de ventas", division: "División", linea: "Línea" };
  function filasDim(dim, L, filtroId) {
    let filas = tablaDim(dim, L);
    if (dim === "cartera") filas = filas.filter((x) => x.meta !== 0 || x.log !== 0 || x.prev);
    const op = filas.sort((a, b) => a.o - b.o).map((x) => ({ v: x.k, t: (dim === "cartera" ? x.k + " " : "") + x.n }));
    registrarMs(filtroId, op);
    return { filas: filas.filter((x) => pasa(filtroId, x.k)), op };
  }
  function ordenar(id, filas, def) {
    const o = UI.orden[id] || def;
    const [campo, dir] = o.split(":");
    return filas.sort((a, b) => { const x = a[campo], y = b[campo]; if (typeof x === "string") return dir === "a" ? x.localeCompare(y) : y.localeCompare(x); return dir === "a" ? (x ?? -1e18) - (y ?? -1e18) : (y ?? -1e18) - (x ?? -1e18); });
  }
  const th = (id, campo, txt, n = true) => { const o = UI.orden[id] || ""; const act = o.startsWith(campo + ":"); return `<th class="ord ${n ? "n" : ""}" data-orden="${id}" data-campo="${campo}" aria-sort="${act ? (o.endsWith(":a") ? "ascending" : "descending") : "none"}">${txt}${act ? (o.endsWith(":a") ? " ▲" : " ▼") : ""}</th>`; };
  function tablaResultados(id, dim, filas, c) {
    const sumable = filas.filter((x) => !x.ag);
    const T = sumable.reduce((s, x) => ({ meta: s.meta + x.meta, log: s.log + x.log, prev: s.prev + (x.prev || 0) }), { meta: 0, log: 0, prev: 0 });
    const maxC = 1.5;
    return `<div class="tabla-wrap"><table class="t"><thead><tr>${th(id, "n", DIMS[dim], false)}${th(id, "meta", "Meta")}${th(id, "log", "Venta")}${th(id, "cumpl", "Cumplimiento")}${th(id, "desv", "Desviación")}${th(id, "part", "Part.")}${th(id, "prev", "Venta " + (c.Ja - 1))}${th(id, "crec", "Crec.")}</tr></thead><tbody>
      ${filas.map((x) => {
        const key = `${c.Ja}-${c.Jm}-${dim}-${x.k}`; const r = hecho(c.Ja, c.Jm, dim, x.k);
        return `<tr><td class="nombre">${dim === "cartera" ? `<span class="cod">${esc(x.k)}</span>` : ""}${esc(x.n)}${x.ag ? ' <span class="cod">(agregado)</span>' : ""}</td>
        ${celdaNum("h", key, "meta", x.meta, r && r.edM)}${celdaNum("h", key, "log", x.log, r && r.edL)}
        <td class="n">${sem(x.cumpl)}<span class="mini-barra"><i style="width:${Math.min(100, ((x.cumpl || 0) / maxC) * 100)}%;background:var(--${semClase(x.cumpl) === "na" ? "muted" : semClase(x.cumpl)})"></i><span class="tope" style="left:${100 / maxC}%"></span></span></td>
        <td class="n ${x.desv < 0 ? "neg" : "pos"}">${fmt$(x.desv)}</td><td class="n">${x.ag ? "—" : fmtP(x.part, 1)}</td><td class="n">${fmt$(x.prev)}</td><td class="n ${x.crec < 0 ? "neg" : "pos"}">${fmtPs(x.crec, 1)}</td></tr>`;
      }).join("")}</tbody>
      <tfoot><tr><td>Total seleccionado (${sumable.length})</td><td class="n">${fmt$(T.meta)}</td><td class="n">${fmt$(T.log)}</td><td class="n">${sem(div(T.log, T.meta))}</td><td class="n ${T.log - T.meta < 0 ? "neg" : "pos"}">${fmt$(T.log - T.meta)}</td><td class="n">${fmtP(div(T.log, c.per.log), 1)}</td><td class="n">${fmt$(T.prev)}</td><td class="n">${fmtPs(T.prev ? T.log / T.prev - 1 : null, 1)}</td></tr></tfoot></table></div>
      ${UI.modoEdicion && !editable() ? `<p class="nota-pie">Para modificar metas o ventas elige un solo mes en el periodo.</p>` : ""}`;
  }
  function topContrib(filas, n = 3) {
    const v = filas.filter((x) => !x.ag && (x.meta || x.log));
    let pos = [...v].filter((x) => x.desv > 0).sort((a, b) => b.desv - a.desv).slice(0, n);
    const sinPos = !pos.length;
    if (sinPos) pos = [...v].sort((a, b) => b.desv - a.desv).slice(0, n);
    const neg = [...v].filter((x) => x.desv < 0 && !(sinPos && pos.includes(x))).sort((a, b) => a.desv - b.desv).slice(0, n);
    const item = (x, i) => `<div class="contrib"><b>${i + 1}</b><span class="nm" title="${esc(x.n)}">${esc(x.n)} <span class="cod">${fmtP(x.cumpl)}</span></span><span class="v ${x.desv < 0 ? "neg" : "pos"}">${fmtS(x.desv)}</span></div>`;
    return `<div class="grid2"><div><div class="sub">${sinPos ? "A favor · nadie superó su meta; los más cercanos" : "A favor"}</div><div class="lista-contrib">${pos.map(item).join("")}</div></div><div><div class="sub">En contra</div><div class="lista-contrib">${neg.map(item).join("") || '<div class="vacio">Sin desviaciones negativas</div>'}</div></div></div>`;
  }
  function graficaDesv(id, filas) {
    const C = colores();
    const v = filas.filter((x) => !x.ag && (x.meta || x.log)).sort((a, b) => b.desv - a.desv);
    chart(id, { type: "bar", data: { labels: v.map((x) => x.n.length > 26 ? x.n.slice(0, 25) + "…" : x.n), datasets: [{ label: "Desviación contra meta", maxBarThickness: 22, data: v.map((x) => x.desv), backgroundColor: v.map((x) => (x.desv >= 0 ? C.ok : C.bad)) }] },
      options: { indexAxis: "y", interaction: { mode: "nearest", axis: "y", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => v[it[0].dataIndex].n, label: (x) => `Desviación ${fmt$(x.parsed.x)}`, afterLabel: (x) => `Venta ${fmt$(v[x.dataIndex].log)} · Meta ${fmt$(v[x.dataIndex].meta)} · ${fmtP(v[x.dataIndex].cumpl)}` } } }, scales: { x: ejeM(), y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } } } });
    return Math.max(220, v.length * 22 + 40);
  }

  /* ---------------------------------------------------------- 03 Contribución */
  function bContribucion() {
    const c = ctx();
    const dim = vista("contrib-dim", "cartera");
    const fid = "contrib-" + dim;
    const { filas, op } = filasDim(dim, c.L, fid);
    const validas = filas.filter((x) => !x.ag && x.meta > 0);
    const g = { ok: validas.filter((x) => x.cumpl >= 1).length, warn: validas.filter((x) => x.cumpl >= 0.8 && x.cumpl < 1).length, bad: validas.filter((x) => x.cumpl < 0.8).length };
    ordenar(fid, filas, "desv:d");
    const alto = graficaDesv("g-contrib", filas);
    const cuerpo = `<div class="sub" style="margin:0">${seg("contrib-dim", [["cartera", "Cartera"], ["equipo", "Equipo / sucursal"], ["division", "División"]], dim)} ${ms(fid, op, DIMS[dim])}</div>
      <div class="grupos-sem"><div class="grupo-sem ok"><strong>${g.ok}</strong><span>🟢 cumplieron o superaron</span></div><div class="grupo-sem warn"><strong>${g.warn}</strong><span>🟡 entre 80 y 99%</span></div><div class="grupo-sem bad"><strong>${g.bad}</strong><span>🔴 debajo de 80%</span></div></div>
      <div class="grid-6-4"><div>${topContrib(filas)}</div><div><div class="sub">Desviación contra meta</div><div class="graf" style="height:${Math.min(alto, 520)}px"><canvas id="g-contrib" role="img" aria-label="Desviación por ${DIMS[dim]}"></canvas></div></div></div>
      ${tablaResultados(fid, dim, filas, c)}
      <p class="nota-pie">Desviación = venta − meta del periodo. Participación sobre la venta del grupo seleccionado. ${dim === "division" ? "Automatización y Marcas clave agrupan a otras divisiones y no se suman en el total." : ""}</p>`;
    return bloque("contribucion", cuerpo);
  }

  /* ---------------------------------------------------------- 04 Diagnóstico */
  function valorKpi(k, x) { const u = (KPI_DEF[k] || {}).u; return u === "x" ? fmtX(x) : u === "%" ? fmtP(x, 1) : fmt$(x); }
  function bDiagnostico() {
    const c = ctx(), C = colores();
    const J = junta(c.clave);
    const claves = ["margen", "efectividad", "pendientes", "pendientes_monto", "cotizaciones", "pedidos", "retencion"];
    const filas = claves.map((k) => ({ k, ...KPI_DEF[k], ...kpi(c.Ja, c.Jm, k) }));
    const celdaK = (k, campo, v, u) => {
      if (!UI.modoEdicion) return `<td class="n">${u === "x" ? fmtX(v) : u === "%" ? fmtP(v, 1) : fmt$(v)}</td>`;
      const mostrar = fin(v) ? (u === "%" ? Math.round(v * 1000) / 10 : Math.round(v * 100) / 100) : "";
      return `<td class="n"><input class="ed chico" data-kpi="${k}" data-campo="${campo}" data-u="${u}" value="${mostrar}" aria-label="${esc(KPI_DEF[k].n)} ${campo}">${u === "%" ? " %" : ""}</td>`;
    };
    const tabla = `<div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>Indicador</th><th class="n">Resultado</th><th class="n">Meta</th><th class="n">Estado</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td>${esc(f.n)}${f.ed ? ' <span class="cod">editado</span>' : ""}<div class="cod" style="margin:0">${esc(f.ayuda || "")}</div></td>${celdaK(f.k, "v", f.v, f.u)}${celdaK(f.k, "meta", f.meta, f.u)}<td class="n">${fin(f.v) && fin(f.meta) ? sem(f.v / f.meta, f.v >= f.meta ? "Cumple" : fmtP(f.v / f.meta)) : '<span class="sem na">s/meta</span>'}</td></tr>`).join("")}
      ${(J.kpisExtra || []).map((x, i) => `<tr><td>${UI.modoEdicion ? `<input class="campo" data-kx="${i}" data-campo="n" value="${esc(x.n)}" placeholder="Nombre del indicador">` : esc(x.n)}</td>
        <td class="n">${UI.modoEdicion ? `<input class="ed chico" data-kx="${i}" data-campo="v" value="${esc(x.v ?? "")}">` : esc(x.v ?? "—")}</td>
        <td class="n">${UI.modoEdicion ? `<input class="ed chico" data-kx="${i}" data-campo="meta" value="${esc(x.meta ?? "")}">` : esc(x.meta ?? "—")}</td>
        <td class="n">${fin(+x.v) && fin(+x.meta) && +x.meta ? sem(+x.v / +x.meta) : '<span class="sem na">s/meta</span>'}${UI.modoEdicion ? ` <button class="restaurar" data-kx-borrar="${i}" title="Quitar indicador" type="button">✕</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn chico" data-kx-nuevo type="button">+ Agregar indicador</button><span class="nota-pie" style="margin:0">Valores al cierre de ${MESES[c.Jm - 1]} ${c.Ja}. ${UI.modoEdicion ? "Porcentajes en %, por ejemplo 32 para 32%." : "Activa Modificar cifras para cambiarlos."}</span></div>`;

    // Árbol de diagnóstico
    const cum = div(c.per.log, c.per.meta);
    const km = kpi(c.Ja, c.Jm, "margen"), ke = kpi(c.Ja, c.Jm, "efectividad"), kp = kpi(c.Ja, c.Jm, "pendientes"), kpm = kpi(c.Ja, c.Jm, "pendientes_monto");
    const ventaBaja = fin(cum) && cum < 0.9;
    const margenBajo = fin(km.v) && fin(km.meta) && km.v < km.meta;
    const efBaja = fin(ke.v) && fin(ke.meta) && ke.v < ke.meta * 0.8;
    const dispAlto = (fin(kp.v) && fin(kp.meta) && kp.v < kp.meta * 0.8) || (fin(kpm.v) && c.per.meta && kpm.v > 0.3 * (c.per.meta / c.L.length));
    const reglas = [
      { si: `Venta baja (${fmtP(cum)}) + margen de seguridad bajo (${fmtX(km.v)} vs ${fmtX(km.meta)})`, ent: "Problema de generación de oportunidades", ap: ventaBaja && margenBajo, accion: "Generar oportunidades nuevas (> $20k) para subir el margen de seguridad", ind: "Margen de seguridad" },
      { si: `Margen suficiente + efectividad baja (${fmtP(ke.v, 1)} vs ${fmtP(ke.meta)})`, ent: "Hay negocio, pero no se está convirtiendo", ap: !margenBajo && efBaja, accion: "Revisar oportunidades en Propuesta / Negociación y su plan de cierre", ind: "Efectividad de cierre" },
      { si: "Margen suficiente + efectividad razonable + venta baja", ent: "Revisar timing, pedidos, disponibilidad o facturación", ap: ventaBaja && !margenBajo && !efBaja, accion: "Revisar pedidos por fecha compromiso, disponibilidad y facturación", ind: "Venta del mes" },
      { si: `Disponibles por facturar altos (${fmtM(kpm.v)} · vaciado ${fmtP(kp.v)}) + venta baja`, ent: "Problema de vaciado de la bandeja de pendientes por surtir", ap: ventaBaja && dispAlto, accion: "Vaciado diario de pendientes disponibles", ind: "% de vaciado" },
    ];
    UI.reglas = reglas;
    const arbol = `<div class="arbol">${reglas.map((r) => `<div class="regla ${r.ap ? "aplica" : ""}"><span class="estado">${r.ap ? "● Aplica este mes" : "○ No aplica"}</span><span class="si">Si: ${esc(r.si)}</span><span class="entonces">→ ${esc(r.ent)}</span></div>`).join("")}</div>`;

    // Evolución semanal
    const opK = [{ v: "margen", t: "Margen de seguridad" }, { v: "efectividad", t: "Efectividad de cierre" }, { v: "pendientes", t: "Vaciado de pendientes" }];
    registrarMs("diag-kpis", opK);
    const finP = new Date(c.L[c.L.length - 1][0], c.L[c.L.length - 1][1], 0);
    const W = (BASE.semanal || []).filter((w) => w.a === c.Ja && w.margen !== null && new Date(w.fecha + "T12:00:00") <= finP);
    const minis = opK.filter((o) => pasa("diag-kpis", o.v)).map((o, i) => {
      const id = "g-k-" + o.v, meta = kpi(c.Ja, c.Jm, o.v).meta;
      const esX = o.v === "margen";
      chart(id, { type: "line", data: { labels: W.map((w) => "S" + w.s), datasets: [{ label: o.t, tend: esX ? "x" : "%", tendPaso: "sem", data: W.map((w) => w[o.v]), borderColor: [C.s1, C.s2, C.s3][i % 3], backgroundColor: [C.s1, C.s2, C.s3][i % 3], pointRadius: 2 }, ...(fin(meta) ? [{ label: "Meta", data: W.map(() => meta), borderColor: C.meta, borderDash: [5, 4], pointRadius: 0 }] : [])] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${esX ? fmtX(x.parsed.y) : fmtP(x.parsed.y, 1)}` } } }, scales: { y: esX ? { grid: { color: C.grid }, ticks: { callback: (v) => v + "×" } } : ejeP({ beginAtZero: true }), x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0 } } } } });
      return `<div><div class="sub" style="font-size:14px">${o.t}</div><div class="graf baja"><canvas id="${id}" role="img" aria-label="${o.t} semanal"></canvas></div></div>`;
    });
    const cuerpo = `<div class="grid-6-4"><div>${tabla}</div><div><div class="sub">Árbol de diagnóstico · resultado → indicador que lo explica</div>${arbol}<p class="nota-pie">Se evalúa con los valores de la tabla; si los modificas, el diagnóstico se recalcula.</p></div></div>
      <div><div class="sub">Evolución semanal de los indicadores ${c.Ja} <span class="der">${ms("diag-kpis", opK, "Indicadores", true)}</span></div>
      ${W.length ? `<div class="grid3">${minis.join("")}</div><p class="nota-pie">Línea punteada: meta.</p>` : `<div class="aviso info">No hay indicadores semanales para ${c.Ja}.</div>`}</div>`;
    return bloque("diagnostico", cuerpo);
  }

  /* ---------------------------------------------------------- 05 Salud */
  function bSalud() {
    const c = ctx(), C = colores();
    const cl = clientesDe(c.Ja, c.Jm);
    const tc = snapshot("canal", c.Ja, c.Jm);
    if (!cl) return bloque("salud", `<div class="aviso info">No hay datos de clientes. Carga el Tablero ISEL en la pestaña Datos.</div>`);
    const d = cl.datos;
    const cambioCli = d.trim_ant && d.trim_ult ? d.trim_ult.clientes - d.trim_ant.clientes : null;
    const per = d.periodo || {};
    const fmtF = (s) => s ? `${+s.slice(8, 10)} ${MC[+s.slice(5, 7) - 1]}` : "";
    const edC = (ruta, v, tipo = "n") => UI.modoEdicion ? `<input class="ed chico" data-cli="${cl.clave}" data-ruta="${ruta}" data-tipo="${tipo}" value="${fin(v) ? (tipo === "p" ? Math.round(v * 1000) / 10 : Math.round(v)) : ""}">` : (tipo === "p" ? fmtP(v) : tipo === "$" ? fmt$(v) : (fin(v) ? v.toLocaleString("es-MX") : "—"));
    const tira = `<div class="tira">
      <div class="celda"><label>Clientes activos (trim.)</label><div class="valor">${fin(d.trim_ult?.clientes) ? d.trim_ult.clientes : "—"}</div><small>${fin(cambioCli) ? (cambioCli >= 0 ? "+" : "−") + Math.abs(cambioCli) : "—"} vs trimestre anterior (${d.trim_ant?.clientes ?? "—"})</small></div>
      <div class="celda"><label>Retención</label><div class="valor ${semClase(div(d.retencion?.pct_cli, 0.65)) === "ok" ? "pos" : ""}">${fmtP(d.retencion?.pct_cli)}</div><small>de clientes · ${fmtP(d.retencion?.pct_monto)} del monto</small></div>
      <div class="celda"><label>Pérdida</label><div class="valor neg">${d.perdida?.clientes ?? "—"}</div><small>clientes · ${fmtP(d.perdida?.pct_monto)} del monto</small></div>
      <div class="celda"><label>Ganancia</label><div class="valor pos">${d.ganancia?.clientes ?? "—"}</div><small>clientes nuevos o recuperados</small></div></div>`;
    const mov = [["Venta perdida", d.venta_perdida], ["Venta disminuida", d.venta_disminuida], ["Venta aumentada", d.venta_aumentada], ["Venta nueva", d.venta_nueva]];
    const neto = mov.reduce((s, x) => s + (x[1] || 0), 0);
    chart("g-mov", { type: "bar", data: { labels: mov.map((x) => x[0]).concat("Crecimiento neto"), datasets: [{ label: "Monto", data: mov.map((x) => x[1]).concat(neto), backgroundColor: mov.map((x) => ((x[1] || 0) >= 0 ? C.ok : C.bad)).concat(neto >= 0 ? C.s1 : C.s2) }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => fmt$(x.parsed.y) } } }, scales: { y: ejeM(), x: { grid: { display: false } } } } });
    const men = d.mensual || [];
    chart("g-mezcla", { type: "bar", data: { labels: men.map((x) => MC[x.m - 1]), datasets: [{ label: "Venta de clientes retenidos", data: men.map((x) => x.ir_monto), backgroundColor: C.s1, tend: "%", borderColor: C.ink }, { label: "Venta de clientes ganados", data: men.map((x) => x.ig_monto), backgroundColor: C.s3 }] }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: ejeP({ stacked: true, max: 1 }) }, plugins: { tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmtP(x.parsed.y)}`, footer: (it) => `Clientes activos: ${men[it[0].dataIndex].clientes}` } } } } });
    let canal = "";
    if (tc) {
      const t = tc.datos, total = (t.usuario || 0) + (t.reventa || 0);
      chart("g-canal", { type: "bar", data: { labels: ["Usuario", "Reventa"], datasets: [{ label: "Mezcla real", data: [div(t.usuario, total), div(t.reventa, total)], backgroundColor: C.s1 }, { label: "Mezcla objetivo", data: [t.usuario_meta, t.reventa_meta], backgroundColor: C.meta }] }, options: { indexAxis: "y", scales: { x: ejeP({ beginAtZero: true, max: 1 }), y: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmtP(x.parsed.x)}`, afterBody: (it) => it[0].dataIndex === 0 ? `Usuario ${fmt$(t.usuario)}` : `Reventa ${fmt$(t.reventa)}` } } } } });
      canal = `<div><div class="sub">Mezcla usuario / reventa · acumulado</div><div class="graf baja"><canvas id="g-canal" role="img" aria-label="Mezcla usuario y reventa"></canvas></div><p class="nota-pie">Usuario ${fmt$(t.usuario)} · Reventa ${fmt$(t.reventa)}.</p></div>`;
    }
    const tablaEd = UI.modoEdicion ? `<details open><summary class="campo-label" style="cursor:pointer">Modificar indicadores de clientes</summary><div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>Concepto</th><th class="n">Clientes</th><th class="n">Monto</th><th class="n">% clientes</th><th class="n">% monto</th></tr></thead><tbody>
      ${[["trim_ant", "Trimestre anterior"], ["trim_ult", "Último trimestre"], ["perdida", "Pérdida"], ["retencion", "Retención"], ["ganancia", "Ganancia"]].map(([k, t]) => `<tr><td>${t}</td><td class="n">${edC(k + ".clientes", d[k]?.clientes)}</td><td class="n">${edC(k + ".monto", d[k]?.monto, "$")}</td><td class="n">${k.startsWith("trim") ? "" : edC(k + ".pct_cli", d[k]?.pct_cli, "p")}</td><td class="n">${k.startsWith("trim") ? "" : edC(k + ".pct_monto", d[k]?.pct_monto, "p")}</td></tr>`).join("")}
      ${[["venta_perdida", "Venta perdida"], ["venta_disminuida", "Venta disminuida"], ["venta_aumentada", "Venta aumentada"], ["venta_nueva", "Venta nueva"]].map(([k, t]) => `<tr><td>${t}</td><td></td><td class="n">${edC(k, d[k], "$")}</td><td></td><td></td></tr>`).join("")}
      </tbody></table></div></details>` : "";
    const cuerpo = `<p class="nota-pie" style="margin:0">Trimestre ${fmtF(per.ult?.[0])}–${fmtF(per.ult?.[1])} contra ${fmtF(per.ant?.[0])}–${fmtF(per.ant?.[1])} · fuente: Tablero ISEL ${MESES[cl.m - 1]} ${cl.a}${cl.editado ? " · con valores modificados" : ""}.</p>
      ${tira}
      <div class="grid3"><div><div class="sub">Movimiento de la venta por cliente</div><div class="graf baja"><canvas id="g-mov" role="img" aria-label="Venta perdida, disminuida, aumentada y nueva"></canvas></div><p class="nota-pie">Índice de crecimiento de cartera: ${fmtP(d.indice, 1)}.</p></div>
      <div><div class="sub">De dónde viene la venta de cada mes</div><div class="graf baja"><canvas id="g-mezcla" role="img" aria-label="Venta de clientes retenidos y ganados"></canvas></div></div>${canal}</div>${tablaEd}`;
    return bloque("salud", cuerpo);
  }

  /* ---------------------------------------------------------- 06 Portafolio */
  function bPortafolio() {
    const c = ctx(), C = colores();
    const { filas, op } = filasDim("linea", c.L, "port-lineas");
    ordenar("port-lineas", filas, "log:d");
    const v = filas.filter((x) => x.meta || x.log);
    chart("g-port", { type: "bar", data: { labels: v.map((x) => x.n), datasets: [{ label: "Venta", data: v.map((x) => x.log), backgroundColor: C.s1 }, { label: "Meta", data: v.map((x) => x.meta), backgroundColor: C.meta }, { label: `Venta ${c.Ja - 1}`, data: v.map((x) => x.prev), backgroundColor: C.s2 }] }, options: { scales: { y: ejeM(), x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 50, font: { size: 11 } } } }, plugins: { tooltip: { callbacks: { label: tipM, afterBody: (it) => { const x = v[it[0].dataIndex]; return `Cumplimiento ${fmtP(x.cumpl)} · Crec. ${fmtPs(x.crec, 1)}`; } } } } } });
    const cuerpo = `<div class="sub" style="margin:0">${ms("port-lineas", op, "Líneas")}</div>
      ${topContrib(filas)}
      <div class="graf"><canvas id="g-port" role="img" aria-label="Venta contra meta por línea"></canvas></div>
      ${tablaResultados("port-lineas", "linea", filas, c)}
      <p class="nota-pie">Profundizar solo en las líneas que requieren una decisión comercial.</p>`;
    return bloque("portafolio", cuerpo);
  }

  /* ---------------------------------------------------------- 07 Pronóstico */
  function proximoMes(a, m) { return m === 12 ? [a + 1, 1] : [a, m + 1]; }
  function bPronostico() {
    const c = ctx(), C = colores();
    const J = junta(c.clave), F = J.forecast || (J.forecast = {});
    const [Na, Nm] = proximoMes(c.Ja, c.Jm);
    const metaN = fin(F.meta) ? F.meta : tot(Na, Nm)?.meta ?? null;
    const ult3 = [0, 1, 2].map((i) => { let a = c.Ja, m = c.Jm - i; if (m < 1) { m += 12; a--; } return tot(a, m)?.log; }).filter(fin);
    const prom3 = ult3.length ? ult3.reduce((s, x) => s + x, 0) / ult3.length : null;
    const fc = fin(F.valor) ? F.valor : prom3;
    const gap = fin(fc) && fin(metaN) ? fc - metaN : null;
    const r = div(fc, metaN);
    const auto = !fin(r) ? "na" : r >= 0.95 ? "ok" : r >= 0.85 ? "warn" : "bad";
    const estado = F.semaforo || auto;
    const etq = { ok: "🟢 En línea", warn: "🟡 Probable", bad: "🔴 Riesgo", na: "Sin datos" };
    const cot = kpi(c.Ja, c.Jm, "cotizaciones"), ef = kpi(c.Ja, c.Jm, "efectividad"), mg = kpi(c.Ja, c.Jm, "margen"), pdm = kpi(c.Ja, c.Jm, "pendientes_monto");
    const pipeline = fin(F.pipeline) ? F.pipeline : cot.v;
    const esperado = fin(pipeline) && fin(ef.v) ? pipeline * ef.v : null;
    const enCurso = tot(Na, Nm)?.log;
    const inp = (campo, v, ph) => `<input class="ed" style="width:150px" data-fc="${campo}" value="${fin(v) ? Math.round(v) : ""}" placeholder="${esc(ph || "")}" aria-label="${campo}">`;
    // Proyección del año
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);
    let acR = 0, acM = 0, acP = 0;
    const real = [], metaA = [], proy = [];
    const ritmo = fin(F.ritmo) ? F.ritmo : prom3;
    meses.forEach((m) => {
      const t = tot(c.Ja, m); acM += t ? t.meta : 0; metaA.push(acM);
      if (m <= c.Jm) { acR += t ? t.log : 0; real.push(acR); acP = acR; proy.push(m === c.Jm ? acR : null); }
      else { real.push(null); acP += m === c.Jm + 1 && fin(fc) ? fc : (ritmo || 0); proy.push(acP); }
    });
    const cierre = acP, cumpCierre = div(cierre, c.mAnual);
    chart("g-proy", { type: "line", data: { labels: MC, datasets: [{ label: "Venta acumulada real", data: real, borderColor: C.s1, backgroundColor: C.s1, tend: "M", tendHasta: 11, tendNombre: "Ritmo lineal del año", tendColor: C.s3 }, { label: "Proyección", data: proy, borderColor: C.s1, borderDash: [6, 4], backgroundColor: C.s1, pointStyle: "rectRot" }, { label: "Meta acumulada", data: metaA, borderColor: C.meta, backgroundColor: C.meta, pointRadius: 0, borderDash: [2, 3] }] }, options: { scales: { y: ejeM(), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: tipM } } } } });
    const cuerpo = `<div class="grid-6-4"><div>
        <div class="sub">${MESES[Nm - 1]} ${Na} · pronóstico</div>
        <div class="tira" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="celda"><label>Meta próxima</label><div class="valor">${fmtM(metaN)}</div><small>${UI.modoEdicion ? inp("meta", F.meta, "de la meta registrada") : "registrada en el reporte"}</small></div>
          <div class="celda"><label>Forecast</label><div class="valor">${fmtM(fc)}</div><small>${UI.modoEdicion ? inp("valor", F.valor, "promedio 3 meses") : fin(F.valor) ? "capturado en la junta" : "promedio de los últimos 3 meses"}</small></div>
          <div class="celda"><label>Gap esperado</label><div class="valor ${gap < 0 ? "neg" : "pos"}">${fmtS(gap)}</div><small>${fmtP(r)} de la meta</small></div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><span class="campo-label" style="margin:0">Semáforo</span>
          <div class="semaforo-forecast">${["bad", "warn", "ok"].map((s) => `<button type="button" class="${s}" data-fc-sem="${s}" aria-pressed="${estado === s}">${etq[s].slice(3)}</button>`).join("")}</div>
          ${F.semaforo ? `<button class="link restaurar" data-fc-sem="" type="button">usar el automático (${etq[auto]})</button>` : `<span class="nota-pie" style="margin:0">automático por forecast ÷ meta</span>`}</div>
        <div class="sub" style="margin-top:16px">Lo que sostiene el pronóstico</div>
        <div class="tira">
          <div class="celda"><label>Pipeline cotizado</label><div class="valor">${fmtM(pipeline)}</div><small>${UI.modoEdicion ? inp("pipeline", F.pipeline, "cotizaciones abiertas") : "cotizaciones abiertas (Odoo)"}</small></div>
          <div class="celda"><label>Margen de seguridad</label><div class="valor">${fmtX(mg.v)}</div><small>meta ${fmtX(mg.meta)}</small></div>
          <div class="celda"><label>Disponibles por facturar</label><div class="valor">${fmtM(pdm.v)}</div><small>pendientes por surtir</small></div>
          <div class="celda"><label>Pipeline × efectividad</label><div class="valor">${fmtM(esperado)}</div><small>a ${fmtP(ef.v, 1)} de cierre</small></div>
        </div>
        ${fin(enCurso) && enCurso > 0 ? `<p class="nota-pie">Avance real de ${MESES[Nm - 1]} a la fecha del reporte: ${fmt$(enCurso)} (${fmtP(div(enCurso, metaN))} de su meta).</p>` : ""}
      </div><div>
        <div class="sub">Cierre del año proyectado</div>
        <div class="graf"><canvas id="g-proy" role="img" aria-label="Proyección de venta acumulada"></canvas></div>
        <p class="nota-pie">Proyección: forecast del próximo mes y, después, ${fmtM(ritmo)} por mes ${UI.modoEdicion ? inp("ritmo", F.ritmo, "ritmo mensual") : "(promedio de 3 meses)"}. Cierre estimado <b>${fmtM(cierre)}</b> = <b>${fmtP(cumpCierre)}</b> de la meta anual.</p>
      </div></div>
      <div class="aviso info">Pronóstico ${MESES[Nm - 1]}: <b>${etq[estado]}</b> · Meta ${fmtM(metaN)} | Forecast ${fmtM(fc)} | Gap ${fmtS(gap)} | Pipeline ${fmtM(pipeline)} / margen ${fmtX(mg.v)}</div>`;
    return bloque("pronostico", cuerpo);
  }

  /* ---------------------------------------------------------- 08 Acción */
  const ESTADOS = [["pendiente", "Pendiente"], ["en_proceso", "En proceso"], ["cumplido", "Cumplido"], ["no_cumplido", "No cumplido"], ["reprogramado", "Reprogramado"], ["cancelado", "Cancelado"]];
  function tablaCompromisos(lista, conJunta) {
    if (!lista.length) return `<div class="vacio">Sin compromisos con este filtro.</div>`;
    return `<div class="tabla-wrap" style="max-height:none"><table class="t compromisos"><thead><tr>${conJunta ? "<th>Junta</th>" : ""}<th style="width:44px">#</th><th>Problema</th><th>Acción</th><th>Responsable</th><th>Fecha</th><th>Indicador que debe mover</th><th>Resultado esperado</th><th>Estado</th><th>Avance</th><th>Seguimiento</th><th></th></tr></thead><tbody>
      ${lista.map((x) => `<tr data-comp="${x.id}">
        ${conJunta ? `<td class="mono" style="white-space:nowrap">${MC[+x.junta.slice(5) - 1]} ${x.junta.slice(0, 4)}</td>` : ""}
        <td><input data-cf="prioridad" value="${esc(x.prioridad)}" style="width:36px" inputmode="numeric" aria-label="Prioridad"></td>
        <td><textarea rows="2" data-cf="problema" aria-label="Problema">${esc(x.problema)}</textarea></td>
        <td style="min-width:200px"><textarea rows="2" data-cf="accion" aria-label="Acción">${esc(x.accion)}</textarea></td>
        <td><input data-cf="responsable" value="${esc(x.responsable)}" aria-label="Responsable" style="min-width:110px"></td>
        <td><input type="date" data-cf="fecha" value="${esc(x.fecha)}" aria-label="Fecha compromiso"></td>
        <td><input data-cf="indicador" value="${esc(x.indicador)}" aria-label="Indicador" style="min-width:120px"></td>
        <td><textarea rows="2" data-cf="esperado" aria-label="Resultado esperado">${esc(x.esperado)}</textarea></td>
        <td><select class="estado-sel ${x.estado}" data-cf="estado" aria-label="Estado">${ESTADOS.map(([v, t]) => `<option value="${v}" ${x.estado === v ? "selected" : ""}>${t}</option>`).join("")}</select>${x.fecha && x.fecha < isoLocal(hoy) && !["cumplido", "cancelado"].includes(x.estado) ? '<div class="cod neg" style="margin:2px 0 0">vencido</div>' : ""}</td>
        <td><div class="avance"><input type="range" min="0" max="100" step="10" value="${x.avance || 0}" data-cf="avance" aria-label="Avance"><span class="mono">${x.avance || 0}%</span></div></td>
        <td style="min-width:180px"><textarea rows="2" data-cf="seguimiento" placeholder="Qué pasó / evidencia" aria-label="Seguimiento">${esc(x.seguimiento)}</textarea></td>
        <td><button class="restaurar" data-comp-borrar="${x.id}" title="${UI.borrar === x.id ? "Confirmar" : "Eliminar"}" type="button">${UI.borrar === x.id ? "¿Eliminar?" : "✕"}</button></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function bAccion() {
    const c = ctx();
    const todas = vista("acc-alcance", "junta") === "todas";
    let lista = G.compromisos.filter((x) => todas || x.junta === c.clave);
    const resp = [...new Set(G.compromisos.map((x) => x.responsable).filter(Boolean))].sort().map((r) => ({ v: r, t: r }));
    registrarMs("acc-estado", ESTADOS.map(([v, t]) => ({ v, t }))); registrarMs("acc-resp", resp);
    lista = lista.filter((x) => pasa("acc-estado", x.estado) && (!x.responsable || pasa("acc-resp", x.responsable))).sort((a, b) => (a.junta < b.junta ? 1 : a.junta > b.junta ? -1 : (+a.prioridad || 9) - (+b.prioridad || 9)));
    const nJ = G.compromisos.filter((x) => x.junta === c.clave).length;
    const cuerpo = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${seg("acc-alcance", [["junta", `Junta ${MC[c.Jm - 1]} ${c.Ja}`], ["todas", "Todas las juntas"]], todas ? "todas" : "junta")} ${ms("acc-estado", ESTADOS.map(([v, t]) => ({ v, t })), "Estado")} ${resp.length ? ms("acc-resp", resp, "Responsable") : ""}
        <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-sugerir type="button">Sugerir desde el diagnóstico</button><button class="btn prim" data-comp-nuevo type="button">+ Agregar compromiso</button></span></div>
      ${nJ > 5 ? `<div class="aviso">Hay ${nJ} compromisos en esta junta. La recomendación es máximo 3 a 5 prioridades corporativas.</div>` : ""}
      ${tablaCompromisos(lista, todas)}
      <p class="nota-pie">Los compromisos se guardan al escribir. En la siguiente junta aparecen en el bloque 00 para revisar qué pasó con ellos antes de presentar el nuevo mes.</p>`;
    return bloque("accion", cuerpo);
  }

  /* ---------------------------------------------------------- 09 Otros */
  /* --------------------------------------- facturas de Odoo: re-facturación */
  let FAC = null;
  function facturasInfo() {
    if (!BASE.facturas || !BASE.facturas.docs || !BASE.facturas.docs.length) return null;
    if (FAC && FAC.src === BASE.facturas) return FAC;
    const docs = BASE.facturas.docs.map((x) => ({ k: x[0], f: x[1], cli: x[2], cart: x[3], sub: x[4], t: x[5], pago: x[6], ref: x[7], ant: !!x[8], est: x[9] || "", mes: x[1].slice(0, 7) }));
    const byK = new Map(docs.map((d) => [d.k, d]));
    const series = {};
    for (const d of docs) { const m = d.k.match(/^INV\/(\d{4})\/(\d+)$/); if (!m) continue; d.n = +m[2]; d.serie = m[1]; d.ancho = m[2].length; (series[m[1]] = series[m[1]] || []).push(d); }
    const gaps = [];
    for (const [y, L] of Object.entries(series)) {
      L.sort((p, q) => p.n - q.n);
      // La secuencia normal es la subsecuencia más larga con fechas no decrecientes; lo demás se movió de mes
      const v = L.map((d) => +d.f.slice(0, 4) * 12 + +d.f.slice(5, 7));
      const colas = [], idx = [], prev = new Array(L.length).fill(-1);
      for (let i = 0; i < v.length; i++) {
        let lo = 0, hi = colas.length;
        while (lo < hi) { const md = (lo + hi) >> 1; if (colas[md] <= v[i]) lo = md + 1; else hi = md; }
        colas[lo] = v[i]; idx[lo] = i; prev[i] = lo > 0 ? idx[lo - 1] : -1;
      }
      const normal = new Array(L.length).fill(false);
      for (let i = idx[colas.length - 1]; i >= 0; i = prev[i]) normal[i] = true;
      let ult = null; L.forEach((d, j) => { if (normal[j]) ult = d.mes; d.seq = normal[j] ? d.mes : ult; d.normal = normal[j]; });
      let sig = null; for (let j = L.length - 1; j >= 0; j--) { if (L[j].normal) sig = L[j].mes; if (!L[j].seq) L[j].seq = sig; }
      for (let j = 1; j < L.length; j++) for (let n = L[j - 1].n + 1; n < L[j].n; n++) gaps.push({ k: `INV/${y}/${String(n).padStart(L[j].ancho, "0")}`, seq: L[j - 1].seq });
    }
    FAC = { src: BASE.facturas, docs, byK, gaps };
    return FAC;
  }
  function afectaciones(a, m) {
    const I = facturasInfo(); if (!I) return null;
    const M = `${a}-${pad(m)}`;
    const suma = (L) => L.reduce((s, d) => s + d.sub, 0);
    const delMes = I.docs.filter((d) => d.mes === M);
    const salieron = I.docs.filter((d) => d.n && d.seq === M && d.mes !== M).sort((p, q) => q.sub - p.sub);
    const entraron = I.docs.filter((d) => d.n && d.mes === M && d.seq !== M).sort((p, q) => q.sub - p.sub);
    const faltantes = I.gaps.filter((g) => g.seq === M);
    const notas = I.docs.filter((d) => d.t === "N" && !d.ant && d.mes > M && I.byK.get(d.ref)?.mes === M).sort((p, q) => p.sub - q.sub);
    const odooHoy = suma(delMes);
    let foto = null;
    const F = (BASE.fotos || {})[M];
    if (F) {
      const hoyMes = new Map(delMes.map((d) => [d.k, d])); const fk = new Map(F.docs.map((x) => [x[0], x]));
      const canceladas = [], cambiaron = [], nuevas = [];
      for (const [k, x] of fk) {
        const d = hoyMes.get(k);
        if (!d) { if (!I.byK.has(k)) canceladas.push({ k, sub: x[1], cart: x[2], cli: x[3], mes: M }); }
        else if (Math.abs(d.sub - x[1]) > 1) cambiaron.push({ ...d, antes: x[1] });
      }
      for (const [k, d] of hoyMes) if (!fk.has(k)) nuevas.push(d);
      foto = { tomada: F.tomada, total: F.docs.reduce((s, x) => s + x[1], 0), canceladas, cambiaron, nuevas };
    }
    const od = {}; delMes.forEach((d) => (od[d.cart] = (od[d.cart] || 0) + d.sub));
    const rep = {}; for (const r of IDX.h.values()) if (r.a === a && r.m === m && r.d === "cartera") rep[r.k] = r.log;
    const porCartera = [...new Set([...Object.keys(od), ...Object.keys(rep)])].map((k) => ({ k, rep: rep[k] || 0, od: od[k] || 0, dif: (od[k] || 0) - (rep[k] || 0) })).filter((x) => Math.abs(x.dif) > 1).sort((p, q) => p.dif - q.dif);
    return { M, delMes, salieron, entraron, faltantes, notas, odooHoy, foto, porCartera, emitido: odooHoy + suma(salieron) - suma(entraron), suma };
  }

  /* ---------------------------------------------------------- 09 Otros */
  function bOtros() {
    const c = ctx(), J = junta(c.clave), C = colores();
    const A = afectaciones(c.Ja, c.Jm);
    let auto = "";
    if (!A) auto = `<div class="aviso info">Carga en <b>Datos</b> el reporte <b>Estadísticas de facturas</b> de Odoo para detectar automáticamente las facturas que se re-fecharon o cancelaron después del cierre de ${MESES[c.Jm - 1]}.</div>`;
    else {
      const op = [...new Set([...A.salieron, ...A.entraron, ...A.notas, ...A.porCartera, ...(A.foto ? A.foto.canceladas : [])].map((x) => x.cart || x.k))].filter(Boolean).sort().map((k) => ({ v: k, t: nombreCartera(k) }));
      registrarMs("fac-carts", op);
      const ok = (d) => pasa("fac-carts", d.cart || d.k);
      const sal = A.salieron.filter(ok), ent = A.entraron.filter(ok), notas = A.notas.filter(ok), cartD = A.porCartera.filter((x) => pasa("fac-carts", x.k));
      const meta = tot(c.Ja, c.Jm)?.meta, rep = tot(c.Ja, c.Jm)?.log;
      const fueraAnio = sal.filter((d) => d.mes.slice(0, 4) !== String(c.Ja));
      const destino = (d) => `${MC[+d.mes.slice(5) - 1]} ${d.mes.slice(0, 4)}`;
      const fila = (d, extra = "") => `<tr><td class="mono">${esc(d.k)}</td><td class="mono">${esc(d.f)}</td><td>${esc(d.cli)}</td><td style="font-size:12.5px;white-space:nowrap"><span class="cod" style="margin:0">${esc(d.cart)}</span> ${esc((IDX.cartNom[d.cart] || "").split(" ").slice(0, 2).join(" "))}</td><td class="n">${fmt$(d.sub)}</td><td style="font-size:12.5px;white-space:nowrap">${esc(d.pago || "")}</td>${extra}</tr>`;
      const tabla = (L, cab, extraCab = "", extra = () => "") => L.length ? `<div class="tabla-wrap"><table class="t"><thead><tr><th>Factura</th><th>Fecha actual</th><th>Cliente</th><th>Cartera</th><th class="n">Subtotal</th><th>Pago</th>${extraCab}</tr></thead><tbody>${L.map((d) => fila(d, extra(d))).join("")}</tbody><tfoot><tr><td colspan="4">${L.length} ${cab}</td><td class="n">${fmt$(A.suma(L))}</td><td colspan="${extraCab ? 2 : 1}"></td></tr></tfoot></table></div>` : `<div class="vacio">Ninguna.</div>`;
      // Serie mensual de venta re-fechada fuera de su mes
      const meses = Array.from({ length: Math.max(cerrado(c.Ja), c.Jm) }, (_, i) => i + 1);
      const serie = meses.map((mm) => { const X = afectaciones(c.Ja, mm); return X ? X.suma(X.salieron.filter(ok)) : 0; });
      chart("g-refac", { type: "bar", data: { labels: meses.map((mm) => MC[mm - 1]), datasets: [{ label: "Venta re-fechada fuera de su mes", tend: "M", borderColor: C.ink2, data: serie, backgroundColor: meses.map((mm) => (mm === c.Jm ? C.s2 : alfa(C.s2, 0.45))) }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${fmt$(x.parsed.y)} · ${fmtP(div(x.parsed.y, tot(c.Ja, meses[x.dataIndex])?.log), 1)} de la venta del mes` } } }, scales: { y: ejeM({ beginAtZero: true }), x: { grid: { display: false } } } } });
      const fotoHtml = !A.foto ? `<p class="nota-pie">Todavía no hay foto de ${MESES[c.Jm - 1]}: se guarda la primera vez que se carga el reporte con el mes ya cerrado.</p>`
        : `<div><div class="sub">Cambios contra la foto del cierre <span class="der">foto del ${new Date(A.foto.tomada).toLocaleDateString("es-MX", { dateStyle: "medium" })}</span></div>
          ${A.foto.canceladas.length || A.foto.cambiaron.length || A.foto.nuevas.length ? `<div class="tabla-wrap"><table class="t"><thead><tr><th>Factura</th><th>Qué pasó</th><th>Cliente</th><th>Cartera</th><th class="n">En la foto</th><th class="n">Hoy</th></tr></thead><tbody>
            ${A.foto.canceladas.filter(ok).map((d) => `<tr><td class="mono">${esc(d.k)}</td><td><span class="sem bad">Cancelada</span></td><td>${esc(d.cli)}</td><td style="font-size:12.5px">${esc(nombreCartera(d.cart))}</td><td class="n">${fmt$(d.sub)}</td><td class="n">$0</td></tr>`).join("")}
            ${A.foto.cambiaron.filter(ok).map((d) => `<tr><td class="mono">${esc(d.k)}</td><td><span class="sem warn">Cambió de monto</span></td><td>${esc(d.cli)}</td><td style="font-size:12.5px">${esc(nombreCartera(d.cart))}</td><td class="n">${fmt$(d.antes)}</td><td class="n">${fmt$(d.sub)}</td></tr>`).join("")}
            ${A.foto.nuevas.filter(ok).map((d) => `<tr><td class="mono">${esc(d.k)}</td><td><span class="sem na">Agregada después</span></td><td>${esc(d.cli)}</td><td style="font-size:12.5px">${esc(nombreCartera(d.cart))}</td><td class="n">$0</td><td class="n">${fmt$(d.sub)}</td></tr>`).join("")}
            </tbody></table></div>` : `<div class="vacio">Sin cambios desde la foto. Cuando vuelvas a cargar el reporte, aquí aparecerán las facturas de ${MESES[c.Jm - 1]} que se cancelen o cambien, con su monto.</div>`}</div>`;
      auto = `<div class="tira">
          <div class="celda"><label>Emitido con folio de ${MC[c.Jm - 1]}</label><div class="valor">${fmtM(A.emitido)}</div><small>${fmtP(div(A.emitido, meta))} de la meta</small></div>
          <div class="celda"><label>Re-fechado a otro mes</label><div class="valor neg">${fmtS(-A.suma(A.salieron))}</div><small>${A.salieron.length} facturas${fueraAnio.length ? ` · ${fueraAnio.length} a otro año` : " · no cambia el acumulado anual"}</small></div>
          <div class="celda"><label>Entró de otros meses</label><div class="valor ${A.entraron.length ? "pos" : ""}">${fmtS(A.suma(A.entraron))}</div><small>${A.entraron.length} facturas con folio de otro mes</small></div>
          <div class="celda"><label>Venta del mes en Odoo hoy</label><div class="valor">${fmtM(A.odooHoy)}</div><small>${fmtP(div(A.odooHoy, meta))} · reportado ${fmtM(rep)} (${fmtS(A.odooHoy - (rep || 0))})</small></div>
        </div>
        <div class="interpretacion"><p>${A.salieron.length ? `Con folio de ${MESES[c.Jm - 1]} se emitieron <b>${fmtM(A.emitido)}</b>. <b>${A.salieron.length}</b> facturas por <b>${fmtM(A.suma(A.salieron))}</b> se cancelaron y se volvieron a emitir con fecha de otro mes (<b>${fmtPs(-div(A.suma(A.salieron), meta), 1)}</b> de cumplimiento)${A.entraron.length ? ` y entraron <b>${A.entraron.length}</b> con folio de otros meses por <b>${fmtM(A.suma(A.entraron))}</b> (${fmtPs(div(A.suma(A.entraron), meta), 1)})` : ""}. Efecto neto en el cierre: <b>${fmtS(A.odooHoy - A.emitido)}</b>, cumplimiento de ${fmtP(div(A.emitido, meta))} a <b>${fmtP(div(A.odooHoy, meta))}</b>. ${fueraAnio.length ? `${fueraAnio.length} pasaron a ${fueraAnio[0].mes.slice(0, 4)}, así que también afectan el cierre anual.` : "Como se re-emitieron dentro del mismo año, no cambian el acumulado anual: la venta cuenta en el mes al que se movieron."}` : `Ninguna factura con folio de ${MESES[c.Jm - 1]} se movió a otro mes.`}${A.faltantes.length ? ` Además hay <b>${A.faltantes.length}</b> folios de la secuencia de ${MESES[c.Jm - 1]} que no aparecen en el reporte (canceladas; Odoo no exporta su monto).` : ""}</p></div>
        <div class="sub" style="margin:0">${ms("fac-carts", op, "Carteras")}</div>
        <div><div class="sub">Re-fechadas a otro mes</div>${tabla(sal, "facturas", "<th>Movida a</th>", (d) => `<td class="mono" style="white-space:nowrap">${destino(d)}${d.mes.slice(0, 4) !== String(c.Ja) ? ' <span class="sem bad">otro año</span>' : ""}</td>`)}</div>
        <div class="grid2"><div><div class="sub">Re-facturación por mes · ${c.Ja}</div><div class="graf baja"><canvas id="g-refac" role="img" aria-label="Venta re-fechada por mes"></canvas></div><p class="nota-pie">Venta con folio de cada mes que terminó fechada en otro mes. Barra marcada: ${MESES[c.Jm - 1]}.</p></div>
        ${fotoHtml}</div>
        <details><summary class="campo-label" style="cursor:pointer">Folios de ${MESES[c.Jm - 1]} sin factura en el reporte (${A.faltantes.length})</summary><p class="nota-pie">Son números publicados que hoy no aparecen: facturas canceladas. El reporte de Odoo no trae su monto; si alguno importa, captúralo abajo.</p><div style="display:flex;flex-wrap:wrap;gap:6px">${A.faltantes.map((g) => `<span class="sem na">${esc(g.k)}</span>`).join("") || "Ninguno"}</div></details>
        <details ${ent.length ? "" : ""}><summary class="campo-label" style="cursor:pointer">Facturas con folio de otro mes fechadas en ${MESES[c.Jm - 1]} (${ent.length} · ${fmt$(A.suma(ent))})</summary>${tabla(ent, "facturas", "<th>Folio de</th>", (d) => `<td class="mono">${MC[+d.seq.slice(5) - 1]} ${d.seq.slice(0, 4)}</td>`)}</details>
        <details ${notas.length ? "open" : ""}><summary class="campo-label" style="cursor:pointer">Notas de crédito posteriores que revierten ventas de ${MESES[c.Jm - 1]} (${notas.length})</summary><p class="nota-pie">No incluye la aplicación de anticipos (crédito o descuento de anticipo).</p>${tabla(notas, "notas", "<th>Revierte</th>", (d) => `<td class="mono">${esc(d.ref)}</td>`)}</details>
        <details ${cartD.length ? "open" : ""}><summary class="campo-label" style="cursor:pointer">Diferencias por cartera: reportado contra Odoo hoy (${cartD.length})</summary>${cartD.length ? `<div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>Cartera</th><th class="n">Reportado</th><th class="n">Odoo hoy</th><th class="n">Diferencia</th></tr></thead><tbody>${cartD.map((x) => `<tr><td>${esc(nombreCartera(x.k))}</td><td class="n">${fmt$(x.rep)}</td><td class="n">${fmt$(x.od)}</td><td class="n ${x.dif < 0 ? "neg" : "pos"}">${fmt$(x.dif)}</td></tr>`).join("")}</tbody></table></div><p class="nota-pie">Cambios hechos en Odoo después de preparar el Resultado de ventas. Desde la siguiente carga, la foto del cierre dirá qué facturas fueron.</p>` : `<div class="vacio">El Resultado de ventas coincide con Odoo por cartera.</div>`}</details>`;
    }
    const L = J.canceladas || (J.canceladas = []);
    const total = L.reduce((s, x) => s + (+x.monto || 0), 0);
    const manual = `<div class="sub" style="margin:0">Captura manual <span class="der"><button class="btn chico" data-canc-nueva type="button">+ Agregar factura</button></span></div>
      ${L.length ? `<div class="tabla-wrap" style="max-height:none"><table class="t compromisos"><thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Cartera / vendedor</th><th class="n">Monto</th><th>Motivo</th><th></th></tr></thead><tbody>
        ${L.map((x, i) => `<tr><td><input data-canc="${i}" data-campo="folio" value="${esc(x.folio)}" aria-label="Folio"></td><td><input type="date" data-canc="${i}" data-campo="fecha" value="${esc(x.fecha)}" aria-label="Fecha"></td><td><input data-canc="${i}" data-campo="cliente" value="${esc(x.cliente)}" aria-label="Cliente"></td><td><input data-canc="${i}" data-campo="cartera" value="${esc(x.cartera)}" aria-label="Cartera"></td><td class="n"><input data-canc="${i}" data-campo="monto" value="${esc(x.monto)}" inputmode="decimal" style="text-align:right" aria-label="Monto"></td><td><textarea rows="1" data-canc="${i}" data-campo="motivo" aria-label="Motivo">${esc(x.motivo)}</textarea></td><td><button class="restaurar" data-canc-borrar="${i}" type="button" title="Eliminar">✕</button></td></tr>`).join("")}
        </tbody><tfoot><tr><td colspan="4">${L.length} facturas</td><td class="n">${fmt$(total)}</td><td colspan="2">${fmtP(div(total, c.per.log), 2)} de la venta del periodo</td></tr></tfoot></table></div>` : `<div class="vacio">Para lo que no venga en Odoo: motivo de una cancelación, folios faltantes con monto, etc.</div>`}`;
    const cuerpo = `<div class="sub" style="margin:0">Facturas que afectaron el cierre de ${MESES[c.Jm - 1]} ${c.Ja}</div>${auto}${manual}`;
    return bloque("otros", cuerpo);
  }

  /* ===================================================================== */
  /*                       PARTE 2 · ANÁLISIS ADICIONAL                     */
  /* ===================================================================== */
  const SECC2 = [
    ["general", "Análisis general de ISEL"], ["historico", "Histórico y estacionalidad"], ["anual", "Año contra año"], ["calor", "Mapa de cumplimiento"],
    ["mezcla", "Línea × cartera"], ["concentracion", "Concentración"], ["clientes", "Movimiento de clientes"],
    ["tipo", "Tipo de cliente"], ["simulador", "Simulador de cierre"],
  ];
  function seccion(id, titulo, pregunta, cuerpo) {
    const i = SECC2.findIndex((x) => x[0] === id);
    return `<section class="bloque" id="b-${id}"><header><span class="bloque-num">${String.fromCharCode(65 + i)}</span><h2>${titulo}</h2><span class="pregunta">${pregunta}</span><div class="acciones-h">${botonAmpliar(id)}</div></header><div class="bloque-cuerpo">${cuerpo}</div></section>`;
  }

  function sHistorico() {
    const C = colores(), c = ctx();
    const anios = [...new Set((BASE.historico || []).map((x) => x.a))].sort();
    const op = anios.map((a) => ({ v: String(a), t: String(a) }));
    registrarMs("hist-anios", op);
    const sel = anios.filter((a) => pasa("hist-anios", String(a)));
    const pal = [C.meta, C.s4, C.s2, C.s1, C.s3, C.s5];
    const val = (a, m) => { const t = tot(a, m); const lim = cerrado(a); if (t && m <= lim) return t.log; if (t) return null; return IDX.hist.get(`${a}-${m}`) ?? null; };
    chart("g-hist", { type: "line", data: { labels: MC, datasets: sel.map((a) => ({ label: String(a), tend: "M", data: MC.map((_, i) => val(a, i + 1)), borderColor: pal[(anios.indexOf(a) + (6 - anios.length)) % 6] || C.s1, backgroundColor: pal[(anios.indexOf(a) + (6 - anios.length)) % 6] || C.s1, borderWidth: a === c.Ja ? 3 : 2 })) }, options: { scales: { y: ejeM(), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: tipM } } } } });
    // Mapa de calor año × mes
    const todos = sel.flatMap((a) => MC.map((_, i) => val(a, i + 1))).filter(fin);
    const mx = Math.max(...todos, 1), mn = Math.min(...todos, 0);
    const color = (v) => { if (!fin(v)) return ""; const t = (v - mn) / (mx - mn || 1); return `background:${alfa(C.s1, 0.08 + t * 0.62)};${t > 0.65 ? "color:#fff" : ""}`; };
    const trim = (a, q) => [1, 2, 3].map((i) => val(a, (q - 1) * 3 + i)).reduce((s, x) => s + (x || 0), 0);
    const sumA = (a) => MC.map((_, i) => val(a, i + 1)).reduce((s, x) => s + (x || 0), 0);
    const tabla = `<div class="tabla-wrap"><table class="t calor"><thead><tr><th>Año</th>${MC.map((m) => `<th class="n">${m}</th>`).join("")}<th class="n">Total</th><th class="n">Crec.</th></tr></thead><tbody>
      ${sel.map((a) => { const s = sumA(a), sp = anios.includes(a - 1) ? sumA(a - 1) : null; return `<tr><td class="mono">${a}</td>${MC.map((_, i) => { const v = val(a, i + 1); return `<td class="c" style="${color(v)}" title="${MESES[i]} ${a}: ${fmt$(v)}">${fin(v) ? (v / 1e6).toFixed(1) : "·"}</td>`; }).join("")}<td class="n mono">${fmtM(s, 1)}</td><td class="n ${sp && s < sp ? "neg" : "pos"}">${sp ? fmtPs(s / sp - 1, 1) : "—"}</td></tr>`; }).join("")}
      </tbody></table></div>`;
    const tablaQ = `<div class="tabla-wrap"><table class="t"><thead><tr><th>Año</th><th class="n">T1</th><th class="n">T2</th><th class="n">T3</th><th class="n">T4</th><th class="n">S1</th><th class="n">S2</th></tr></thead><tbody>
      ${sel.map((a) => { const q = [1, 2, 3, 4].map((x) => trim(a, x)); const qp = anios.includes(a - 1) ? [1, 2, 3, 4].map((x) => trim(a - 1, x)) : null; const cel = (v, p) => `<td class="n">${fmtM(v, 1)}${p ? `<div class="cod ${v < p ? "neg" : "pos"}" style="margin:0">${fmtPs(v / p - 1, 0)}</div>` : ""}</td>`; return `<tr><td class="mono">${a}</td>${q.map((v, i) => cel(v, qp && qp[i])).join("")}${cel(q[0] + q[1], qp && qp[0] + qp[1])}${cel(q[2] + q[3], qp && qp[2] + qp[3])}</tr>`; }).join("")}
      </tbody></table></div>`;
    return seccion("historico", "Histórico y estacionalidad", "¿Cómo se comporta la venta mes a mes entre años?",
      `<div class="sub" style="margin:0">${ms("hist-anios", op, "Años")}</div><div class="graf"><canvas id="g-hist" role="img" aria-label="Venta mensual por año"></canvas></div>
      <div><div class="sub">Venta mensual en millones (más oscuro = mayor venta)</div>${tabla}</div><div><div class="sub">Por trimestre y semestre · variación contra el año anterior</div>${tablaQ}</div>
      <p class="nota-pie">Los meses del año en curso que aún no cierran no se incluyen. 2023–2024 vienen de la hoja Gráfica del reporte 2025.</p>`);
  }

  function sAnual() {
    const c = ctx(), C = colores();
    const dim = vista("anual-dim", "cartera"), fid = "anual-" + dim;
    const { filas, op } = filasDim(dim, c.L, fid);
    const v = filas.filter((x) => !x.ag && (x.prev || x.log)).map((x) => ({ ...x, dif: x.log - (x.prev || 0) })).sort((a, b) => b.dif - a.dif);
    chart("g-anual", { type: "bar", data: { labels: v.map((x) => x.n.length > 26 ? x.n.slice(0, 25) + "…" : x.n), datasets: [{ label: "Diferencia", data: v.map((x) => x.dif), backgroundColor: v.map((x) => (x.dif >= 0 ? C.ok : C.bad)) }] }, options: { indexAxis: "y", interaction: { mode: "nearest", axis: "y", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => v[it[0].dataIndex].n, label: (x) => `Diferencia ${fmt$(x.parsed.x)}`, afterLabel: (x) => `${c.Ja}: ${fmt$(v[x.dataIndex].log)} · ${c.Ja - 1}: ${fmt$(v[x.dataIndex].prev)}` } } }, scales: { x: ejeM(), y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } } } });
    const tA = totalDe(c.L), tP = c.perAnt;
    return seccion("anual", "Año contra año", `¿Quién crece y quién decrece contra ${esc(etiquetaPeriodo(anteriorDe(c.L)))}?`,
      `<div class="sub" style="margin:0">${seg("anual-dim", [["cartera", "Cartera"], ["equipo", "Equipo"], ["linea", "Línea"], ["division", "División"]], dim)} ${ms(fid, op, DIMS[dim])}</div>
      <div class="tira"><div class="celda"><label>Venta ${esc(c.etiqueta)}</label><div class="valor">${fmtM(tA?.log)}</div></div><div class="celda"><label>Mismo periodo ${c.Ja - 1}</label><div class="valor">${fmtM(tP?.log)}</div></div><div class="celda"><label>Diferencia</label><div class="valor ${tA && tP && tA.log < tP.log ? "neg" : "pos"}">${fmtS(tA && tP ? tA.log - tP.log : null)}</div></div><div class="celda"><label>Crecimiento</label><div class="valor ${tA && tP && tA.log < tP.log ? "neg" : "pos"}">${fmtPs(tA && tP && tP.log ? tA.log / tP.log - 1 : null, 1)}</div></div></div>
      <div class="graf" style="height:${Math.min(560, Math.max(240, v.length * 22 + 40))}px"><canvas id="g-anual" role="img" aria-label="Diferencia contra el año anterior"></canvas></div>
      <p class="nota-pie">Las carteras cambian de titular entre años; la comparación es por número de cartera.</p>`);
  }

  function sCalor() {
    const c = ctx();
    const dim = vista("calor-dim", "cartera"), fid = "calor-" + dim;
    const a = c.Ja, lim = Math.max(1, Math.min(12, Math.max(cerrado(a), c.Jm)));
    const todos = tablaDim(dim, acumDe(a, lim)).filter((x) => !x.ag && (x.meta || x.log)).sort((x, y) => x.o - y.o);
    const op = todos.map((x) => ({ v: x.k, t: (dim === "cartera" ? x.k + " " : "") + x.n }));
    registrarMs(fid, op);
    const filas = todos.filter((x) => pasa(fid, x.k));
    const bg = (r) => { const s = semClase(r); return s === "na" ? "" : `background:var(--${s}-bg);color:var(--${s})`; };
    const tabla = `<div class="tabla-wrap"><table class="t calor"><thead><tr><th>${DIMS[dim]}</th>${MC.slice(0, lim).map((m) => `<th class="n">${m}</th>`).join("")}<th class="n">Acum.</th></tr></thead><tbody>
      ${filas.map((x) => `<tr><td class="nombre">${dim === "cartera" ? `<span class="cod">${x.k}</span>` : ""}${esc(x.n)}</td>${Array.from({ length: lim }, (_, i) => { const h = hecho(a, i + 1, dim, x.k); const r = h ? div(h.log, h.meta) : null; return `<td class="c" style="${bg(r)}" title="${MESES[i]}: venta ${fmt$(h?.log)} · meta ${fmt$(h?.meta)}">${fin(r) ? Math.round(r * 100) : h && h.log ? "s/m" : "·"}</td>`; }).join("")}<td class="c" style="${bg(x.cumpl)};font-weight:600">${fin(x.cumpl) ? Math.round(x.cumpl * 100) : "—"}</td></tr>`).join("")}
      </tbody></table></div>`;
    return seccion("calor", "Mapa de cumplimiento", `Cumplimiento mensual (%) por ${DIMS[dim].toLowerCase()} · ${a}`,
      `<div class="sub" style="margin:0">${seg("calor-dim", [["cartera", "Cartera"], ["equipo", "Equipo"], ["linea", "Línea"], ["division", "División"]], dim)} ${ms(fid, op, DIMS[dim])}</div>${tabla}
      <p class="nota-pie">Verde ≥ 100% · Ámbar 80–99% · Rojo &lt; 80%. "s/m": venta sin meta asignada. Sirve para ver quién es consistente y quién depende de meses aislados.</p>`);
  }

  function sMezcla() {
    const c = ctx();
    const delAnio = Object.keys(BASE.lineaCartera || {}).filter((k) => k.startsWith(c.Ja + "-")).sort().pop();
    const s = delAnio ? { clave: delAnio, a: c.Ja, m: +delAnio.slice(5), datos: BASE.lineaCartera[delAnio] } : snapshot("lineaCartera", c.Ja, c.Jm);
    if (!s) return seccion("mezcla", "Línea × cartera", "", `<div class="aviso info">Sin datos.</div>`);
    const D = s.datos;
    const lineas = [...new Set(D.map((x) => x.linea))].sort(), carts = [...new Map(D.map((x) => [x.cartera, x.vendedor])).entries()].sort();
    const opL = lineas.map((l) => ({ v: l, t: l })), opC = carts.map(([k, v]) => ({ v: k, t: `${k} ${v}` }));
    registrarMs("mz-l", opL); registrarMs("mz-c", opC);
    const Ls = lineas.filter((l) => pasa("mz-l", l)), Cs = carts.filter(([k]) => pasa("mz-c", k));
    const modo = vista("mz-modo", "monto");
    const val = (k, l) => D.filter((x) => x.cartera === k && x.linea === l).reduce((t, x) => t + x.monto, 0);
    const totC = Object.fromEntries(Cs.map(([k]) => [k, Ls.reduce((t, l) => t + val(k, l), 0)]));
    const totL = Object.fromEntries(Ls.map((l) => [l, Cs.reduce((t, [k]) => t + val(k, l), 0)]));
    const gran = Object.values(totC).reduce((a, b) => a + b, 0);
    const C = colores();
    const celda = (k, l) => { const v = val(k, l); if (!v) return `<td class="c">·</td>`; const p = modo === "pc" ? div(v, totC[k]) : modo === "pl" ? div(v, totL[l]) : div(v, gran) * 8; const t = Math.max(0, Math.min(1, p || 0)); const txt = modo === "monto" ? (v / 1e3).toFixed(0) : fmtP(modo === "pc" ? div(v, totC[k]) : div(v, totL[l])); return `<td class="c" style="background:${alfa(v < 0 ? C.bad : C.s1, 0.06 + t * 0.6)};${t > 0.6 ? "color:#fff" : ""}" title="${l} · ${k}: ${fmt$(v)}">${txt}</td>`; };
    const tabla = `<div class="tabla-wrap"><table class="t calor"><thead><tr><th>Cartera</th>${Ls.map((l) => `<th class="n">${esc(l)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>
      ${Cs.map(([k, v]) => `<tr><td class="nombre"><span class="cod">${k}</span>${esc(v)}</td>${Ls.map((l) => celda(k, l)).join("")}<td class="c" style="font-weight:600">${fmtM(totC[k], 2)}</td></tr>`).join("")}
      </tbody><tfoot><tr><td>Total</td>${Ls.map((l) => `<td class="n mono">${fmtM(totL[l], 1)}</td>`).join("")}<td class="n mono">${fmtM(gran, 1)}</td></tr></tfoot></table></div>`;
    return seccion("mezcla", "Línea × cartera", `Venta acumulada ${s.a} al corte de ${MESES[s.m - 1]} · qué vende cada cartera`,
      `<div class="sub" style="margin:0">${seg("mz-modo", [["monto", "Miles de $"], ["pc", "% de la cartera"], ["pl", "% de la línea"]], modo)} ${ms("mz-l", opL, "Líneas")} ${ms("mz-c", opC, "Carteras")}</div>${tabla}
      <p class="nota-pie">Útil para ver dependencia de una sola marca por cartera y líneas que nadie está empujando.</p>`);
  }

  function sConcentracion() {
    const c = ctx(), C = colores();
    const filas = tablaDim("cartera", c.L).filter((x) => x.log > 0).sort((a, b) => b.log - a.log);
    const T = filas.reduce((s, x) => s + x.log, 0);
    let ac = 0; const cum = filas.map((x) => (ac += x.log) / T);
    chart("g-par-c", { data: { labels: filas.map((x) => x.k), datasets: [{ type: "bar", label: "Participación", data: filas.map((x) => x.log / T), backgroundColor: C.s1, order: 2 }, { type: "line", label: "Acumulado", data: cum, borderColor: C.s2, backgroundColor: C.s2, pointRadius: 2, order: 1 }] }, options: { scales: { y: ejeP({ beginAtZero: true, max: 1 }), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { title: (it) => `${filas[it[0].dataIndex].k} ${filas[it[0].dataIndex].n}`, label: (x) => `${x.dataset.label}: ${fmtP(x.parsed.y, 1)}` } } } } });
    const n80 = cum.findIndex((x) => x >= 0.8) + 1;
    const cl = clientesDe(c.Ja, c.Jm);
    let cli = "";
    if (cl && cl.datos.top_ult && cl.datos.top_ult.length) {
      const L = [...cl.datos.top_ult].sort((a, b) => b.monto - a.monto);
      const TT = L.filter((x) => x.monto > 0).reduce((s, x) => s + x.monto, 0);
      const N = +vista("conc-n", "20");
      let a2 = 0; const c2 = L.map((x) => (a2 += Math.max(0, x.monto)) / TT);
      const n80c = c2.findIndex((x) => x >= 0.8) + 1;
      const top = L.slice(0, N);
      chart("g-par-cli", { data: { labels: top.map((_, i) => i + 1), datasets: [{ type: "bar", label: "Participación", data: top.map((x) => x.monto / TT), backgroundColor: C.s3, order: 2 }, { type: "line", label: "Acumulado", data: c2.slice(0, N), borderColor: C.s2, backgroundColor: C.s2, pointRadius: 2, order: 1 }] }, options: { scales: { y: ejeP({ beginAtZero: true, max: 1 }), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { title: (it) => top[it[0].dataIndex].cliente, label: (x) => `${x.dataset.label}: ${fmtP(x.parsed.y, 1)}`, afterBody: (it) => fmt$(top[it[0].dataIndex].monto) } } } } });
      const p = cl.datos.periodo?.ult || [];
      cli = `<div><div class="sub">Clientes · trimestre ${p[0] ? MC[+p[0].slice(5, 7) - 1] : ""}–${p[1] ? MC[+p[1].slice(5, 7) - 1] : ""} ${cl.a} <span class="der">${seg("conc-n", [["10", "Top 10"], ["20", "Top 20"], ["50", "Top 50"]], String(N))}</span></div>
        <div class="tira" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="celda"><label>Clientes con venta</label><div class="valor">${L.filter((x) => x.monto > 0).length}</div></div><div class="celda"><label>Top 10</label><div class="valor">${fmtP(c2[9], 1)}</div><small>de la venta</small></div><div class="celda"><label>Hacen el 80%</label><div class="valor">${n80c}</div><small>clientes</small></div></div>
        <div class="graf" style="margin-top:10px"><canvas id="g-par-cli" role="img" aria-label="Pareto de clientes"></canvas></div></div>`;
    }
    return seccion("concentracion", "Concentración", "¿Qué tanto dependemos de pocas carteras y pocos clientes?",
      `<div class="grid2"><div><div class="sub">Carteras · ${esc(c.etiqueta)}</div><div class="tira" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="celda"><label>Carteras con venta</label><div class="valor">${filas.length}</div></div><div class="celda"><label>Top 3</label><div class="valor">${fmtP(cum[2], 1)}</div><small>de la venta</small></div><div class="celda"><label>Hacen el 80%</label><div class="valor">${n80}</div><small>carteras</small></div></div>
      <div class="graf" style="margin-top:10px"><canvas id="g-par-c" role="img" aria-label="Pareto de carteras"></canvas></div></div>${cli}</div>`);
  }

  /* ---------------------------------------------- clientes: datos y carteras */
  let VCF = null;
  // Ventas por cliente: del reporte de facturas de Odoo si está cargado; si no, de un reporte de clientes
  function vcFilas() {
    if (BASE.facturas && BASE.facturas.docs && BASE.facturas.docs.length) {
      if (VCF && VCF.src === BASE.facturas) return VCF.filas;
      VCF = { src: BASE.facturas, filas: BASE.facturas.docs.map((x) => [+x[1].slice(0, 4), +x[1].slice(5, 7), x[2], x[3], x[4]]) };
      return VCF.filas;
    }
    return (BASE.ventasCliente && BASE.ventasCliente.filas) || [];
  }
  const hayVC = () => vcFilas().length > 0;
  function nombreCartera(k) {
    if (!k) return "—";
    if (k === "S/C") return "Sin cartera";
    if (k.startsWith("?")) return ((BASE.ventasCliente || {}).nombres || {})[k] || k.slice(1);
    const n = IDX.cartNom[k];
    return n ? `${k} ${n}` : k;
  }
  function ventasPorCliente(L) {
    const set = new Set(L.map(([a, m]) => a * 100 + m)); const out = new Map();
    for (const [a, m, cli, cart, v] of vcFilas()) {
      if (!set.has(a * 100 + m)) continue;
      const x = out.get(cli) || { t: 0, c: new Map() };
      x.t += v; x.c.set(cart, (x.c.get(cart) || 0) + v); out.set(cli, x);
    }
    return out;
  }
  function mesesPrevios(L, modo) {
    if (modo === "anio") return anteriorDe(L);
    const out = []; let [a, m] = L[0];
    for (let i = 0; i < L.length; i++) { m--; if (m < 1) { m = 12; a--; } out.unshift([a, m]); }
    return out;
  }
  // Movimiento de clientes con montos atribuidos a las carteras del año en curso
  function movimientoClientes(c) {
    const base = vista("cli-base", "previo");
    const Lp = mesesPrevios(c.L, base);
    const cur = ventasPorCliente(c.L), prev = ventasPorCliente(Lp), anio = ventasPorCliente(acumDe(c.Ja, c.Jm));
    const filas = [];
    for (const cli of new Set([...cur.keys(), ...prev.keys()])) {
      const ya = anio.get(cli);
      let carts = ya ? [...ya.c.entries()].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([k]) => k) : [];
      let deAnt = false;
      if (!carts.length) { const p = prev.get(cli) || cur.get(cli); carts = p ? [...p.c.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k) : ["S/C"]; deAnt = true; }
      const at = new Map(carts.map((k) => [k, { u: 0, a: 0 }]));
      const meter = (x, campo) => { if (!x) return; for (const [k, v] of x.c) { const dest = at.has(k) ? k : carts[0]; at.get(dest)[campo] += v; } };
      meter(cur.get(cli), "u"); meter(prev.get(cli), "a");
      filas.push({ cliente: cli, carts, deAnt, at });
    }
    const opC = [...new Set(filas.flatMap((f) => f.carts))].sort().map((k) => ({ v: k, t: nombreCartera(k) }));
    registrarMs("cli-carts", opC);
    const res = [];
    for (const f of filas) {
      const sel = [...f.at.entries()].filter(([k]) => pasa("cli-carts", k));
      if (!sel.length) continue;
      const u = sel.reduce((s, [, x]) => s + x.u, 0), a = sel.reduce((s, [, x]) => s + x.a, 0);
      if (Math.abs(u) < 0.5 && Math.abs(a) < 0.5) continue;
      const clase = a <= 0 && u > 0 ? "nueva" : a > 0 && u <= 0 ? "perdida" : u > a ? "aumentada" : u < a ? "disminuida" : "igual";
      res.push({ cliente: f.cliente, u, a, dif: u - a, clase, carts: f.carts.filter((k) => pasa("cli-carts", k)), todas: f.carts, deAnt: f.deAnt, desglose: sel.map(([k, x]) => ({ k, ...x })) });
    }
    return { filas: res, opC, Lp, base };
  }
  const etqCarts = (x) => {
    if (!x.carts.length) return "—";
    const p = nombreCartera(x.carts[0]);
    const extra = x.todas.length > 1 ? ` <span class="sem na" title="${esc(x.todas.map(nombreCartera).join(" · "))}">${x.todas.length} carteras</span>` : "";
    return `<span class="cod" style="margin:0">${esc(x.carts[0])}</span> ${esc(p.replace(/^C\d\d\s/, ""))}${x.deAnt ? ' <span class="cod" title="Sin venta este año; cartera del periodo de comparación">(año ant.)</span>' : ""}${extra}`;
  };

  function sClientes() {
    const c = ctx();
    if (!hayVC()) return sClientesTablero(c);
    const { filas, opC, Lp, base } = movimientoClientes(c);
    const per = (k) => filas.filter((x) => x.clase === k);
    const suma = (L) => L.reduce((s, x) => s + x.dif, 0);
    const grupos = [["perdida", "Venta perdida", "neg"], ["disminuida", "Venta disminuida", "neg"], ["aumentada", "Venta aumentada", "pos"], ["nueva", "Venta nueva", "pos"]];
    const activosU = filas.filter((x) => x.u > 0).length, activosA = filas.filter((x) => x.a > 0).length;
    const retenidos = filas.filter((x) => x.a > 0 && x.u > 0).length;
    const lista = ([k, t, cls]) => {
      const L = per(k).sort((x, y) => (cls === "neg" ? x.dif - y.dif : y.dif - x.dif)).slice(0, 10);
      return `<div><div class="sub">${t} · ${fmt$(suma(per(k)))} <span class="der">${per(k).length} clientes</span></div><div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>#</th><th>Cliente</th><th>Cartera ${c.Ja}</th><th class="n">Diferencia</th></tr></thead><tbody>${L.map((x, i) => `<tr><td class="mono" style="width:28px">${i + 1}</td><td>${esc(x.cliente)}</td><td style="font-size:12.5px">${etqCarts(x)}</td><td class="n ${cls}">${fmt$(x.dif)}</td></tr>`).join("") || '<tr><td colspan="4">Sin clientes</td></tr>'}</tbody></table></div></div>`;
    };
    const q = (UI.busq["cli-q"] || "").toLowerCase();
    const desg = vista("cli-desg", "si") === "si";
    const comp = filas.map((x) => ({ ...x, ult: x.u, ant: x.a }));
    ordenar("cli-comp", comp, "ult:d");
    const vis = comp.filter((x) => !q || x.cliente.toLowerCase().includes(q)).slice(0, +vista("cli-n", "25"));
    const multi = comp.filter((x) => x.todas.length > 1).length;
    const etP = etiquetaPeriodo(c.L), etA = etiquetaPeriodo(Lp).replace(/^(T\d|S\d|Año) · /, "");
    const filasComp = vis.map((x) => {
      const sub = desg && x.todas.length > 1 ? x.desglose.filter((d) => Math.abs(d.u) > 0.5 || Math.abs(d.a) > 0.5).sort((p, r) => r.u - p.u).map((d) => `<tr class="subfila"><td style="padding-left:28px">↳ ${esc(nombreCartera(d.k))}</td><td></td><td class="n">${fmt$(d.a)}</td><td class="n">${fmt$(d.u)}</td><td class="n ${d.u - d.a < 0 ? "neg" : "pos"}">${fmt$(d.u - d.a)}</td></tr>`).join("") : "";
      return `<tr><td>${esc(x.cliente)}</td><td style="font-size:12.5px">${etqCarts(x)}</td><td class="n">${fmt$(x.ant)}</td><td class="n">${fmt$(x.ult)}</td><td class="n ${x.dif < 0 ? "neg" : "pos"}">${fmt$(x.dif)}</td></tr>${sub}`;
    }).join("");
    return seccion("clientes", "Movimiento de clientes", `${esc(etP)} contra ${esc(etA)}`,
      `<div class="sub" style="margin:0">${seg("cli-base", [["previo", "vs periodo anterior"], ["anio", "vs mismo periodo año anterior"]], base)} ${ms("cli-carts", opC, "Carteras")}</div>
      <div class="tira"><div class="celda"><label>Clientes con compra</label><div class="valor">${activosU}</div><small>${activosA} en ${esc(etA)}</small></div>
        <div class="celda"><label>Retención</label><div class="valor">${fmtP(div(retenidos, activosA))}</div><small>${retenidos} de ${activosA} volvieron a comprar</small></div>
        <div class="celda"><label>Perdidos / nuevos</label><div class="valor"><span class="neg">${per("perdida").length}</span> / <span class="pos">${per("nueva").length}</span></div><small>clientes</small></div>
        <div class="celda"><label>Crecimiento neto</label><div class="valor ${suma(filas) < 0 ? "neg" : "pos"}">${fmtS(suma(filas))}</div><small>${fmtPs(div(suma(filas), filas.reduce((s, x) => s + x.a, 0)), 1)}</small></div></div>
      <div class="grid2">${grupos.map(lista).join("")}</div>
      <div><div class="sub">Comparativo por cliente <span class="der" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="search" class="campo" style="width:200px;padding:4px 8px" placeholder="Buscar cliente" data-busq="cli-q" id="busq-cli" value="${esc(UI.busq["cli-q"] || "")}">${seg("cli-desg", [["si", "Desglosar carteras"], ["no", "Solo total"]], desg ? "si" : "no")}${seg("cli-n", [["25", "25"], ["100", "100"], ["5000", "Todos"]], vista("cli-n", "25"))}</span></div>
      <div class="tabla-wrap"><table class="t"><thead><tr>${th("cli-comp", "cliente", "Cliente", false)}<th>Cartera ${c.Ja}</th>${th("cli-comp", "ant", esc(etA))}${th("cli-comp", "ult", esc(etP))}${th("cli-comp", "dif", "Diferencia")}</tr></thead><tbody>${filasComp}</tbody></table></div>
      <p class="nota-pie">${comp.length} clientes; ${multi} compran a través de más de una cartera en ${c.Ja} y se desglosan por cartera${UI.filtros["cli-carts"] ? " (solo se muestran las carteras seleccionadas)" : ""}. La venta de periodos anteriores se atribuye a la cartera que atiende al cliente este año (si la cartera anterior ya no lo atiende, va a su cartera principal).</p></div>`);
  }

  // Sin archivo de ventas por cliente: listas del Tablero (trimestre fijo) y cartera asignada a mano
  function sClientesTablero(c) {
    const cl = clientesDe(c.Ja, c.Jm);
    if (!cl) return seccion("clientes", "Movimiento de clientes", "", `<div class="aviso info">Sin datos de clientes. Carga el Tablero ISEL o un archivo de ventas por cliente en la pestaña Datos.</div>`);
    const d = cl.datos, li = d.listas || {};
    G.cliCart = G.cliCart || {};
    const carteras = Object.entries(IDX.cartNom).sort();
    const opC = [{ v: "S/C", t: "Sin asignar" }, ...carteras.map(([k, n]) => ({ v: k, t: `${k} ${n}` }))];
    registrarMs("cli-carts", opC);
    const cartDe = (cli) => G.cliCart[cli] || "S/C";
    const ok = (cli) => pasa("cli-carts", cartDe(cli));
    const celdaCart = (cli) => UI.modoEdicion
      ? `<select class="estado-sel" data-cli-cart="${esc(cli)}" aria-label="Cartera de ${esc(cli)}"><option value="">Sin asignar</option>${carteras.map(([k, n]) => `<option value="${k}" ${G.cliCart[cli] === k ? "selected" : ""}>${k} ${esc(n)}</option>`).join("")}</select>`
      : G.cliCart[cli] ? `<span class="cod" style="margin:0">${G.cliCart[cli]}</span> ${esc(IDX.cartNom[G.cliCart[cli]] || "")}` : '<span class="cod" style="margin:0">sin asignar</span>';
    const lista = (t, L, cls) => { const F = (L || []).filter((x) => ok(x.cliente)); return `<div><div class="sub">${t}</div><div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>#</th><th>Cliente</th><th>Cartera</th><th class="n">Monto</th></tr></thead><tbody>${F.map((x, i) => `<tr><td class="mono" style="width:28px">${i + 1}</td><td>${esc(x.cliente)}</td><td style="font-size:12.5px">${celdaCart(x.cliente)}</td><td class="n ${cls}">${fmt$(x.monto)}</td></tr>`).join("") || '<tr><td colspan="4">Sin clientes con este filtro</td></tr>'}</tbody></table></div></div>`; };
    const ant = new Map((d.top_ant || []).map((x) => [x.cliente, x.monto]));
    const q = (UI.busq["cli-q"] || "").toLowerCase();
    const comp = (d.top_ult || []).map((x) => ({ cliente: x.cliente, ult: x.monto, ant: ant.get(x.cliente) ?? 0 }));
    for (const [k, v] of ant) if (!comp.find((x) => x.cliente === k)) comp.push({ cliente: k, ult: 0, ant: v });
    comp.forEach((x) => (x.dif = x.ult - x.ant));
    ordenar("cli-comp", comp, "ult:d");
    const vis = comp.filter((x) => ok(x.cliente) && (!q || x.cliente.toLowerCase().includes(q))).slice(0, +vista("cli-n", "25"));
    const p = d.periodo || {}; const f = (s) => (s ? `${+s.slice(8, 10)} ${MC[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : "");
    return seccion("clientes", "Movimiento de clientes", `Trimestre ${f(p.ult?.[0])}–${f(p.ult?.[1])} contra el anterior`,
      `<div class="aviso">Estos listados vienen del Tablero ISEL y cubren un trimestre fijo, sin cartera ni fecha por cliente, así que <b>no responden al filtro de periodo</b>. Para ver la cartera de cada cliente en ${c.Ja}, desglosar clientes atendidos por varias carteras y filtrar por cualquier periodo, carga en <b>Datos</b> un reporte de ventas por cliente (SAE u Odoo) con fecha, cliente, cartera o vendedor e importe. Mientras tanto puedes asignar la cartera de cada cliente con <b>Modificar cifras</b>.</div>
      <div class="sub" style="margin:0">${ms("cli-carts", opC, "Carteras")}</div>
      <div class="grid2">${lista(`Venta perdida · ${fmt$(d.venta_perdida)}`, li.perdida, "neg")}${lista(`Venta disminuida · ${fmt$(d.venta_disminuida)}`, li.disminuida, "neg")}${lista(`Venta aumentada · ${fmt$(d.venta_aumentada)}`, li.aumentada, "pos")}${lista(`Venta nueva · ${fmt$(d.venta_nueva)}`, li.nueva, "pos")}</div>
      <div><div class="sub">Comparativo por cliente · trimestre anterior vs último <span class="der" style="display:flex;gap:8px;flex-wrap:wrap"><input type="search" class="campo" style="width:200px;padding:4px 8px" placeholder="Buscar cliente" data-busq="cli-q" id="busq-cli" value="${esc(UI.busq["cli-q"] || "")}">${seg("cli-n", [["25", "25"], ["100", "100"], ["5000", "Todos"]], vista("cli-n", "25"))}</span></div>
      <div class="tabla-wrap"><table class="t"><thead><tr>${th("cli-comp", "cliente", "Cliente", false)}<th>Cartera</th>${th("cli-comp", "ant", "Trim. anterior")}${th("cli-comp", "ult", "Último trim.")}${th("cli-comp", "dif", "Diferencia")}</tr></thead><tbody>
      ${vis.map((x) => `<tr><td>${esc(x.cliente)}</td><td style="font-size:12.5px">${celdaCart(x.cliente)}</td><td class="n">${fmt$(x.ant)}</td><td class="n">${fmt$(x.ult)}</td><td class="n ${x.dif < 0 ? "neg" : "pos"}">${fmt$(x.dif)}</td></tr>`).join("")}</tbody></table></div>
      <p class="nota-pie">${comp.length} clientes con venta en alguno de los dos trimestres. Fuente: listados SAE pegados en el Tablero ISEL.</p></div>`);
  }

  /* ---------------------------------------------------------- Simulador */
  function datosSimulador() {
    const c = ctx(), a = c.Ja, cm = c.Jm;
    const real = c.acum.log, restantes = 12 - cm;
    let restoMeta = 0, prevMismos = 0, hayPrev = false;
    for (let m = cm + 1; m <= 12; m++) { restoMeta += tot(a, m)?.meta || 0; const p = tot(a - 1, m)?.log ?? IDX.hist.get(`${a - 1}-${m}`); if (fin(p)) { prevMismos += p; hayPrev = true; } }
    const ritmo = div(c.acum.log, c.acum.meta);
    let mejor = { r: null, m: null };
    for (let m = 1; m <= cm; m++) { const t = tot(a, m); const r = t ? div(t.log, t.meta) : null; if (fin(r) && (mejor.r === null || r > mejor.r)) mejor = { r, m }; }
    let maxHist = { v: 0, a: null, m: null };
    for (const h of BASE.historico || []) if (h.v > maxHist.v && (h.a < a || h.m <= cm)) maxHist = { v: h.v, a: h.a, m: h.m };
    let totAnt = 0; for (let m = 1; m <= 12; m++) totAnt += tot(a - 1, m)?.log ?? IDX.hist.get(`${a - 1}-${m}`) ?? 0;
    const necesario = c.mAnual - real;
    return { c, a, cm, real, restantes, restoMeta, ritmo, mejor, maxHist, totAnt, necesario, pctNec: div(necesario, restoMeta), pctPrev: hayPrev ? div(prevMismos, restoMeta) : null, prevMismos };
  }
  function interpretarSimulacion(S, pct) {
    const { c, a, cm, real, restantes, restoMeta, ritmo, mejor, maxHist, totAnt, pctNec } = S;
    const cierre = real + restoMeta * pct, cump = div(cierre, c.mAnual), gap = cierre - c.mAnual;
    const ventaMes = restantes ? (restoMeta * pct) / restantes : 0;
    const promedio = real / cm;
    const T = [];
    T.push(`Con un cumplimiento promedio de <b>${fmtP(pct)}</b> en los ${restantes} meses que faltan (${fmtM(ventaMes)} por mes), ISEL cerraría ${a} en <b>${fmtM(cierre)}</b>, el <b>${fmtP(cump)}</b> de la meta anual de ${fmtM(c.mAnual, 1)}; ${gap >= 0 ? `la superaría por ${fmtM(gap)}` : `faltarían ${fmtM(-gap)}`}. ${totAnt ? `Contra la venta total de ${a - 1} (${fmtM(totAnt, 1)}) sería un ${cierre >= totAnt ? "crecimiento" : "decrecimiento"} de ${fmtP(Math.abs(cierre / totAnt - 1), 1)}.` : ""}`);
    let realismo;
    if (fin(mejor.r) && pct > mejor.r + 0.005) realismo = `Supone rendir cada mes por encima del mejor mes de ${a} (${MESES[mejor.m - 1]}, ${fmtP(mejor.r)}). Sin acciones extraordinarias es un escenario <b>poco probable</b>.`;
    else if (fin(ritmo) && pct > ritmo + 0.05) realismo = `Exige mejorar ${fmtP(pct - ritmo)} puntos el ritmo del año (${fmtP(ritmo)}). Es <b>alcanzable solo si se corrigen</b> las causas del bloque Diagnóstico (conversión, vaciado de pendientes, generación de oportunidades).`;
    else if (fin(ritmo) && pct >= ritmo - 0.05) realismo = `Es consistente con el ritmo de cumplimiento del año (${fmtP(ritmo)}): es el <b>escenario más probable</b> si nada cambia.`;
    else realismo = `Está por debajo del ritmo del año (${fmtP(ritmo)}): es un escenario <b>conservador</b>, útil como piso de planeación.`;
    T.push(realismo);
    if (restantes > 0) {
      const nec = S.necesario / restantes;
      let meta = `Para cumplir la meta anual se necesita <b>${fmtP(pctNec)}</b> de cumplimiento en cada mes restante, es decir <b>${fmtM(nec)}</b> por mes: ${fmtP(nec / promedio)} del promedio mensual actual (${fmtM(promedio)})`;
      if (maxHist.a) meta += ` y ${nec > maxHist.v ? "más que" : "cerca de"} la venta mensual más alta registrada (${fmtM(maxHist.v)}, ${MESES[maxHist.m - 1]} ${maxHist.a})`;
      meta += ".";
      if (pctNec > 1.2) meta += ` Con los datos actuales la meta anual <b>no es alcanzable de forma realista</b>; conviene acordar un objetivo de cierre intermedio y medir cada mes la recuperación contra ese objetivo.`;
      else if (pctNec > 1) meta += ` La meta todavía es posible, pero requiere superar la meta de cada mes que falta.`;
      else meta += ` Basta con mantener un cumplimiento mensual de ${fmtP(pctNec)}.`;
      T.push(meta);
    }
    return { cierre, cump, gap, ventaMes, textos: T };
  }
  function sSimulador() {
    const S = datosSimulador(), C = colores();
    const { c, a, cm, real, restantes, restoMeta, ritmo, mejor, pctNec, pctPrev } = S;
    if (!restantes) return seccion("simulador", "Simulador de cierre", `${a} ya cerró`, `<div class="aviso info">Con ${MESES[cm - 1]} seleccionado no quedan meses por simular. Cierre: ${fmtM(real)} (${fmtP(div(real, c.mAnual))} de la meta anual).</div>`);
    const pctUI = UI.vistas["sim-pct"] != null ? +UI.vistas["sim-pct"] / 100 : Math.round((ritmo || 0.8) * 100) / 100;
    const I = interpretarSimulacion(S, pctUI);
    const refs = [
      ["Ritmo del año", ritmo], [`Igual que ${MC[cm]}–Dic ${a - 1}`, pctPrev], [`Mejor mes ${a}`, mejor.r], ["Lo necesario para la meta", pctNec],
    ].filter((x) => fin(x[1]));
    const escen = [...refs.map(([t, p]) => ({ t, p })), { t: "Tu escenario", p: pctUI }].sort((x, y) => x.p - y.p);
    chart("g-sim", { type: "bar", data: { labels: escen.map((x) => `${x.t} · ${fmtP(x.p)}`), datasets: [{ label: "Cierre anual", data: escen.map((x) => real + restoMeta * x.p), backgroundColor: escen.map((x) => { const cc = real + restoMeta * x.p; const col = cc >= c.mAnual ? C.ok : cc >= c.mAnual * 0.9 ? C.warn : C.bad; return x.t === "Tu escenario" ? col : alfa(col, 0.45); }), borderColor: escen.map((x) => (x.t === "Tu escenario" ? C.ink : "transparent")), borderWidth: 2 }, { type: "line", label: "Meta anual", data: escen.map(() => c.mAnual), borderColor: C.ink2, borderDash: [5, 4], pointRadius: 0 }] }, options: { scales: { y: ejeM({ beginAtZero: true }), x: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { tooltip: { callbacks: { label: tipM, afterBody: (it) => it[0].datasetIndex === 0 ? `${fmtP((real + restoMeta * escen[it[0].dataIndex].p) / c.mAnual)} de la meta anual` : "" } } } } });
    return seccion("simulador", "Simulador de cierre", `¿Cómo cerraría ${a} según el cumplimiento de los meses que faltan?`,
      `<div class="grid2"><div style="display:flex;flex-direction:column;gap:12px">
        <label class="campo-label" for="sim-pct">Cumplimiento esperado de ${MC[cm]} a Dic: <b class="mono" style="font-size:15px">${fmtP(pctUI, pctUI * 100 % 1 ? 1 : 0)}</b></label>
        <input type="range" id="sim-pct" min="40" max="180" step="0.5" value="${Math.round(pctUI * 1000) / 10}" data-sim>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${refs.map(([t, p]) => `<button class="btn chico" data-sim-ref="${Math.ceil(p * 1000) / 10}" type="button">${esc(t)} · ${fmtP(p)}</button>`).join("")}</div>
        <div class="tira" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <div class="celda"><label>Venta real a ${MC[cm - 1]}</label><div class="valor">${fmtM(real)}</div><small>${fmtP(ritmo)} de cumplimiento acumulado</small></div>
          <div class="celda"><label>Meta ${MC[cm]}–Dic</label><div class="valor">${fmtM(restoMeta)}</div><small>${restantes} meses</small></div>
          <div class="celda"><label>Cierre proyectado</label><div class="valor ${I.gap >= 0 ? "pos" : "neg"}">${fmtM(I.cierre)}</div><small>${fmtP(I.cump)} de la meta anual · ${fmtS(I.gap)}</small></div>
          <div class="celda"><label>Para llegar a la meta</label><div class="valor">${fmtP(pctNec)}</div><small>de cumplimiento cada mes (${fmtM(S.necesario / restantes)}/mes)</small></div>
        </div></div>
        <div><div class="graf"><canvas id="g-sim" role="img" aria-label="Escenarios de cierre anual"></canvas></div><p class="nota-pie">Barra marcada: el escenario de la barra deslizante. Las demás son referencias calculadas con los datos.</p></div></div>
      <div class="interpretacion"><div class="sub">Lectura del escenario</div>${I.textos.map((t) => `<p>${t}</p>`).join("")}</div>`);
  }

  /* ------------------------------------------------- Análisis general de ISEL */
  const filasTxt = (t, ancho) => Math.max(2, Math.min(10, Math.ceil(String(t || "").length / ancho) + 1));
  const SEV = { critico: ["Crítico", "bad"], alto: ["Alto", "warn"], medio: ["Medio", "na"] };
  function generarAnalisis() {
    const c = ctx(), a = c.Ja, m = c.Jm, Lac = acumDe(a, m);
    const H = [], E = [], P = [];
    const cumA = div(c.acum.log, c.acum.meta), avance = div(c.acum.log, c.mAnual);
    const restantes = 12 - m, falta = c.mAnual - c.acum.log, prom = c.acum.log / m;
    const nec = restantes ? falta / restantes : null;
    const d = diagnosticoAuto();
    const S = datosSimulador();
    const cierreRitmo = restantes ? c.acum.log + S.restoMeta * (S.ritmo || 0) : c.acum.log;
    const fecha = (dias) => isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias));
    const plan = (accion, indicador, meta, dias = 30) => P.push({ accion, responsable: "", fecha: fecha(dias), indicador, meta, estado: "pendiente" });
    // 1. Avance contra la meta
    H.push({ sev: cumA < 0.85 ? "critico" : cumA < 0.95 ? "alto" : "medio", titulo: `Avance anual: ${fmtP(cumA)} de la meta a ${MC[m - 1]}`,
      texto: `Venta acumulada ${fmtM(c.acum.log)} contra ${fmtM(c.acum.meta)} (déficit ${fmtM(c.acum.log - c.acum.meta)}). Llevamos ${fmtP(avance)} de la meta anual de ${fmtM(c.mAnual, 1)}${restantes ? `; para cumplirla faltan ${fmtM(falta)}, ${fmtM(nec)} por mes, ${fmtP(div(nec, prom))} del promedio mensual actual. Al ritmo del año el cierre sería de ${fmtM(cierreRitmo)} (${fmtP(div(cierreRitmo, c.mAnual))}).` : "."}` });
    // 2. Tendencia del déficit
    const W = (BASE.semanal || []).filter((w) => w.a === a && w.venta_acum !== null && +w.fecha.slice(5, 7) <= m);
    if (W.length > 3) {
      const ds = W.slice(1).map((w, i) => (w.venta_acum - w.meta_acum) - (W[i].venta_acum - W[i].meta_acum));
      const amp = ds.filter((x) => x < 0).length;
      H.push({ sev: amp / ds.length > 0.7 ? "critico" : amp / ds.length > 0.5 ? "alto" : "medio", titulo: `El déficit se amplió en ${amp} de ${ds.length} semanas`,
        texto: `En ${MESES[m - 1]} ${d.estado} (${fmtS(d.delta)}). El ritmo semanal no está cerrando la brecha: la organización vende de forma constante por debajo de la meta semanal en lugar de tener meses aislados malos.` });
    }
    // 3. Conversión y pipeline
    const ke = kpi(a, m, "efectividad"), km = kpi(a, m, "margen"), kp = kpi(a, m, "pendientes"), kpm = kpi(a, m, "pendientes_monto"), kc = kpi(a, m, "cotizaciones");
    if (fin(ke.v) && fin(ke.meta)) {
      const r = ke.v / ke.meta;
      H.push({ sev: r < 0.6 ? "critico" : r < 0.85 ? "alto" : "medio", titulo: `Efectividad de cierre en ${fmtP(ke.v, 1)} contra ${fmtP(ke.meta)}`,
        texto: `Con ${fmtM(kc.v)} cotizados y margen de seguridad de ${fmtX(km.v)} (meta ${fmtX(km.meta)}), el problema principal no es la falta de oportunidades sino su conversión. Cada punto de efectividad sobre el pipeline actual equivale a cerca de ${fmtM((kc.v || 0) * 0.01)} de venta.` });
      if (r < 0.85) {
        E.push("Conversión: revisar cada semana, por cartera, las oportunidades en Propuesta y Negociación con monto, fecha de cierre y siguiente paso; priorizar las de mayor monto y probabilidad.");
        plan("Revisión semanal de oportunidades en Propuesta / Negociación por cartera, con plan de cierre de las 10 de mayor monto", "Efectividad de cierre", `Subir de ${fmtP(ke.v, 0)} a ${fmtP(Math.min(ke.meta, ke.v + 0.05), 0)} en 60 días`, 60);
      }
    }
    if (fin(km.v) && fin(km.meta) && km.v < km.meta) {
      E.push("Generación de oportunidades: sostener el margen de seguridad arriba de la meta con prospección dirigida a oportunidades mayores a $20 mil.");
      plan("Generar oportunidades nuevas mayores a $20 mil por cartera", "Margen de seguridad", `≥ ${fmtX(km.meta)}`);
    }
    if (fin(kp.v) && fin(kp.meta) && kp.v < kp.meta * 0.8) {
      H.push({ sev: kp.v < 0.6 ? "alto" : "medio", titulo: `Vaciado de pendientes por surtir en ${fmtP(kp.v)}`,
        texto: `Hay ${fmtM(kpm.v)} disponibles para facturar, equivalentes a ${fmtP(div(kpm.v, c.per.meta / c.L.length))} de la meta mensual. Es venta que ya está ganada y que se puede facturar sin vender más.` });
      E.push("Pendientes por surtir: vaciado diario de lo disponible, con responsable por cartera y revisión de pedidos detenidos por crédito, documentación o logística.");
      plan("Vaciado diario de pendientes disponibles por facturar y reporte de bloqueos", "% de vaciado de pendientes", `≥ 90% del disponible`, 15);
    }
    // 4. Carteras
    const cart = tablaDim("cartera", Lac).filter((x) => x.meta > 0);
    const peores = [...cart].sort((x, y) => x.desv - y.desv).slice(0, 3);
    const defTot = cart.filter((x) => x.desv < 0).reduce((s, x) => s + x.desv, 0);
    const rez = cart.filter((x) => x.cumpl < 0.5 && x.meta > 500000);
    if (peores.length) {
      const sp = peores.reduce((s, x) => s + x.desv, 0);
      H.push({ sev: div(sp, defTot) > 0.4 ? "alto" : "medio", titulo: `Tres carteras explican ${fmtP(div(sp, defTot))} del déficit acumulado`,
        texto: `${peores.map((x) => `${x.k} ${x.n} (${fmtM(x.desv)}, ${fmtP(x.cumpl)})`).join("; ")}.${rez.length ? ` Además, ${rez.length} carteras con meta relevante van debajo de 50%: ${rez.map((x) => `${x.k} ${x.n.split(" ")[0]} ${fmtP(x.cumpl)}`).join(", ")}.` : ""}` });
      E.push(`Carteras: plan de recuperación individual para ${peores.map((x) => x.k + " " + x.n.split(" ")[0]).join(", ")}, con meta de recuperación mensual y revisión quincenal con el gerente.`);
      peores.forEach((x) => plan(`Plan de recuperación de la cartera ${x.k} ${x.n}: cuentas objetivo, pipeline mínimo y seguimiento quincenal`, `Cumplimiento ${x.k}`, `De ${fmtP(x.cumpl)} a ${fmtP(Math.min(1, (x.cumpl || 0) + 0.1))} acumulado`, 45));
    }
    // 5. Líneas
    const lin = tablaDim("linea", Lac).filter((x) => x.meta > 0);
    const tl = lin.reduce((s, x) => s + Math.max(0, x.log), 0);
    const top = [...lin].sort((x, y) => y.log - x.log)[0];
    const lPeores = [...lin].sort((x, y) => x.desv - y.desv).slice(0, 3);
    const sinVenta = lin.filter((x) => x.cumpl < 0.3 && x.meta > 500000);
    if (top) H.push({ sev: div(top.log, tl) > 0.5 ? "alto" : "medio", titulo: `${top.n} concentra ${fmtP(div(top.log, tl))} de la venta`,
      texto: `Las líneas con mayor desviación son ${lPeores.map((x) => `${x.n} (${fmtM(x.desv)}, ${fmtP(x.cumpl)})`).join(", ")}.${sinVenta.length ? ` Con meta pero casi sin venta: ${sinVenta.map((x) => `${x.n} ${fmtP(x.cumpl)}`).join(", ")}.` : ""} La dependencia de una sola marca hace que cualquier caída en ella mueva todo el resultado.` });
    if (lPeores.length) {
      E.push(`Portafolio: definir pipeline mínimo por marca para ${lPeores.map((x) => x.n).join(", ")}${sinVenta.length ? ` y decidir si las metas de ${sinVenta.map((x) => x.n).join(", ")} siguen vigentes o se reasignan` : ""}.`);
      plan(`Pipeline mínimo y responsables por marca para ${lPeores.map((x) => x.n).join(", ")}`, "Venta por línea", "Cerrar 20% de la brecha de cada línea en el trimestre", 60);
    }
    // 6. Clientes
    const cl = clientesDe(a, m);
    if (cl && cl.datos.retencion) {
      const x = cl.datos;
      const caida = x.trim_ant && x.trim_ult ? x.trim_ult.clientes - x.trim_ant.clientes : null;
      H.push({ sev: x.retencion.pct_cli < 0.6 ? "alto" : "medio", titulo: `Retención de clientes en ${fmtP(x.retencion.pct_cli)} (${fmtP(x.retencion.pct_monto)} del monto)`,
        texto: `${x.perdida?.clientes ?? "—"} clientes dejaron de comprar (${fmtM(-Math.abs(x.venta_perdida || 0))}) y la venta disminuida suma ${fmtM(x.venta_disminuida)}; la ganancia y la venta nueva no compensan del todo${fin(caida) ? `. Clientes activos: ${x.trim_ult.clientes} (${caida >= 0 ? "+" : ""}${caida} vs el trimestre anterior)` : ""}. Principales clientes perdidos o a la baja: ${[...(x.listas?.disminuida || []).slice(0, 3), ...(x.listas?.perdida || []).slice(0, 2)].map((z) => z.cliente).join(", ")}.` });
      E.push("Clientes: campaña de recuperación de los principales clientes perdidos y disminuidos, con visita del vendedor y del gerente en los 10 de mayor monto.");
      plan("Visitar y diagnosticar los 10 clientes con mayor venta perdida o disminuida", "Retención de clientes (monto)", `≥ ${fmtP(Math.min(0.7, x.retencion.pct_monto + 0.07))}`, 45);
    }
    // 7. Crecimiento
    if (c.acumAnt && c.acumAnt.log) {
      const cr = c.acum.log / c.acumAnt.log - 1, crP = c.perAnt && c.perAnt.log ? c.per.log / c.perAnt.log - 1 : null;
      H.push({ sev: cr < 0 ? "alto" : "medio", titulo: `Crecimiento acumulado ${fmtPs(cr, 1)} contra ${a - 1}`,
        texto: `El acumulado ${cr >= 0 ? "sí supera" : "queda debajo de"} ${a - 1}${fin(crP) ? `, pero ${esc(c.etiqueta)} quedó ${fmtPs(crP, 1)} contra el mismo periodo del año pasado` : ""}. La meta ${a} pedía crecer ${fmtP(div(c.mAnual, S.totAnt) - 1, 0)} sobre ${a - 1}, así que crecer ${fmtPs(cr, 1)} no es suficiente.` });
    }
    // 8. Pronóstico
    const [Na, Nm] = m === 12 ? [a + 1, 1] : [a, m + 1];
    const metaN = tot(Na, Nm)?.meta;
    if (fin(metaN)) {
      const r = div(prom, metaN);
      H.push({ sev: r < 0.8 ? "alto" : "medio", titulo: `${MESES[Nm - 1]} arranca con meta de ${fmtM(metaN)}`,
        texto: `Con el promedio mensual del año (${fmtM(prom)}) se llegaría a ${fmtP(r)}. Lo disponible por facturar (${fmtM(kpm.v)}) y el pipeline (${fmtM(kc.v)}) son la palanca de corto plazo.` });
    }
    if (restantes && S.pctNec > 1.1) {
      E.push(`Meta: acordar con dirección un objetivo de cierre ${a} realista (por ejemplo ${fmtM(cierreRitmo)} al ritmo actual, o el escenario que se defina en el simulador) y medir cada junta la recuperación contra ese objetivo.`);
      plan(`Acordar objetivo de cierre ${a} y meta de recuperación mensual`, "Cumplimiento acumulado", `Definir en la junta`, 7);
    }
    const ord = { critico: 0, alto: 1, medio: 2 };
    H.sort((x, y) => ord[x.sev] - ord[y.sev]);
    const crit = H.filter((h) => h.sev === "critico").length;
    const situacion = `Al cierre de ${MESES[m - 1]} ${a}, ISEL acumula ${fmtM(c.acum.log)}, ${fmtP(cumA)} de la meta a la fecha y ${fmtP(avance)} de la meta anual, con un déficit de ${fmtM(Math.abs(c.acum.log - c.acum.meta))} que ${d.delta < 0 ? "se sigue ampliando" : "empezó a reducirse"}. ${c.acumAnt && c.acumAnt.log ? `La venta crece ${fmtPs(c.acum.log / c.acumAnt.log - 1, 1)} contra ${a - 1}, insuficiente para la meta planteada. ` : ""}Los indicadores apuntan a que la brecha se origina sobre todo en la conversión del pipeline${fin(kp.v) && kp.v < 0.8 ? " y en el vaciado de pendientes por surtir" : ""}, más que en la falta de oportunidades. ${crit ? `Hay ${crit} ${crit === 1 ? "tema crítico" : "temas críticos"} que requieren decisión en esta junta.` : ""}`;
    return { generado: new Date().toISOString(), periodo: c.clave, situacion, hallazgos: H, enfoque: E, plan: P.slice(0, 8) };
  }
  function sGeneral() {
    const c = ctx();
    G.analisis = G.analisis || {};
    let A = G.analisis[c.clave];
    if (!A) { A = generarAnalisis(); if (esAdmin()) { G.analisis[c.clave] = A; guardar(); } }
    const fechaGen = new Date(A.generado).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
    const hall = A.hallazgos.map((h, i) => `<div class="hallazgo ${SEV[h.sev]?.[1] || "na"}"><div class="hallazgo-cab"><select class="estado-sel" data-an="hallazgos" data-i="${i}" data-campo="sev" aria-label="Severidad">${Object.entries(SEV).map(([k, [t]]) => `<option value="${k}" ${h.sev === k ? "selected" : ""}>${t}</option>`).join("")}</select>
        <input class="campo titulo" data-an="hallazgos" data-i="${i}" data-campo="titulo" value="${esc(h.titulo)}" aria-label="Título del hallazgo"><button class="restaurar" data-an-borrar="hallazgos" data-i="${i}" type="button" title="Quitar">✕</button></div>
        <textarea class="campo" data-an="hallazgos" data-i="${i}" data-campo="texto" rows="${filasTxt(h.texto, 140)}" aria-label="Detalle">${esc(h.texto)}</textarea></div>`).join("");
    const enf = A.enfoque.map((t, i) => `<li><textarea class="campo" data-an="enfoque" data-i="${i}" rows="${filasTxt(t, 120)}" aria-label="Sugerencia ${i + 1}">${esc(t)}</textarea><button class="restaurar" data-an-borrar="enfoque" data-i="${i}" type="button" title="Quitar">✕</button></li>`).join("");
    const plan = `<div class="tabla-wrap" style="max-height:none"><table class="t compromisos"><thead><tr><th>#</th><th>Acción</th><th>Responsable</th><th>Fecha</th><th>Indicador</th><th>Meta / resultado esperado</th><th>Estado</th><th></th></tr></thead><tbody>
      ${A.plan.map((p, i) => `<tr><td class="mono">${i + 1}</td><td style="min-width:280px"><textarea rows="${filasTxt(p.accion, 45)}" data-an="plan" data-i="${i}" data-campo="accion" aria-label="Acción">${esc(p.accion)}</textarea></td><td><input data-an="plan" data-i="${i}" data-campo="responsable" value="${esc(p.responsable)}" aria-label="Responsable"></td><td><input type="date" data-an="plan" data-i="${i}" data-campo="fecha" value="${esc(p.fecha)}" aria-label="Fecha"></td><td style="min-width:160px"><textarea rows="${filasTxt(p.indicador, 22)}" data-an="plan" data-i="${i}" data-campo="indicador" aria-label="Indicador">${esc(p.indicador)}</textarea></td><td style="min-width:180px"><textarea rows="${filasTxt(p.meta, 30)}" data-an="plan" data-i="${i}" data-campo="meta" aria-label="Meta">${esc(p.meta)}</textarea></td>
      <td><select class="estado-sel ${p.estado}" data-an="plan" data-i="${i}" data-campo="estado" aria-label="Estado">${ESTADOS.map(([v, t]) => `<option value="${v}" ${p.estado === v ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td style="white-space:nowrap"><button class="btn chico" data-an-comp="${i}" type="button" title="Agregar a los compromisos de la junta">→ Compromiso</button> <button class="restaurar" data-an-borrar="plan" data-i="${i}" type="button" title="Quitar">✕</button></td></tr>`).join("")}</tbody></table></div>`;
    return seccion("general", "Análisis general de ISEL", `Situación al cierre de ${MESES[c.Jm - 1]} ${c.Ja}: lo más crítico, enfoque y plan`,
      `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span class="nota-pie" style="margin:0">Borrador generado el ${esc(fechaGen)} con todos los datos disponibles. Todo es editable y se guarda al escribir.</span>
        <span style="margin-left:auto;display:flex;gap:8px"><button class="btn chico" data-copiar="b-general-texto" type="button">Copiar resumen</button><button class="btn chico ${UI.confirmar === "an" ? "peligro" : ""}" data-an-regenerar type="button">${UI.confirmar === "an" ? "Confirmar: reemplazar lo editado" : "Regenerar con datos actuales"}</button></span></div>
      <div><div class="sub">Situación general</div><textarea class="campo" data-an="situacion" rows="${filasTxt(A.situacion, 150) + 1}" id="an-situacion" aria-label="Situación general">${esc(A.situacion)}</textarea></div>
      <div><div class="sub">Hallazgos ordenados por importancia <span class="der"><button class="btn chico" data-an-nuevo="hallazgos" type="button">+ Hallazgo</button></span></div><div class="hallazgos">${hall}</div></div>
      <div><div class="sub">Sugerencias de enfoque <span class="der"><button class="btn chico" data-an-nuevo="enfoque" type="button">+ Sugerencia</button></span></div><ol class="enfoque">${enf}</ol></div>
      <div><div class="sub">Plan de acción propuesto <span class="der"><button class="btn chico" data-an-nuevo="plan" type="button">+ Acción</button></span></div>${plan}<p class="nota-pie">→ Compromiso copia la acción a los compromisos de la junta de ${MESES[c.Jm - 1]} (bloque 08).</p></div>
      <div id="b-general-texto" hidden>${esc(textoAnalisis(A))}</div>`);
  }
  function textoAnalisis(A) {
    const c = ctx();
    return [`ANÁLISIS GENERAL ISEL · ${MESES[c.Jm - 1]} ${c.Ja}`, "", "Situación general", A.situacion, "", "Hallazgos",
      ...A.hallazgos.map((h, i) => `${i + 1}. [${SEV[h.sev]?.[0] || h.sev}] ${h.titulo}\n   ${h.texto}`), "", "Sugerencias de enfoque", ...A.enfoque.map((t, i) => `${i + 1}. ${t}`), "", "Plan de acción",
      ...A.plan.map((p, i) => `${i + 1}. ${p.accion} | Resp.: ${p.responsable || "—"} | ${p.fecha || "—"} | ${p.indicador}: ${p.meta}`)].join("\n");
  }

  function sTipo() {
    const c = ctx(), C = colores();
    const s = snapshot("tipoCliente", c.Ja, c.Jm);
    if (!s) return seccion("tipo", "Tipo de cliente", "", `<div class="aviso info">Sin datos.</div>`);
    const op = s.datos.map((x) => ({ v: x.clave, t: x.clave }));
    registrarMs("tipo-sel", op);
    const L = s.datos.filter((x) => pasa("tipo-sel", x.clave)).sort((a, b) => b.monto - a.monto);
    const T = L.reduce((t, x) => t + x.monto, 0);
    chart("g-tipo", { type: "bar", data: { labels: L.map((x) => x.clave), datasets: [{ label: "Venta neta", data: L.map((x) => x.monto), backgroundColor: C.s4 }] }, options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${fmt$(x.parsed.x)} · ${fmtP(x.parsed.x / T, 1)}` } } }, scales: { x: ejeM(), y: { grid: { display: false } } } } });
    return seccion("tipo", "Tipo de cliente", `Venta acumulada por clasificación de cliente al cierre de ${MESES[s.m - 1]} ${s.a}`,
      `<div class="sub" style="margin:0">${ms("tipo-sel", op, "Clasificación")}</div><div class="grid2"><div class="graf"><canvas id="g-tipo" role="img" aria-label="Venta por tipo de cliente"></canvas></div>
      <div class="tabla-wrap"><table class="t"><thead><tr><th>Clasificación</th><th class="n">Venta neta</th><th class="n">Part.</th></tr></thead><tbody>${L.map((x) => `<tr><td class="mono">${esc(x.clave)}</td><td class="n">${fmt$(x.monto)}</td><td class="n">${fmtP(x.monto / T, 1)}</td></tr>`).join("")}</tbody><tfoot><tr><td>Total</td><td class="n">${fmt$(T)}</td><td class="n">100%</td></tr></tfoot></table></div></div>
      <p class="nota-pie">Claves de clasificación de SAE (UF, UFE, IN, DAR…). "(sin clasificar)": clientes sin clave en el catálogo.</p>`);
  }


  /* ===================================================================== */
  /*                                 DATOS                                  */
  /* ===================================================================== */
  function vistaDatos() {
    const ediciones = [];
    for (const [k, e] of Object.entries(G.ed.h)) { const [a, m, d, ...cl] = k.split("-"); const r = IDX.h.get(k); ediciones.push({ tipo: "h", k, txt: `${MC[m - 1]} ${a} · ${DIMS[d] || "Total"} · ${r ? r.n : cl.join("-")}`, campos: Object.keys(e).map((c) => `${c === "log" ? "venta" : c}: ${fmt$(e[c])}`).join(" · ") }); }
    for (const [k, e] of Object.entries(G.ed.k)) { const [a, m, ...kk] = k.split("-"); ediciones.push({ tipo: "k", k, txt: `${MC[m - 1]} ${a} · ${KPI_DEF[kk.join("-")]?.n || kk.join("-")}`, campos: Object.entries(e).map(([c, v]) => `${c === "v" ? "valor" : c}: ${v}`).join(" · ") }); }
    for (const [k, e] of Object.entries(G.ed.c)) ediciones.push({ tipo: "c", k, txt: `Clientes ${k}`, campos: Object.entries(e).map(([c, v]) => `${c}: ${v}`).join(" · ") });
    for (const [k, e] of Object.entries(G.ed.s)) ediciones.push({ tipo: "s", k, txt: `Semana ${k}`, campos: Object.entries(e).map(([c, v]) => `${c}: ${fmt$(v)}`).join(" · ") });
    const W = (BASE.semanal || []).filter((w) => w.a === ctx().Ja);
    const semTabla = `<div class="tabla-wrap"><table class="t"><thead><tr><th>Semana</th><th>Fecha</th><th class="n">Meta acumulada</th><th class="n">Venta acumulada</th><th class="n">Déficit</th></tr></thead><tbody>
      ${W.map((w) => { const e = G.ed.s[`${w.a}-${w.s}`] || {}; const va = fin(e.venta_acum) ? e.venta_acum : w.venta_acum, ma = fin(e.meta_acum) ? e.meta_acum : w.meta_acum; return `<tr><td class="mono">S${w.s}</td><td class="mono">${w.fecha}</td>${UI.modoEdicion ? celdaNum("s", `${w.a}-${w.s}`, "meta_acum", ma, fin(e.meta_acum)) + celdaNum("s", `${w.a}-${w.s}`, "venta_acum", va, fin(e.venta_acum)) : `<td class="n">${fmt$(ma)}</td><td class="n">${fmt$(va)}</td>`}<td class="n ${va - ma < 0 ? "neg" : "pos"}">${fin(va) ? fmt$(va - ma) : "—"}</td></tr>`; }).join("")}</tbody></table></div>`;
    const fuentes = `<div class="tabla-wrap" style="max-height:none"><table class="t"><tbody>${(BASE.fuentes || []).map((f) => `<tr><td>${esc(f.tipo)}</td><td class="mono">${esc(f.archivo)}</td></tr>`).join("")}</tbody></table></div>`;
    if (!esAdmin()) return `<section class="bloque"><header><h2>Datos de la página</h2><span class="pregunta">De dónde vienen las cifras</span></header><div class="bloque-cuerpo"><div class="sub">Fuentes en uso</div>${fuentes}<p class="nota-pie">Actualizado: ${BASE.generado ? new Date(BASE.generado).toLocaleString("es-MX") : "—"}. El administrador carga los reportes cada mes.</p></div></section>`;
    return `<section class="bloque"><header><h2>Datos de la página</h2><span class="pregunta">Fuentes, actualización mensual y respaldo</span></header><div class="bloque-cuerpo">
      <div class="grid2"><div><div class="sub">Cargar reportes de Excel</div>${NUBE ? `<div class="aviso info" style="margin-bottom:10px">Lo que cargues aquí se guarda en el servidor y todos los usuarios lo verán.</div>` : ""}
        <p style="margin:0 0 10px">Cada mes selecciona el <b>Resultado de ventas</b> del año y el <b>Tablero ISEL</b> actualizados (.xlsm o .xlsx). La página reconoce cada archivo por sus hojas y reemplaza solo lo que trae ese archivo; lo demás se conserva.</p>
        <p style="margin:0 0 10px">Agrega también el reporte <b>Estadísticas de facturas</b> de Odoo (Contabilidad → Reportes, exportado a Excel con todas las columnas). Con él la página detecta las facturas re-fechadas o canceladas que afectaron cada cierre (bloque 09) y arma el análisis de clientes por cartera. ${BASE.facturas ? `<b>Cargado:</b> ${BASE.facturas.docs.length.toLocaleString("es-MX")} documentos del ${esc(BASE.facturas.desde)} al ${esc(BASE.facturas.hasta)}.` : ""}</p>
        <p style="margin:0 0 10px">Si no tienes ese reporte, sirve cualquier <b>reporte de ventas por cliente</b> de SAE u Odoo (Excel o CSV) con columnas de <b>fecha</b>, <b>cliente</b>, <b>cartera o vendedor</b> e <b>importe</b> (venta neta, subtotal o importe). Puede abarcar varios meses; se reemplazan solo los meses que trae. ${hayVC() ? `<b>Cargado:</b> ${new Set(vcFilas().map((f) => f[2])).size} clientes, ${new Set(vcFilas().map((f) => f[0] * 100 + f[1])).size} meses.` : ""}</p>
        <details id="sin-fecha-det"><summary class="campo-label" style="cursor:pointer">Si el reporte de clientes no trae fecha</summary><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><label for="mes-sin-fecha" style="font-size:13px">Todo el archivo corresponde a</label><select class="campo" id="mes-sin-fecha" style="width:auto">${MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === ctx().Jm ? "selected" : ""}>${n}</option>`).join("")}</select><select class="campo" id="anio-sin-fecha" style="width:auto">${[...new Set([...IDX.anios, hoy.getFullYear()])].map((a) => `<option ${a === ctx().Ja ? "selected" : ""}>${a}</option>`).join("")}</select></div></details>
        <label class="btn prim" for="archivos-excel" style="width:max-content">Elegir archivos de Excel</label>
        <input type="file" id="archivos-excel" accept=".xlsx,.xlsm,.xls,.csv" multiple hidden>
        <p class="nota-pie" id="estado-carga">Las cifras se leen tal como quedaron calculadas la última vez que se guardó el Excel.</p>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:6px"><input type="checkbox" id="limpiar-ed" checked> Al cargar, descartar las cifras modificadas a mano de los años que traiga el archivo</label>
      </div><div><div class="sub">Fuentes en uso</div>
        <div class="tabla-wrap" style="max-height:none"><table class="t"><tbody>${(BASE.fuentes || []).map((f) => `<tr><td>${esc(f.tipo)}</td><td class="mono">${esc(f.archivo)}</td></tr>`).join("")}</tbody></table></div>
        <p class="nota-pie">Actualizado: ${BASE.generado ? new Date(BASE.generado).toLocaleString("es-MX") : "—"}${G_BASE_LOCAL ? " · con archivos cargados en este navegador" : ""}.</p>
        ${G_BASE_LOCAL && !NUBE ? `<button class="btn chico peligro" data-base-reset type="button">${UI.confirmar === "base" ? "Confirmar: volver a los datos originales" : "Volver a los datos originales de la página"}</button>` : ""}</div></div>
      <div class="grid2"><div><div class="sub">Respaldo de compromisos, notas y cambios</div>
        <p style="margin:0 0 10px">${NUBE ? "Los compromisos, notas, campañas y cambios se guardan en el servidor. El respaldo sirve para conservar una copia o para traer lo capturado en la versión anterior de la página (se suma a lo que ya existe)." : "Todo lo que escribes se guarda en este navegador. Para usarlo en otra computadora, o para no perderlo, descarga un respaldo y cárgalo allá."}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn prim" data-exportar type="button">Descargar respaldo</button><button class="btn" data-copiar-resp type="button">Copiar respaldo</button><label class="btn" for="archivo-resp">Cargar respaldo</label><input type="file" id="archivo-resp" accept=".json" hidden></div>
        <textarea class="respaldo" id="resp-texto" placeholder="También puedes pegar aquí el texto de un respaldo y presionar Cargar texto." style="margin-top:10px"></textarea>
        <div style="display:flex;gap:8px;margin-top:6px"><button class="btn chico" data-importar-txt type="button">Cargar texto</button></div>
      </div><div><div class="sub">Cifras modificadas a mano (${ediciones.length})</div>
        ${ediciones.length ? `<div class="tabla-wrap"><table class="t"><tbody>${ediciones.map((e) => `<tr><td>${esc(e.txt)}<div class="cod" style="margin:0">${esc(e.campos)}</div></td><td><button class="btn chico" data-ed-quitar="${e.tipo}|${esc(e.k)}" type="button">Restaurar</button></td></tr>`).join("")}</tbody></table></div>
        <button class="btn chico peligro" data-ed-todo type="button" style="margin-top:8px">${UI.confirmar === "ed" ? "Confirmar: restaurar todas" : "Restaurar todas las cifras"}</button>` : `<div class="vacio">Ninguna. Activa <b>Modificar cifras</b> para cambiar metas, ventas e indicadores.</div>`}</div></div>
      <div><div class="sub">Avance semanal ${ctx().Ja} (Tablero ISEL) ${UI.modoEdicion ? "" : '<span class="der">Activa Modificar cifras para editar</span>'}</div>${W.length ? semTabla : '<div class="vacio">Sin datos semanales para este año.</div>'}</div>
    </div></section>`;
  }

  /* ===================================================================== */
  /*                                 RENDER                                 */
  /* ===================================================================== */
  let G_BASE_LOCAL = false;
  function cabecera() {
    const anios = IDX.anios;
    const L = periodoMeses();
    const opMes = MESES.map((n, i) => `<option value="${i + 1}" ${P.mes === i + 1 ? "selected" : ""}>${n}${i + 1 > cerrado(P.anio) && P.anio >= hoy.getFullYear() ? " (sin cierre)" : ""}</option>`).join("");
    const ctrl = {
      mes: `<select id="p-mes" aria-label="Mes">${opMes}</select>`,
      trim: `<select id="p-trim" aria-label="Trimestre">${[1, 2, 3, 4].map((q) => `<option value="${q}" ${P.trim === q ? "selected" : ""}>Trimestre ${q}</option>`).join("")}</select>`,
      sem: `<select id="p-sem" aria-label="Semestre">${[1, 2].map((q) => `<option value="${q}" ${P.sem === q ? "selected" : ""}>Semestre ${q}</option>`).join("")}</select>`,
      anio: "",
      rango: `<label for="p-desde">Del</label><input type="date" id="p-desde" value="${P.desde}"><label for="p-hasta">al</label><input type="date" id="p-hasta" value="${P.hasta}">`,
    };
    return `<header class="top"><div class="top-in"><div class="marca"><strong>ISEL</strong><span>Junta mensual de resultados de ventas</span></div>
      <nav class="tabs" role="tablist">${[["junta", "Junta mensual"], ["analisis", "Análisis adicional"], ["campanas", "Campañas"], ["datos", "Datos"], ...(NUBE && esAdmin() ? [["usuarios", "Usuarios"]] : [])].map(([v, t]) => `<button class="tab" role="tab" data-tab="${v}" aria-selected="${UI.tab === v}">${t}</button>`).join("")}</nav>
      ${esAdmin() ? `<button class="chip-btn" data-modo-ed aria-pressed="${UI.modoEdicion}" type="button">${UI.modoEdicion ? "✎ Modificando cifras" : "✎ Modificar cifras"}</button>` : `<span class="chip-rol">Solo lectura</span>`}
      <button class="chip-btn" data-tendencias aria-pressed="${G.prefs.tendencias !== false}" type="button" title="Mostrar u ocultar las líneas de tendencia">↗ Tendencias</button>
      <button class="chip-btn" data-tema type="button" title="Cambiar tema claro / oscuro">◐</button>
      ${NUBE && YO ? `<span class="usuario-top"><span title="${esc(YO.email)}">${esc(YO.nombre || YO.email)}</span>${esAdmin() ? `<span id="estado-sync" data-e="${SYNC.estado}">${{ pendiente: "Guardando…", ok: "Guardado", error: "Sin guardar · reintentar" }[SYNC.estado]}</span>` : ""}<button class="chip-btn" type="button" data-mi-pass title="Cambiar mi contraseña">Contraseña</button><button class="chip-btn" type="button" data-salir>Salir</button></span>` : ""}</div>
      <div class="periodo"><div class="periodo-in"><label>Periodo</label>
        <div class="seg" role="group">${[["mes", "Mes"], ["trim", "Trimestre"], ["sem", "Semestre"], ["anio", "Año"], ["rango", "Personalizado"]].map(([v, t]) => `<button type="button" data-ptipo="${v}" aria-pressed="${P.tipo === v}">${t}</button>`).join("")}</div>
        ${P.tipo !== "rango" ? `<select id="p-anio" aria-label="Año">${anios.map((a) => `<option ${P.anio === a ? "selected" : ""}>${a}</option>`).join("")}</select>` : ""}${ctrl[P.tipo]}
        <span class="periodo-resumen">${esc(etiquetaPeriodo(L))} · ${L.length} ${L.length === 1 ? "mes" : "meses"} · vs ${esc(etiquetaPeriodo(anteriorDe(L)).replace(/^(T\d|S\d|Año) · /, ""))}</span></div></div></header>`;
  }
  function indice(lista, pref) {
    return `<nav class="indice" aria-label="Bloques">${lista.map(([id, n, t, q]) => `<a href="#b-${id}" data-ir="${id}"><b>${n}</b><span>${t}</span>${q ? `<small>${q}</small>` : ""}</a>`).join("")}</nav>`;
  }
  const BLOQ_FN = [bSeguimiento, bMarcador, bTendencia, bContribucion, bDiagnostico, bSalud, bPortafolio, bPronostico, bAccion, bOtros];
  const SECC_FN = [sGeneral, sHistorico, sAnual, sCalor, sMezcla, sConcentracion, sClientes, sTipo, sSimulador];
  const listaFoco = () => (UI.tab === "junta" ? BLOQUES.map((b, i) => ({ id: b[0], n: b[1], t: b[2], fn: BLOQ_FN[i] })) : UI.tab === "campanas" ? CAMP_SECC.map(([id, n, t, fn]) => ({ id, n, t, fn })) : SECC2.map((b, i) => ({ id: b[0], n: String.fromCharCode(65 + i), t: b[1], fn: SECC_FN[i] })));
  function botonAmpliar(id) {
    if (UI.foco) return "";
    return `<button class="btn chico ampliar" data-foco="${id}" type="button" title="Ver este módulo en grande">⤢ Ampliar</button>`;
  }
  function renderFoco() {
    const L = listaFoco(); const i = L.findIndex((x) => x.id === UI.foco);
    if (i < 0) { UI.foco = null; return false; }
    const x = L[i], ant = L[i - 1], sig = L[i + 1];
    const urlPestana = location.href.split("#")[0] + "#ver-" + x.id;
    let cuerpo;
    try { cuerpo = x.fn(); } catch (e) { console.error(e); cuerpo = `<div class="aviso">No se pudo armar este módulo: ${esc(e.message)}</div>`; }
    document.getElementById("app").innerHTML = `<div class="pres" role="dialog" aria-label="${esc(x.t)} en grande">
      <div class="pres-barra">
        <button class="btn chico" data-pres-ir="${ant ? ant.id : ""}" ${ant ? "" : "disabled"} type="button" title="Módulo anterior (←)">◀ ${ant ? esc(ant.t) : ""}</button>
        <span class="pres-titulo"><b>${x.n}</b> ${esc(x.t)} · <span class="mono">${esc(ctx().etiqueta)}</span></span>
        <button class="btn chico" data-pres-ir="${sig ? sig.id : ""}" ${sig ? "" : "disabled"} type="button" title="Módulo siguiente (→)">${sig ? esc(sig.t) : ""} ▶</button>
        <span class="pres-der">
          ${esAdmin() ? `<button class="btn chico" data-modo-ed aria-pressed="${UI.modoEdicion}" type="button">${UI.modoEdicion ? "✎ Modificando" : "✎ Modificar"}</button>` : ""}
          <button class="btn chico" data-pres-full type="button">${document.fullscreenElement ? "Salir de pantalla completa" : "⛶ Pantalla completa"}</button>
          ${window.SIN_DESCARGAS ? "" : `<a class="btn chico" href="${esc(urlPestana)}" target="_blank" rel="noopener">↗ Abrir en otra pestaña</a>`}
          <button class="btn chico prim" data-pres-cerrar type="button" title="Cerrar (Esc)">✕ Cerrar</button>
        </span>
      </div>
      <div class="pres-cuerpo">${cuerpo}</div></div>`;
    document.body.classList.add("en-pres");
    bloquearLector(document.getElementById("app"));
    return true;
  }
  function render() {
    CTX = null; PEND = [];
    if (UI.foco) {
      const sc = $(".pres") ? $(".pres").scrollTop : 0;
      const focoId0 = document.activeElement && document.activeElement.id;
      if (renderFoco()) {
        baseChart(); PEND.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
        $(".pres").scrollTop = sc;
        if (focoId0) { const el = document.getElementById(focoId0); if (el) el.focus(); }
        return;
      }
    }
    document.body.classList.remove("en-pres");
    const scroll = window.scrollY;
    const focoId = document.activeElement && document.activeElement.id;
    let cuerpo;
    try {
      if (UI.tab === "junta") cuerpo = `<div class="wrap">${indice(BLOQUES)}<main class="lienzo">${BLOQ_FN.map((f) => f()).join("")}</main></div>`;
      else if (UI.tab === "analisis") cuerpo = `<div class="wrap">${indice(SECC2.map(([id, t], i) => [id, String.fromCharCode(65 + i), t, ""]))}<main class="lienzo"><div class="aviso info">Información de apoyo que no forma parte del orden de la junta. Usa el mismo periodo de la barra superior.</div>${SECC_FN.map((f) => f()).join("")}</main></div>`;
      else if (UI.tab === "campanas") cuerpo = `<div class="wrap">${indice(CAMP_SECC.map(([id, n, t]) => [id, n, t, ""]))}<main class="lienzo">${CAMP_SECC.map((x) => x[3]()).join("")}</main></div>`;
      else if (UI.tab === "usuarios") cuerpo = `<div class="wrap sin-indice"><main class="lienzo">${vistaUsuarios()}</main></div>`;
      else cuerpo = `<div class="wrap sin-indice"><main class="lienzo">${vistaDatos()}</main></div>`;
    } catch (e) {
      console.error(e);
      cuerpo = `<div class="wrap sin-indice"><div class="aviso">No se pudo armar esta vista: ${esc(e.message)}. Revisa la pestaña Datos.</div></div>`;
    }
    document.getElementById("app").innerHTML = cabecera() + cuerpo;
    document.body.classList.toggle("editando", UI.modoEdicion);
    bloquearLector(document.getElementById("app"));
    baseChart();
    PEND.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    window.scrollTo(0, scroll);
    if (focoId) { const el = document.getElementById(focoId); if (el) { el.focus(); if (el.setSelectionRange && el.type === "search") el.setSelectionRange(el.value.length, el.value.length); } }
    marcarIndice();
  }
  function marcarIndice() {
    const links = $$(".indice a"); if (!links.length) return;
    let act = null;
    for (const a of links) { const s = document.getElementById("b-" + a.dataset.ir); if (s && s.getBoundingClientRect().top < 200) act = a; }
    links.forEach((a) => a.classList.toggle("activo", a === (act || links[0])));
  }
  window.addEventListener("scroll", () => requestAnimationFrame(marcarIndice), { passive: true });
  function cerrarFoco() {
    const id = UI.foco; UI.foco = null;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (location.hash.startsWith("#ver-")) try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    render();
    const s = document.getElementById("b-" + id); if (s) s.scrollIntoView({ block: "start" });
  }
  // Vuelve a dibujar un solo módulo (para controles que cambian muy seguido)
  function rerender(id, fn) {
    const el = document.getElementById("b-" + id);
    if (!el) { render(); return; }
    CTX = null; PEND = [];
    const foco = document.activeElement && document.activeElement.id;
    const tmp = document.createElement("div"); tmp.innerHTML = fn();
    const nuevo = tmp.firstElementChild; el.replaceWith(nuevo); bloquearLector(nuevo);
    PEND.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    if (foco) { const x = document.getElementById(foco); if (x) x.focus(); }
  }
  let resizeT = null;
  window.addEventListener("resize", () => { if (!UI.foco) return; clearTimeout(resizeT); resizeT = setTimeout(render, 250); });
  document.addEventListener("fullscreenchange", () => { if (UI.foco) render(); });

  /* ------------------------------------------------------------ eventos */
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, a, label") || ev.target;
    const d = t.dataset || {};
    if ("salir" in d) { salir(); return; }
    if ("seguir" in d) { actividad(); return; }
    if ("recargarBase" in d) { recargarBase(); return; }
    if ("miPass" in d) { pantallaCambio(false); return; }
    if ("cancelarCambio" in d) { arrancar(); return; }
    if (!esAdmin() && esEdicion(d)) { toast("Tu acceso es de solo lectura."); return; }
    if (d.tendencias !== undefined) { G.prefs.tendencias = G.prefs.tendencias === false; guardar(); render(); return; }
    if (UI.tab === "usuarios" && eventosUsuarios(ev, "click")) return;
    if ((UI.tab === "campanas" || UI.foco) && eventosCampana(ev, "click")) return;
    // Cerrar selector abierto al hacer clic fuera
    if (UI.abierto && !ev.target.closest(".ms")) { UI.abierto = null; render(); return; }
    if (d.tab) { UI.tab = d.tab; window.scrollTo(0, 0); render(); return; }
    if (d.foco) { UI.foco = d.foco; UI.scrollAntes = window.scrollY; render(); return; }
    if (d.presIr) { UI.foco = d.presIr; render(); $(".pres").scrollTop = 0; return; }
    if ("presCerrar" in d) { cerrarFoco(); return; }
    if ("presFull" in d) { const de = document.documentElement; const p = document.fullscreenElement ? document.exitFullscreen() : de.requestFullscreen ? de.requestFullscreen() : null; if (p && p.catch) p.catch(() => toast("Este navegador no permite pantalla completa aquí; usa F11 o abre el módulo en otra pestaña.")); else if (!p) toast("Este navegador no permite pantalla completa aquí."); return; }
    if (d.simRef) { UI.vistas["sim-pct"] = d.simRef; rerender("simulador", sSimulador); return; }
    if ("anRegenerar" in d) { if (UI.confirmar === "an") { G.analisis[ctx().clave] = generarAnalisis(); UI.confirmar = null; guardar(); toast("Análisis regenerado"); } else UI.confirmar = "an"; render(); return; }
    if (d.anNuevo) { const A = G.analisis[ctx().clave]; if (d.anNuevo === "hallazgos") A.hallazgos.push({ sev: "medio", titulo: "Nuevo hallazgo", texto: "" }); else if (d.anNuevo === "enfoque") A.enfoque.push(""); else A.plan.push({ accion: "", responsable: "", fecha: "", indicador: "", meta: "", estado: "pendiente" }); guardar(); render(); return; }
    if (d.anBorrar) { const A = G.analisis[ctx().clave]; A[d.anBorrar].splice(+d.i, 1); guardar(); render(); return; }
    if (d.anComp) { const c = ctx(), p0 = G.analisis[c.clave].plan[+d.anComp]; const n = G.compromisos.filter((x) => x.junta === c.clave).length + 1; G.compromisos.push({ id: uid(), junta: c.clave, prioridad: n, problema: "", accion: p0.accion, responsable: p0.responsable, fecha: p0.fecha, indicador: p0.indicador, esperado: p0.meta, estado: "pendiente", avance: 0, seguimiento: "" }); guardar(); toast(`Agregado a los compromisos de la junta ${MC[c.Jm - 1]} ${c.Ja}`); return; }
    if (d.ptipo) { P.tipo = d.ptipo; if (P.tipo === "rango" && !P.desde) { const L = periodoMeses(); P.desde = `${P.anio}-01-01`; P.hasta = isoLocal(new Date(P.anio, P.mes, 0)); } render(); return; }
    if ("modoEd" in d) { UI.modoEdicion = !UI.modoEdicion; render(); return; }
    if ("tema" in d) { const r = document.documentElement; const osc = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; r.dataset.theme = osc ? "light" : "dark"; G.prefs.tema = r.dataset.theme; guardar(); render(); return; }
    if (d.ir) { ev.preventDefault(); const s = document.getElementById("b-" + d.ir); if (s) s.scrollIntoView(); return; }
    if (d.msBtn) { UI.abierto = UI.abierto === d.msBtn ? null : d.msBtn; render(); setTimeout(() => { const q = document.getElementById("msq-" + d.msBtn); if (q) q.focus(); }, 0); return; }
    if (d.msTodos) { delete UI.filtros[d.msTodos]; render(); return; }
    if (d.msNinguno) { UI.filtros[d.msNinguno] = []; render(); return; }
    if ("msCerrar" in d) { UI.abierto = null; render(); return; }
    if (d.vista) { UI.vistas[d.vista] = d.v; render(); return; }
    if (d.orden) { const cur = UI.orden[d.orden] || ""; UI.orden[d.orden] = cur === d.campo + ":d" ? d.campo + ":a" : d.campo + ":d"; render(); return; }
    if (d.rest) { aplicarEdicion(d.rest, d.clave, d.campo, ""); return; }
    if (d.copiar) { const el = document.getElementById(d.copiar); copiar(el ? el.innerText : ""); return; }
    if (d.igualar) { const [a, m] = d.igualar.split("-").map(Number); const sc = [...sumaDim("cartera", [[a, m]]).values()].reduce((s, x) => s + x.log, 0); aplicarEdicion("h", `${a}-${m}-total-total`, "log", String(Math.round(sc * 100) / 100)); return; }
    if ("kxNuevo" in d) { const J = junta(ctx().clave); (J.kpisExtra = J.kpisExtra || []).push({ n: "Nuevo indicador", v: "", meta: "" }); UI.modoEdicion = true; guardar(); render(); return; }
    if (d.kxBorrar) { const J = junta(ctx().clave); J.kpisExtra.splice(+d.kxBorrar, 1); guardar(); render(); return; }
    if (d.fcSem !== undefined) { const J = junta(ctx().clave); J.forecast = J.forecast || {}; if (d.fcSem) J.forecast.semaforo = d.fcSem; else delete J.forecast.semaforo; guardar(); render(); return; }
    if ("compNuevo" in d) { const c = ctx(); const n = G.compromisos.filter((x) => x.junta === c.clave).length + 1; G.compromisos.push({ id: uid(), junta: c.clave, prioridad: n, problema: "", accion: "", responsable: "", fecha: "", indicador: "", esperado: "", estado: "pendiente", avance: 0, seguimiento: "" }); guardar(); render(); setTimeout(() => { const f = $$('tr[data-comp] textarea[data-cf="accion"]'); const el = f.find((x) => x.value === ""); if (el) el.focus(); }, 30); return; }
    if ("sugerir" in d) { const c = ctx(); const ap = (UI.reglas || []).filter((r) => r.ap); if (!ap.length) { toast("El diagnóstico no marca ninguna causa este mes."); return; } let n = G.compromisos.filter((x) => x.junta === c.clave).length; ap.forEach((r) => G.compromisos.push({ id: uid(), junta: c.clave, prioridad: ++n, problema: r.ent, accion: r.accion, responsable: "", fecha: "", indicador: r.ind, esperado: "", estado: "pendiente", avance: 0, seguimiento: "" })); guardar(); render(); toast(`Se agregaron ${ap.length} compromisos sugeridos; completa responsable y fecha.`); return; }
    if (d.compBorrar) { if (UI.borrar === d.compBorrar) { G.compromisos = G.compromisos.filter((x) => x.id !== d.compBorrar); UI.borrar = null; guardar(); } else UI.borrar = d.compBorrar; render(); return; }
    if ("cancNueva" in d) { const J = junta(ctx().clave); J.canceladas.push({ folio: "", fecha: "", cliente: "", cartera: "", monto: "", motivo: "" }); guardar(); render(); return; }
    if (d.cancBorrar) { const J = junta(ctx().clave); J.canceladas.splice(+d.cancBorrar, 1); guardar(); render(); return; }
    if ("exportar" in d) { exportar(); return; }
    if ("copiarResp" in d) { copiar(JSON.stringify(respaldo())); return; }
    if ("importarTxt" in d) { try { importar(JSON.parse($("#resp-texto").value)); } catch (e) { toast("El texto no es un respaldo válido."); } return; }
    if (d.edQuitar) { const [tp, ...k] = d.edQuitar.split("|"); delete G.ed[tp][k.join("|")]; guardar(); indexar(); render(); return; }
    if ("edTodo" in d) { if (UI.confirmar === "ed") { G.ed = vacio().ed; UI.confirmar = null; guardar(); indexar(); toast("Cifras restauradas"); } else UI.confirmar = "ed"; render(); return; }
    if ("baseReset" in d) { if (UI.confirmar === "base") { try { localStorage.removeItem(LS_BASE); } catch (e) {} UI.confirmar = null; location.reload(); } else { UI.confirmar = "base"; render(); } return; }
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target, d = t.dataset;
    if (!esAdmin() && esEdicion(d)) return;
    if (UI.tab === "usuarios" && eventosUsuarios(ev, "change")) return;
    if (UI.tab === "campanas" && eventosCampana(ev, "change")) return;
    if (t.id === "p-anio") { P.anio = +t.value; if (P.mes > Math.max(cerrado(P.anio), 1) && P.anio < hoy.getFullYear()) P.mes = Math.min(P.mes, 12); render(); return; }
    if (t.id === "p-mes") { P.mes = +t.value; render(); return; }
    if (t.id === "p-trim") { P.trim = +t.value; render(); return; }
    if (t.id === "p-sem") { P.sem = +t.value; render(); return; }
    if (t.id === "p-desde" || t.id === "p-hasta") { P[t.id.slice(2)] = t.value; const L = periodoMeses(); P.anio = L[L.length - 1][0]; render(); return; }
    if (d.msOpt) { const id = d.msOpt; const todos = UI.msOpciones[id] || []; let f = UI.filtros[id] ? [...UI.filtros[id]] : [...todos]; if (t.checked) { if (!f.includes(t.value)) f.push(t.value); } else f = f.filter((x) => x !== t.value); UI.filtros[id] = f.length === todos.length ? undefined : f; if (!UI.filtros[id]) delete UI.filtros[id]; render(); return; }
    if (d.ed) { aplicarEdicion(d.ed, d.clave, d.campo, t.value.trim()); return; }
    if (d.kpi) { const c = ctx(); let v = t.value.trim(); if (v !== "" && d.u === "%") v = String(Number(v.replace("%", "")) / 100); aplicarEdicion("k", `${c.Ja}-${c.Jm}-${d.kpi}`, d.campo, v); return; }
    if (d.cli) { let v = t.value.trim(); if (v !== "" && d.tipo === "p") v = String(Number(v.replace("%", "")) / 100); aplicarEdicion("c", d.cli, d.ruta, v); return; }
    if (d.kx !== undefined) { const J = junta(ctx().clave); J.kpisExtra[+d.kx][d.campo] = t.value; guardar(); render(); return; }
    if (d.fc) { const J = junta(ctx().clave); J.forecast = J.forecast || {}; const v = Number(t.value.replace(/[$,\s]/g, "")); if (t.value.trim() === "") delete J.forecast[d.fc]; else if (fin(v)) J.forecast[d.fc] = v; guardar(); render(); return; }
    if (d.cliCart !== undefined) { G.cliCart = G.cliCart || {}; if (t.value) G.cliCart[d.cliCart] = t.value; else delete G.cliCart[d.cliCart]; guardar(); render(); return; }
    if (d.an && t.tagName === "SELECT") { const A = G.analisis[ctx().clave]; A[d.an][+d.i][d.campo] = t.value; guardar(); render(); return; }
    if (t.id === "mes-sin-fecha" || t.id === "anio-sin-fecha") return;
    if (d.cf === "estado") { const x = G.compromisos.find((z) => z.id === t.closest("tr").dataset.comp); if (x) { x.estado = t.value; if (t.value === "cumplido") x.avance = 100; guardar(); render(); } return; }
    if (d.cf === "avance") { render(); return; }
    if (t.id === "archivos-excel") { cargarExcel([...t.files]); return; }
    if (t.id === "archivo-resp") { const f = t.files[0]; if (!f) return; f.text().then((s) => importar(JSON.parse(s))).catch(() => toast("El archivo no es un respaldo válido.")); return; }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target, d = t.dataset;
    if (!esAdmin() && esEdicion(d)) return;
    if (UI.tab === "usuarios" && eventosUsuarios(ev, "input")) return;
    if (UI.tab === "campanas" && eventosCampana(ev, "input")) return;
    if (d.nota) { junta(ctx().clave).notas[d.nota] = t.value; guardar(); return; }
    if (d.juntaCampo) { junta(ctx().clave)[d.juntaCampo] = t.value; guardar(); return; }
    if (d.cf) { const x = G.compromisos.find((z) => z.id === t.closest("tr").dataset.comp); if (x) { x[d.cf] = d.cf === "avance" ? +t.value : t.value; if (d.cf === "avance") t.nextElementSibling.textContent = t.value + "%"; guardar(); } return; }
    if (d.canc !== undefined) { const J = junta(ctx().clave); J.canceladas[+d.canc][d.campo] = t.value; guardar(); return; }
    if (d.msQ) { UI.busq[d.msQ] = t.value; render(); return; }
    if (d.busq) { UI.busq[d.busq] = t.value; render(); return; }
    if ("sim" in d) { UI.vistas["sim-pct"] = t.value; rerender("simulador", sSimulador); return; }
    if (d.an) { const A = G.analisis[ctx().clave]; if (!A) return; if (d.an === "situacion") A.situacion = t.value; else if (d.an === "enfoque") A.enfoque[+d.i] = t.value; else A[d.an][+d.i][d.campo] = t.value; guardar(); return; }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && UI.abierto) { UI.abierto = null; render(); return; }
    if (UI.foco && !ev.target.closest("input, textarea, select")) {
      if (ev.key === "Escape") { cerrarFoco(); return; }
      const L = listaFoco(), i = L.findIndex((x) => x.id === UI.foco);
      if (ev.key === "ArrowRight" && L[i + 1]) { UI.foco = L[i + 1].id; render(); $(".pres").scrollTop = 0; }
      if (ev.key === "ArrowLeft" && L[i - 1]) { UI.foco = L[i - 1].id; render(); $(".pres").scrollTop = 0; }
    }
    if (ev.key === "Enter" && ev.target.matches("input.ed")) ev.target.blur();
  });

  function copiar(txt) {
    const ok = () => toast("Copiado al portapapeles");
    try { navigator.clipboard.writeText(txt).then(ok, () => respaldoManual(txt)); } catch (e) { respaldoManual(txt); }
  }
  function respaldoManual(txt) { const el = $("#resp-texto"); if (el) { el.value = txt; el.select(); toast("Selecciona y copia el texto del cuadro."); } else toast("No se pudo copiar."); }

  /* ----------------------------------------------------- respaldo */
  const respaldo = () => ({ app: "isel-junta-mensual", version: 2, fecha: new Date().toISOString(), ed: G.ed, juntas: G.juntas, compromisos: G.compromisos, analisis: G.analisis || {}, cliCart: G.cliCart || {}, campanas: G.campanas || {}, oport: G.oport || {}, config: G.config || {} });
  function exportar() {
    const txt = JSON.stringify(respaldo(), null, 1);
    if (window.SIN_DESCARGAS) { const el = $("#resp-texto"); if (el) { el.value = txt; el.select(); } copiar(txt); toast("Respaldo copiado. Pégalo en un archivo de texto para guardarlo."); return; }
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([txt], { type: "application/json" }));
      a.download = `respaldo-junta-isel-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      toast("Respaldo descargado");
    } catch (e) { /* sin descargas */ }
    const el = $("#resp-texto"); if (el) el.value = txt;
  }
  function importar(R) {
    if (!R || R.app !== "isel-junta-mensual") { toast("El archivo no es un respaldo de esta página."); return; }
    // Une compromisos por id y juntas por mes; las cifras modificadas del respaldo prevalecen
    const comp = new Map(G.compromisos.map((x) => [x.id, x]));
    (R.compromisos || []).forEach((x) => comp.set(x.id, x));
    G.compromisos = [...comp.values()];
    G.juntas = Object.assign({}, G.juntas, R.juntas || {});
    G.analisis = Object.assign({}, G.analisis || {}, R.analisis || {});
    G.cliCart = Object.assign({}, G.cliCart || {}, R.cliCart || {});
    G.campanas = Object.assign({}, G.campanas || {}, R.campanas || {});
    G.oport = Object.assign({}, G.oport || {}, R.oport || {});
    G.config = Object.assign({}, G.config || {}, R.config || {});
    for (const k of ["h", "k", "c", "s"]) G.ed[k] = Object.assign({}, G.ed[k], (R.ed || {})[k] || {});
    guardar(); indexar(); render(); toast("Respaldo cargado");
  }

  /* ----------------------------------------------------- carga de Excel */
  function cargarSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar el lector de Excel. Revisa la conexión a internet.")); document.head.appendChild(s); });
  }
  async function cargarExcel(files) {
    const est = $("#estado-carga");
    const msg = (m) => { if (est) est.textContent = m; };
    if (!files.length) return;
    try {
      msg("Preparando el lector de Excel…");
      await cargarSheetJS();
      const nueva = JSON.parse(JSON.stringify(BASE));
      const hechos = [];
      for (const f of files) {
        msg(`Leyendo ${f.name}…`);
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true, sheetRows: 1600 });
        const catalogo = Object.entries(IDX.cartNom).map(([k, n]) => ({ k, n }));
        const msf = $("#mes-sin-fecha"), asf = $("#anio-sin-fecha");
        const L = ISELParser.leer(ISELParser.libroDeSheetJS(wb), { catalogo, mesSinFecha: msf && asf && $("#sin-fecha-det").open ? [+asf.value, +msf.value] : null });
        ISELParser.combinar(nueva, L, f.name);
        hechos.push(`${f.name}: ${L.tipo === "resultados" ? "Resultado de ventas " + L.anio + " (corte " + MESES[L.corte - 1] + ")" : L.tipo === "facturas" ? `facturas de Odoo del ${L.desde} al ${L.hasta} (${L.docs.length} documentos${L.canceladas ? `, ${L.canceladas} renglones cancelados` : ""})` : L.tipo === "clientes" ? `ventas por cliente, ${L.filas.length} registros en ${L.meses.length} meses${L.sinCartera ? ` (${L.sinCartera} renglones sin cartera)` : ""}${Object.keys(L.nombres).length ? ` · vendedores sin cartera reconocida: ${Object.values(L.nombres).slice(0, 4).join(", ")}` : ""}` : "Tablero " + MESES[L.mes - 1] + " " + L.anio}`);
        if ($("#limpiar-ed") && $("#limpiar-ed").checked) {
          const pref = L.anio + "-";
          if (L.tipo === "resultados") for (const k of Object.keys(G.ed.h)) if (k.startsWith(pref)) delete G.ed.h[k];
          if (L.tipo === "tablero") { for (const k of Object.keys(G.ed.s)) if (k.startsWith(pref)) delete G.ed.s[k]; delete G.ed.c[L.clave]; }
        }
      }
      if (NUBE) { await guardarBase(nueva, msg); }
      BASE = nueva; FAC = null; VCF = null;
      if (!NUBE) try { localStorage.setItem(LS_BASE, JSON.stringify(BASE)); G_BASE_LOCAL = true; } catch (e) { toast("Los datos se cargaron, pero el navegador no permitió guardarlos: se perderán al cerrar."); }
      guardar(); indexar(); ajustarPeriodo(); if (document.querySelector(".acceso")) arrancar(); else render();
      toast("Datos actualizados");
      const e2 = $("#estado-carga"); if (e2) e2.textContent = "Cargado: " + hechos.join(" · ");
    } catch (e) { console.error(e); msg("No se pudo leer: " + e.message); toast(e.message); }
  }

  /* ===================================================================== */
  /*                                CAMPAÑAS                                 */
  /* ===================================================================== */
  const MOTIVOS_BASE = ["Precio", "Tiempo de entrega", "Prestaciones técnicas (no cumple la especificación)", "Mejor tecnología de la competencia", "Sin respuesta del cliente",
    "Se compró con otro proveedor", "Proyecto cancelado o pospuesto", "Sin presupuesto del cliente", "Condiciones comerciales (crédito o forma de pago)",
    "Producto no disponible o descontinuado", "Marca especificada u homologación del cliente", "Preferencia o relación con otro proveedor", "Cotización tardía o incompleta", "Otro"];
  const motivos = () => (G.config && Array.isArray(G.config.motivos) && G.config.motivos.length ? G.config.motivos : MOTIVOS_BASE);
  const METRICAS = [
    ["ganado", "Monto ganado", "$", "cierre"], ["facturado", "Monto facturado", "$", "factura"], ["cotizado", "Monto cotizado", "$", "alta"],
    ["oport", "Oportunidades generadas", "#", "alta"], ["ganadas", "Oportunidades ganadas", "#", "cierre"], ["clientes", "Clientes con oportunidad", "#", "alta"], ["clientes_g", "Clientes que compraron", "#", "cierre"],
  ];
  const MET = Object.fromEntries(METRICAS.map((m) => [m[0], { n: m[1], u: m[2], fecha: m[3] }]));
  const ESTADO_OP = { abierta: ["Abierta", "na"], ganada: ["Ganada", "ok"], perdida: ["Perdida", "bad"] };
  const ESTADO_C = { planeada: "Planeada", activa: "Activa", pausada: "Pausada", terminada: "Terminada" };
  const valMet = (k, v) => (MET[k] && MET[k].u === "$" ? fmtM(v) : fin(v) ? Math.round(v).toLocaleString("es-MX") : "—");
  const diasEntre = (a, b) => (new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5;
  const hoyIso = () => isoLocal(new Date());
  const campanasLista = () => Object.values(G.campanas || {}).sort((a, b) => (b.inicio || "").localeCompare(a.inicio || "") || (a.nombre || "").localeCompare(b.nombre || ""));
  const opsDe = (cid) => Object.values(G.oport || {}).filter((o) => o.campana_id === cid);
  const marcasPortafolio = () => [...new Set([...IDX.h.values()].filter((r) => r.d === "linea").map((r) => r.n))].filter((n) => !/anticipo|descontinu|servicio/i.test(n)).sort();

  // Filtro de fechas: toda la campaña o el periodo de la barra superior
  function filtroFechas() {
    if (vista("camp-per", "campana") === "campana") return () => true;
    const L = periodoMeses(); const set = new Set(L.map(([a, m]) => `${a}-${pad(m)}`));
    return (f) => !f || set.has(String(f).slice(0, 7));
  }
  function calcular(ops, enP = () => true) {
    const r = { oport: 0, cotizado: 0, abiertas: 0, abierto: 0, ganadas: 0, ganado: 0, perdidas: 0, perdido: 0, facturado: 0, clientes: 0, clientes_g: 0, ciclo: [], sinMotivo: 0 };
    const cl = new Set(), clg = new Set();
    for (const o of ops) {
      const m = +o.monto || 0;
      if (enP(o.fecha_alta)) { r.oport++; r.cotizado += m; cl.add(o.cliente); if (o.estado === "abierta") { r.abiertas++; r.abierto += m; } }
      if (o.estado === "ganada" && enP(o.fecha_cierre || o.fecha_alta)) { r.ganadas++; r.ganado += m; clg.add(o.cliente); if (o.fecha_alta && o.fecha_cierre) r.ciclo.push(diasEntre(o.fecha_alta, o.fecha_cierre)); }
      if (o.estado === "perdida" && enP(o.fecha_cierre || o.fecha_alta)) { r.perdidas++; r.perdido += m; if (!o.motivo) r.sinMotivo++; }
      if (o.fecha_factura && enP(o.fecha_factura)) r.facturado += +o.monto_facturado || (o.estado === "ganada" ? m : 0);
    }
    r.clientes = cl.size; r.clientes_g = clg.size;
    r.tasa = div(r.ganadas, r.ganadas + r.perdidas); r.tasa$ = div(r.ganado, r.ganado + r.perdido);
    r.ticket = div(r.ganado, r.ganadas); r.cicloProm = r.ciclo.length ? r.ciclo.reduce((s, x) => s + x, 0) / r.ciclo.length : null;
    return r;
  }
  function tiempoCampana(c) {
    if (!c.inicio || !c.fin) return null;
    const tot = Math.max(1, diasEntre(c.inicio, c.fin)); const t = diasEntre(c.inicio, hoyIso());
    return Math.max(0, Math.min(1, t / tot));
  }
  function principal(c) { const m = c.metas || {}; const k = m.principal && fin(+m[m.principal]) && +m[m.principal] > 0 ? m.principal : METRICAS.map((x) => x[0]).find((x) => +m[x] > 0); return k || "ganado"; }
  function avanceCampana(c, ops, enP) {
    const R = calcular(ops, enP); const k = principal(c); const meta = +((c.metas || {})[k]) || null;
    const av = div(R[k], meta); const t = tiempoCampana(c);
    const ritmo = c.estado === "planeada" || t === 0 || t === null ? null : div(av, t);
    return { R, k, meta, av, t, ritmo };
  }
  const semRitmo = (x) => (!fin(x) ? "na" : x >= 1 ? "ok" : x >= 0.8 ? "warn" : "bad");
  const opcCarteras = () => Object.entries(IDX.cartNom).sort().map(([k, n]) => ({ v: k, t: `${k} ${n}` }));

  function campSeccion(id, num, titulo, pregunta, cuerpo) {
    return `<section class="bloque" id="b-${id}"><header><span class="bloque-num">${num}</span><h2>${titulo}</h2><span class="pregunta">${pregunta}</span><div class="acciones-h">${botonAmpliar(id)}</div></header><div class="bloque-cuerpo">${cuerpo}</div></section>`;
  }
  // Campañas y oportunidades que pasan los filtros del tablero
  function campFiltradas() {
    const L = campanasLista();
    registrarMs("camp-tipo", [{ v: "outbound", t: "Outbound" }, { v: "inbound", t: "Inbound" }]);
    registrarMs("camp-estado", Object.entries(ESTADO_C).map(([v, t]) => ({ v, t })));
    const marcas = [...new Set(L.map((c) => c.marca || "(sin marca)"))].sort().map((m) => ({ v: m, t: m })); registrarMs("camp-marca", marcas);
    registrarMs("camp-cart", opcCarteras());
    const cs = L.filter((c) => pasa("camp-tipo", c.tipo) && pasa("camp-estado", c.estado) && pasa("camp-marca", c.marca || "(sin marca)"));
    const opsF = (c) => opsDe(c.id).filter((o) => pasa("camp-cart", o.cartera || "S/C"));
    return { cs, opsF, marcas };
  }
  function filtrosCamp(marcas) {
    return `${seg("camp-per", [["campana", "Toda la campaña"], ["periodo", `Periodo: ${esc(ctx().etiqueta)}`]], vista("camp-per", "campana"))}
      ${ms("camp-tipo", [{ v: "outbound", t: "Outbound" }, { v: "inbound", t: "Inbound" }], "Tipo")} ${ms("camp-estado", Object.entries(ESTADO_C).map(([v, t]) => ({ v, t })), "Estado")} ${ms("camp-marca", marcas, "Marca")} ${ms("camp-cart", opcCarteras(), "Cartera", true)}`;
  }

  /* ---------------------------------------------------- C1 Resumen */
  function cResumen() {
    const { cs, opsF, marcas } = campFiltradas(); const enP = filtroFechas(); const C = colores();
    if (!campanasLista().length) return campSeccion("c-resumen", "C1", "Campañas", "Avance de las campañas e iniciativas de venta",
      `<div class="vacio">Todavía no hay campañas. ${esAdmin() ? `<button class="btn prim" type="button" data-camp-nueva>+ Nueva campaña</button>` : "El administrador las dará de alta."}</div>`);
    const filas = cs.map((c) => ({ c, ...avanceCampana(c, opsF(c), enP) }));
    const T = calcular(cs.flatMap(opsF), enP);
    const activas = cs.filter((c) => c.estado === "activa").length;
    const vis = filas.filter((f) => f.meta);
    chart("g-camp-av", { type: "bar", data: { labels: vis.map((f) => f.c.nombre.length > 28 ? f.c.nombre.slice(0, 27) + "…" : f.c.nombre), datasets: [{ label: "Avance del objetivo", data: vis.map((f) => f.av), backgroundColor: vis.map((f) => C[semRitmo(f.ritmo)] || C.s1) }, { label: "Tiempo transcurrido", data: vis.map((f) => f.t), backgroundColor: C.meta }] },
      options: { indexAxis: "y", plugins: { tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmtP(x.parsed.x)}`, afterBody: (it) => { const f = vis[it[0].dataIndex]; return `${MET[f.k].n}: ${valMet(f.k, f.R[f.k])} de ${valMet(f.k, f.meta)}`; } } } }, scales: { x: ejeP({ beginAtZero: true, suggestedMax: 1 }), y: { grid: { display: false } } } } });
    const tabla = `<div class="tabla-wrap"><table class="t"><thead><tr><th>Campaña</th><th>Tipo</th><th>Estado</th><th>Marca</th><th>Fechas</th><th class="n">Objetivo</th><th class="n">Avance</th><th class="n">Tiempo</th><th class="n">Abiertas</th><th class="n">Ganadas</th><th class="n">Perdidas</th><th class="n">Tasa de cierre</th><th class="n">Ganado</th></tr></thead><tbody>
      ${filas.map((f) => `<tr class="fila-click" data-camp-ver="${f.c.id}" tabindex="0"><td class="nombre"><b>${esc(f.c.nombre)}</b><div class="cod" style="margin:0">${f.c.carteras.length} carteras</div></td><td><span class="sem na">${f.c.tipo === "inbound" ? "Inbound" : "Outbound"}</span></td><td>${ESTADO_C[f.c.estado] || f.c.estado}</td><td>${esc(f.c.marca || "—")}</td><td class="mono" style="white-space:nowrap">${esc(f.c.inicio || "—")} → ${esc(f.c.fin || "—")}</td>
        <td class="n">${f.meta ? `${valMet(f.k, f.meta)}<div class="cod" style="margin:0">${MET[f.k].n}</div>` : "—"}</td><td class="n">${f.meta ? sem(f.ritmo === null ? f.av : f.ritmo >= 1 ? 1 : f.ritmo >= 0.8 ? 0.85 : 0.5, fmtP(f.av)) : "—"}</td><td class="n">${fmtP(f.t)}</td>
        <td class="n">${f.R.abiertas}</td><td class="n pos">${f.R.ganadas}</td><td class="n neg">${f.R.perdidas}</td><td class="n">${fmtP(f.R.tasa)}</td><td class="n">${fmt$(f.R.ganado)}</td></tr>`).join("") || `<tr><td colspan="13">Ninguna campaña con estos filtros.</td></tr>`}</tbody></table></div>`;
    return campSeccion("c-resumen", "C1", "Campañas", "¿Cómo avanzan las campañas contra su objetivo?",
      `<div class="sub" style="margin:0;flex-wrap:wrap;gap:8px">${filtrosCamp(marcas)} <span class="der">${esAdmin() ? `<button class="btn prim chico" type="button" data-camp-nueva>+ Nueva campaña</button>` : ""}</span></div>
      <div class="tira"><div class="celda"><label>Campañas activas</label><div class="valor">${activas}</div><small>${cs.length} con estos filtros</small></div>
        <div class="celda"><label>Oportunidades</label><div class="valor">${T.oport}</div><small>${fmtM(T.cotizado)} cotizados · ${T.abiertas} abiertas</small></div>
        <div class="celda"><label>Ganado</label><div class="valor pos">${fmtM(T.ganado)}</div><small>${T.ganadas} oportunidades · ticket ${fmtM(T.ticket)}</small></div>
        <div class="celda"><label>Tasa de cierre</label><div class="valor">${fmtP(T.tasa)}</div><small>${T.perdidas} perdidas por ${fmtM(T.perdido)}</small></div></div>
      ${vis.length ? `<div><div class="sub">Avance del objetivo contra tiempo transcurrido</div><div class="graf" style="height:${Math.min(520, Math.max(200, vis.length * 44 + 60))}px"><canvas id="g-camp-av" role="img" aria-label="Avance de cada campaña"></canvas></div><p class="nota-pie">Si el avance (color) va por detrás del tiempo transcurrido (gris), la campaña no llegará a su objetivo al ritmo actual. Verde: a tiempo · ámbar: 80–99% del ritmo · rojo: menos de 80%.</p></div>` : ""}
      ${tabla}<p class="nota-pie">Haz clic en una campaña para ver su detalle.</p>`);
  }

  /* ---------------------------------------------------- C2 Detalle */
  function cDetalle() {
    const L = campanasLista();
    if (UI.campEdit) return campSeccion("c-detalle", "C2", UI.campEdit === "nueva" ? "Nueva campaña" : "Editar campaña", "Datos de la campaña", editorCampana());
    if (!L.length) return "";
    const c = G.campanas[UI.campSel] || L[0]; UI.campSel = c.id;
    const enP = filtroFechas(); const C = colores();
    registrarMs("cd-cart", c.carteras.map((k) => ({ v: k, t: nombreCartera(k) })).concat([{ v: "S/C", t: "Sin cartera" }]));
    const todas = opsDe(c.id); const ops = todas.filter((o) => pasa("cd-cart", o.cartera || "S/C"));
    const A = avanceCampana(c, ops, enP); const R = A.R; const metas = c.metas || {};
    // Avance acumulado en el tiempo
    const k = A.k, fk = MET[k].fecha;
    const fechaDe = (o) => (fk === "alta" ? o.fecha_alta : fk === "factura" ? o.fecha_factura : o.estado === "ganada" ? o.fecha_cierre || o.fecha_alta : null);
    const valorDe = (o) => (k === "facturado" ? +o.monto_facturado || (o.estado === "ganada" ? +o.monto || 0 : 0) : k === "ganado" || k === "cotizado" ? +o.monto || 0 : 1);
    let graf = "";
    if (c.inicio && c.fin) {
      const pasos = []; const ini = new Date(c.inicio + "T12:00:00"), finD = new Date(c.fin + "T12:00:00");
      for (let d = new Date(ini); d <= finD; d.setDate(d.getDate() + 7)) pasos.push(isoLocal(d));
      if (pasos[pasos.length - 1] !== c.fin) pasos.push(c.fin);
      const hoyS = hoyIso(); const vistos = new Set();
      const real = pasos.map((p) => {
        if (p > hoyS && pasos[0] <= hoyS && pasos.findIndex((x) => x > hoyS) !== pasos.indexOf(p)) return null;
        let acc = 0; vistos.clear();
        for (const o of ops) { const f = fechaDe(o); if (!f || f > p) continue; if (k === "clientes" || k === "clientes_g") { if (!vistos.has(o.cliente)) { vistos.add(o.cliente); acc++; } } else if (!(k === "ganadas" && o.estado !== "ganada")) acc += valorDe(o); }
        return p > hoyS ? null : acc;
      });
      const ideal = A.meta ? pasos.map((p) => A.meta * Math.max(0, Math.min(1, diasEntre(c.inicio, p) / Math.max(1, diasEntre(c.inicio, c.fin))))) : null;
      chart("g-camp-t", { type: "line", data: { labels: pasos.map((p) => `${+p.slice(8)} ${MC[+p.slice(5, 7) - 1]}`), datasets: [
        { label: `${MET[k].n} acumulado`, data: real, borderColor: C.s1, backgroundColor: alfa(C.s1, 0.12), fill: "origin", tend: MET[k].u === "$" ? "M" : "n", tendMin: 0, tendPaso: "sem", tendHasta: pasos.length - 1, tendNombre: "Proyección por tendencia" },
        ...(ideal ? [{ label: "Ritmo necesario para la meta", data: ideal, borderColor: C.meta, borderDash: [4, 4], pointRadius: 0 }] : []) ] },
        options: { scales: { y: MET[k].u === "$" ? ejeM({ beginAtZero: true }) : { beginAtZero: true, grid: { color: C.grid } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 12, maxRotation: 0 } } }, plugins: { tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${valMet(k, x.parsed.y)}` } } } } });
      graf = `<div><div class="sub">Avance de ${MET[k].n.toLowerCase()} en el tiempo</div><div class="graf"><canvas id="g-camp-t" role="img" aria-label="Avance acumulado de la campaña"></canvas></div><p class="nota-pie">La línea de tendencia se extiende hasta el cierre de la campaña: es la proyección si se mantiene el ritmo actual.</p></div>`;
    }
    // Por cartera
    const porCart = c.carteras.concat(ops.some((o) => !o.cartera || !c.carteras.includes(o.cartera)) ? ["S/C"] : []).filter((x) => pasa("cd-cart", x));
    const RC = porCart.map((kc) => ({ k: kc, R: calcular(ops.filter((o) => (o.cartera && c.carteras.includes(o.cartera) ? o.cartera : "S/C") === kc), enP) }));
    const modoC = vista("cd-modo", "monto");
    const v$ = (R, campo) => (modoC === "monto" ? R[{ abiertas: "abierto", ganadas: "ganado", perdidas: "perdido" }[campo]] : R[campo]);
    chart("g-camp-cart", { type: "bar", data: { labels: RC.map((x) => x.k === "S/C" ? "Sin cartera" : x.k), datasets: [["ganadas", "Ganadas", C.ok], ["abiertas", "Abiertas", C.s1], ["perdidas", "Perdidas", C.bad]].map(([cmp, lab, col]) => ({ label: lab, data: RC.map((x) => v$(x.R, cmp)), backgroundColor: col })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: modoC === "monto" ? ejeM({ stacked: true, beginAtZero: true }) : { stacked: true, beginAtZero: true, grid: { color: C.grid } } }, plugins: { tooltip: { callbacks: { title: (it) => nombreCartera(RC[it[0].dataIndex].k), label: (x) => `${x.dataset.label}: ${modoC === "monto" ? fmt$(x.parsed.y) : x.parsed.y}` } } } } });
    const metaCart = A.meta && c.carteras.length ? A.meta / c.carteras.length : null;
    const tablaCart = `<div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>Cartera</th><th class="n">Oportunidades</th><th class="n">Cotizado</th><th class="n">Ganadas</th><th class="n">Ganado</th><th class="n">Perdidas</th><th class="n">Tasa</th>${metaCart ? `<th class="n">Avance (${MET[k].n.toLowerCase()})</th>` : ""}</tr></thead><tbody>
      ${RC.map((x) => `<tr><td class="nombre">${esc(nombreCartera(x.k))}</td><td class="n">${x.R.oport}</td><td class="n">${fmt$(x.R.cotizado)}</td><td class="n pos">${x.R.ganadas}</td><td class="n">${fmt$(x.R.ganado)}</td><td class="n neg">${x.R.perdidas}</td><td class="n">${fmtP(x.R.tasa)}</td>${metaCart ? `<td class="n">${x.k === "S/C" ? "—" : sem(div(x.R[k], metaCart), `${valMet(k, x.R[k])} · ${fmtP(div(x.R[k], metaCart))}`)}</td>` : ""}</tr>`).join("")}</tbody></table></div>
      ${metaCart ? `<p class="nota-pie">Meta por cartera: ${valMet(k, metaCart)} (objetivo repartido en partes iguales entre ${c.carteras.length} carteras).</p>` : ""}`;
    // Productos
    const prods = {}; for (const o of ops) { const p = [o.marca, o.modelo].filter(Boolean).join(" · ") || "(sin modelo)"; const x = (prods[p] = prods[p] || { n: 0, cot: 0, gan: 0, per: 0 }); x.n++; x.cot += +o.monto || 0; if (o.estado === "ganada") x.gan += +o.monto || 0; if (o.estado === "perdida") x.per += +o.monto || 0; }
    const PR = Object.entries(prods).sort((a, b) => b[1].cot - a[1].cot).slice(0, 12);
    // Tiles de metas
    const tiles = METRICAS.filter(([m]) => +metas[m] > 0).map(([m, n]) => { const v = R[m], meta = +metas[m]; const av = div(v, meta); return `<div class="celda ${m === k ? "principal" : ""}"><label>${n}${m === k ? " · principal" : ""}</label><div class="valor">${valMet(m, v)}</div><small>meta ${valMet(m, meta)} · ${fmtP(av)}</small><div class="barra-avance" style="color:var(--${semClase(av) === "na" ? "muted" : semClase(av)})"><i style="width:${Math.min(100, (av || 0) * 100)}%"></i></div></div>`; }).join("");
    const proy = A.t && A.t > 0 && A.t < 1 && A.meta ? R[k] / A.t : null;
    const encabezado = `<div class="camp-cab"><div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select class="campo" id="camp-sel" style="width:auto;font-weight:600" aria-label="Campaña">${L.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select>
        <span class="sem na">${c.tipo === "inbound" ? "Inbound" : "Outbound"}</span><span class="sem ${c.estado === "activa" ? "ok" : c.estado === "terminada" ? "na" : "warn"}">${ESTADO_C[c.estado]}</span>
        ${esAdmin() ? `<button class="btn chico" type="button" data-camp-editar="${c.id}">Editar campaña</button><button class="btn chico peligro" type="button" data-camp-borrar="${c.id}">${UI.borrar === "c" + c.id ? "Confirmar: eliminar campaña y sus oportunidades" : "Eliminar"}</button>` : ""}</div>
        <p style="margin:8px 0 0;max-width:90ch">${c.objetivo ? esc(c.objetivo) : '<span class="nota-pie">Sin descripción del objetivo.</span>'}</p>
        <p class="nota-pie" style="margin:4px 0 0"><b>Marca:</b> ${esc(c.marca || "—")} · <b>Modelos:</b> ${esc(c.modelos || "—")} · <b>Fechas:</b> ${esc(c.inicio || "—")} a ${esc(c.fin || "—")} (${fmtP(A.t)} del tiempo transcurrido) · <b>Participan:</b> ${c.carteras.map((x) => esc(nombreCartera(x))).join(", ") || "—"}</p></div></div>`;
    const ritmoTxt = A.meta ? `<div class="interpretacion"><p>${A.t === null ? "Define fechas de inicio y fin para medir el ritmo." : c.estado === "planeada" ? "La campaña todavía no inicia." : `Lleva <b>${fmtP(A.av)}</b> del objetivo (${valMet(k, R[k])} de ${valMet(k, A.meta)}) con <b>${fmtP(A.t)}</b> del tiempo transcurrido. ${proy !== null ? `Al ritmo actual cerraría en <b>${valMet(k, proy)}</b> (${fmtP(div(proy, A.meta))} de la meta)${proy < A.meta ? `; para llegar necesita ${valMet(k, (A.meta - R[k]))} en el tiempo que resta.` : "."}` : A.t >= 1 ? `La campaña terminó en ${fmtP(A.av)} de su objetivo.` : ""}`} ${R.perdidas ? `Se han perdido <b>${R.perdidas}</b> oportunidades por ${fmtM(R.perdido)}${R.sinMotivo ? `; <b>${R.sinMotivo}</b> no tienen motivo registrado` : ""}.` : ""}</p></div>` : "";
    return campSeccion("c-detalle", "C2", "Detalle de campaña", esc(c.nombre),
      `${encabezado}
      <div class="sub" style="margin:0;gap:8px;flex-wrap:wrap">${seg("camp-per", [["campana", "Toda la campaña"], ["periodo", `Periodo: ${esc(ctx().etiqueta)}`]], vista("camp-per", "campana"))} ${ms("cd-cart", c.carteras.map((x) => ({ v: x, t: nombreCartera(x) })).concat([{ v: "S/C", t: "Sin cartera" }]), "Cartera")}</div>
      ${tiles ? `<div class="tira tira-auto">${tiles}</div>` : `<div class="aviso">La campaña no tiene metas. ${esAdmin() ? "Edítala para definir su objetivo." : ""}</div>`}
      ${ritmoTxt}
      <div class="tira tira-auto"><div class="celda"><label>Abiertas</label><div class="valor">${R.abiertas}</div><small>${fmtM(R.abierto)} en juego</small></div><div class="celda"><label>Ganadas</label><div class="valor pos">${R.ganadas}</div><small>${fmtM(R.ganado)}</small></div><div class="celda"><label>Perdidas</label><div class="valor neg">${R.perdidas}</div><small>${fmtM(R.perdido)}</small></div><div class="celda"><label>Tasa de cierre</label><div class="valor">${fmtP(R.tasa)}</div><small>${fmtP(R.tasa$)} en monto</small></div><div class="celda"><label>Ciclo promedio</label><div class="valor">${fin(R.cicloProm) ? Math.round(R.cicloProm) + " días" : "—"}</div><small>de alta a cierre ganado</small></div></div>
      <div class="grid2">${graf || "<div></div>"}<div><div class="sub">Resultado por cartera <span class="der">${seg("cd-modo", [["monto", "Monto"], ["num", "Número"]], modoC)}</span></div><div class="graf"><canvas id="g-camp-cart" role="img" aria-label="Oportunidades por cartera"></canvas></div></div></div>
      ${tablaCart}
      ${PR.length ? `<div><div class="sub">Modelos y productos</div><div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>Marca · modelo</th><th class="n">Oportunidades</th><th class="n">Cotizado</th><th class="n">Ganado</th><th class="n">Perdido</th></tr></thead><tbody>${PR.map(([p, x]) => `<tr><td>${esc(p)}</td><td class="n">${x.n}</td><td class="n">${fmt$(x.cot)}</td><td class="n pos">${fmt$(x.gan)}</td><td class="n neg">${fmt$(x.per)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
      ${tablaOport(c, todas)}`);
  }

  function tablaOport(c, todas) {
    const adm = esAdmin();
    registrarMs("op-estado", Object.entries(ESTADO_OP).map(([v, [t]]) => ({ v, t })));
    const mot = [...new Set([...motivos(), ...todas.map((o) => o.motivo).filter(Boolean)])];
    registrarMs("op-motivo", [{ v: "", t: "(sin motivo)" }, ...mot.map((m) => ({ v: m, t: m }))]);
    const q = (UI.busq["op-q"] || "").toLowerCase();
    let L = todas.filter((o) => pasa("cd-cart", o.cartera || "S/C") && pasa("op-estado", o.estado) && (o.estado !== "perdida" || pasa("op-motivo", o.motivo || "")) && (!q || `${o.cliente} ${o.oportunidad} ${o.modelo}`.toLowerCase().includes(q)));
    L = ordenar("op-tabla", L.map((o) => ({ ...o, monto: +o.monto || 0 })), "fecha_alta:d");
    const opcCart = c.carteras.map((k) => `<option value="${k}">${esc(nombreCartera(k))}</option>`).join("");
    const celda = (o, campo, tipo = "text", extra = "") => adm ? `<input data-op="${o.id}" data-campo="${campo}" type="${tipo}" value="${esc(o[campo] ?? "")}" ${extra} aria-label="${campo}">` : esc(o[campo] ?? "—");
    const filas = L.map((o) => `<tr class="${o.estado === "perdida" && !o.motivo ? "falta-motivo" : ""}">
      <td>${adm ? `<select data-op="${o.id}" data-campo="cartera" class="estado-sel" aria-label="Cartera"><option value="">—</option>${opcCart.replace(`value="${o.cartera}"`, `value="${o.cartera}" selected`)}</select>` : esc(o.cartera || "—")}</td>
      <td style="min-width:160px">${celda(o, "cliente")}</td><td>${celda(o, "oportunidad")}</td><td>${celda(o, "modelo")}</td>
      <td class="n" style="min-width:110px">${adm ? `<input data-op="${o.id}" data-campo="monto" inputmode="decimal" value="${esc(o.monto)}" style="text-align:right" aria-label="Monto">` : fmt$(+o.monto)}</td>
      <td>${adm ? `<select data-op="${o.id}" data-campo="estado" class="estado-sel ${o.estado === "ganada" ? "cumplido" : o.estado === "perdida" ? "no_cumplido" : ""}" aria-label="Estado">${Object.entries(ESTADO_OP).map(([v, [t]]) => `<option value="${v}" ${o.estado === v ? "selected" : ""}>${t}</option>`).join("")}</select>` : `<span class="sem ${ESTADO_OP[o.estado][1]}">${ESTADO_OP[o.estado][0]}</span>`}</td>
      <td style="min-width:170px">${o.estado !== "perdida" ? "" : adm ? `<select data-op="${o.id}" data-campo="motivo" class="estado-sel" aria-label="Motivo de pérdida"><option value="">Elegir motivo…</option>${mot.map((m) => `<option ${o.motivo === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>` : esc(o.motivo || "Sin motivo")}${o.estado === "perdida" ? `<div style="margin-top:4px">${celda(o, "competidor", "text", 'placeholder="Competidor"')}</div>` : ""}</td>
      <td>${celda(o, "fecha_alta", "date")}</td><td>${celda(o, "fecha_cierre", "date")}</td><td>${celda(o, "fecha_factura", "date")}</td>
      <td class="n" style="min-width:100px">${adm ? `<input data-op="${o.id}" data-campo="monto_facturado" inputmode="decimal" value="${esc(o.monto_facturado ?? "")}" style="text-align:right" aria-label="Monto facturado">` : fmt$(+o.monto_facturado)}</td>
      <td style="min-width:160px">${celda(o, "detalle", "text", 'placeholder="Comentarios"')}</td>
      ${adm ? `<td><button class="restaurar" type="button" data-op-borrar="${o.id}" title="Eliminar">${UI.borrar === "o" + o.id ? "¿Eliminar?" : "✕"}</button></td>` : ""}</tr>`).join("");
    return `<div><div class="sub">Oportunidades de la campaña (${L.length} de ${todas.length})
        <span class="der" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="search" class="campo" style="width:190px;padding:4px 8px" placeholder="Buscar cliente o modelo" data-busq="op-q" id="busq-op" value="${esc(UI.busq["op-q"] || "")}">${ms("op-estado", Object.entries(ESTADO_OP).map(([v, [t]]) => ({ v, t })), "Estado")} ${ms("op-motivo", [{ v: "", t: "(sin motivo)" }, ...mot.map((m) => ({ v: m, t: m }))], "Motivo", true)}
        ${adm ? `<button class="btn chico prim" type="button" data-op-nueva="${c.id}">+ Oportunidad</button><button class="btn chico" type="button" data-op-pegar>Pegar desde Excel</button>` : ""}</span></div>
      ${adm && UI.pegar ? `<div class="caja"><p style="margin:0 0 6px">Copia filas de Excel con estas columnas, en este orden: <b>Cartera · Cliente · Oportunidad · Modelo · Monto · Estado · Motivo · Fecha alta · Fecha cierre · Fecha factura · Monto facturado</b>. La cartera puede ser el número (C10) o el nombre; el estado, Abierta / Ganada / Perdida; las fechas en dd/mm/aaaa.</p><textarea class="respaldo" id="op-pegado" placeholder="Pega aquí"></textarea><div style="display:flex;gap:8px;margin-top:6px"><button class="btn chico prim" type="button" data-op-importar="${c.id}">Agregar oportunidades</button><button class="btn chico" type="button" data-op-pegar>Cancelar</button></div></div>` : ""}
      <div class="tabla-wrap"><table class="t compromisos tabla-op"><thead><tr>${th("op-tabla", "cartera", "Cartera", false)}${th("op-tabla", "cliente", "Cliente", false)}<th>Oportunidad</th><th>Modelo</th>${th("op-tabla", "monto", "Monto")}${th("op-tabla", "estado", "Estado", false)}<th>Motivo de pérdida</th>${th("op-tabla", "fecha_alta", "Alta", false)}${th("op-tabla", "fecha_cierre", "Cierre", false)}<th>Facturada</th><th class="n">Facturado</th><th>Comentarios</th>${adm ? "<th></th>" : ""}</tr></thead>
      <tbody>${filas || `<tr><td colspan="13">Sin oportunidades${adm ? ". Usa + Oportunidad o Pegar desde Excel." : "."}</td></tr>`}</tbody></table></div>
      ${todas.some((o) => o.estado === "perdida" && !o.motivo) ? `<p class="nota-pie neg">Las filas marcadas son oportunidades perdidas sin motivo: regístralo para que el análisis de pérdidas sea útil.</p>` : ""}</div>`;
  }

  function editorCampana() {
    const nueva = UI.campEdit === "nueva";
    const c = UI.campBorrador || (UI.campBorrador = nueva ? { id: crypto.randomUUID ? crypto.randomUUID() : uid(), nombre: "", tipo: "outbound", estado: "activa", inicio: hoyIso(), fin: "", marca: "", modelos: "", carteras: [], objetivo: "", metas: { principal: "ganado" }, notas: "" } : JSON.parse(JSON.stringify(G.campanas[UI.campEdit])));
    const m = c.metas || (c.metas = {});
    const cart = Object.entries(IDX.cartNom).sort().filter(([k, n]) => n && n !== "(sin asignar)" && !/vacante/i.test(n));
    return `<form id="f-campana" class="form-camp">
      <div class="grid2"><div><label class="campo-label" for="cf-nombre">Nombre de la campaña</label><input class="campo" id="cf-nombre" data-cb="nombre" value="${esc(c.nombre)}" required placeholder="Ej. Sensores de seguridad SICK en automotriz"></div>
        <div class="grid3" style="gap:10px"><div><label class="campo-label" for="cf-tipo">Tipo</label><select class="campo" id="cf-tipo" data-cb="tipo"><option value="outbound" ${c.tipo === "outbound" ? "selected" : ""}>Outbound</option><option value="inbound" ${c.tipo === "inbound" ? "selected" : ""}>Inbound</option></select></div>
          <div><label class="campo-label" for="cf-estado">Estado</label><select class="campo" id="cf-estado" data-cb="estado">${Object.entries(ESTADO_C).map(([v, t]) => `<option value="${v}" ${c.estado === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div><label class="campo-label" for="cf-marca">Marca</label><input class="campo" id="cf-marca" data-cb="marca" list="lista-marcas" value="${esc(c.marca)}"><datalist id="lista-marcas">${marcasPortafolio().map((x) => `<option value="${esc(x)}">`).join("")}</datalist></div></div></div>
      <div class="grid2"><div class="grid2" style="gap:10px"><div><label class="campo-label" for="cf-inicio">Inicio</label><input class="campo" type="date" id="cf-inicio" data-cb="inicio" value="${esc(c.inicio)}"></div><div><label class="campo-label" for="cf-fin">Fin</label><input class="campo" type="date" id="cf-fin" data-cb="fin" value="${esc(c.fin)}"></div></div>
        <div><label class="campo-label" for="cf-modelos">Modelos o productos que promueve</label><input class="campo" id="cf-modelos" data-cb="modelos" value="${esc(c.modelos)}" placeholder="Ej. deTec4, nanoScan3, S3000"></div></div>
      <div><label class="campo-label" for="cf-objetivo">Objetivo de la campaña</label><textarea class="campo" id="cf-objetivo" data-cb="objetivo" rows="2" placeholder="Qué se busca lograr y con qué clientes">${esc(c.objetivo)}</textarea></div>
      <div><span class="campo-label">Carteras que participan (${c.carteras.length}) <button class="btn chico" type="button" data-cb-todas>${c.carteras.length === cart.length ? "Quitar todas" : "Todas"}</button></span>
        <div class="checks">${cart.map(([k, n]) => `<label><input type="checkbox" data-cb-cart value="${k}" ${c.carteras.includes(k) ? "checked" : ""}> <span class="cod" style="margin:0">${k}</span> ${esc(n)}</label>`).join("")}</div></div>
      <div><span class="campo-label">Metas (llena las que apliquen y marca la principal)</span>
        <div class="metas">${METRICAS.map(([k2, n, u]) => `<label class="meta-item"><input type="radio" name="cf-principal" value="${k2}" ${principal(c) === k2 ? "checked" : ""} data-cb-principal aria-label="Meta principal"> <span>${n}${u === "$" ? " ($)" : ""}</span><input class="campo" inputmode="decimal" data-cb-meta="${k2}" value="${esc(m[k2] ?? "")}" placeholder="—"></label>`).join("")}</div></div>
      <div><label class="campo-label" for="cf-notas">Notas</label><textarea class="campo" id="cf-notas" data-cb="notas" rows="2">${esc(c.notas)}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" data-camp-cancelar>Cancelar</button><button class="btn prim" type="submit">${nueva ? "Crear campaña" : "Guardar cambios"}</button></div>
    </form>`;
  }

  /* ---------------------------------------------------- C3 Pérdidas */
  function cPerdidas() {
    const { cs, opsF } = campFiltradas(); const enP = filtroFechas(); const C = colores();
    const perd = cs.flatMap((c) => opsF(c).map((o) => ({ ...o, campana: c.nombre }))).filter((o) => o.estado === "perdida" && enP(o.fecha_cierre || o.fecha_alta));
    const cerradas = cs.flatMap(opsF).filter((o) => o.estado !== "abierta" && enP(o.fecha_cierre || o.fecha_alta)).length;
    const modo = vista("perd-modo", "num");
    const pm = {}; for (const o of perd) { const k = o.motivo || "(sin motivo)"; const x = (pm[k] = pm[k] || { n: 0, m: 0 }); x.n++; x.m += +o.monto || 0; }
    const M = Object.entries(pm).sort((a, b) => (modo === "num" ? b[1].n - a[1].n : b[1].m - a[1].m));
    chart("g-perd", { type: "bar", data: { labels: M.map(([k]) => (k.length > 34 ? k.slice(0, 33) + "…" : k)), datasets: [{ maxBarThickness: 26, label: modo === "num" ? "Oportunidades perdidas" : "Monto perdido", data: M.map(([, x]) => (modo === "num" ? x.n : x.m)), backgroundColor: M.map(([k]) => (k === "(sin motivo)" ? C.meta : C.bad)) }] },
      options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => M[it[0].dataIndex][0], label: (x) => { const v = M[x.dataIndex][1]; return `${v.n} oportunidades · ${fmt$(v.m)} · ${fmtP(div(v.n, perd.length))} de las pérdidas`; } } } }, scales: { x: modo === "num" ? { beginAtZero: true, grid: { color: C.grid }, ticks: { precision: 0 } } : ejeM({ beginAtZero: true }), y: { grid: { display: false }, ticks: { autoSkip: false } } } } });
    const carts = [...new Set(perd.map((o) => o.cartera || "S/C"))].sort();
    const mat = `<div class="tabla-wrap"><table class="t calor"><thead><tr><th>Motivo</th>${carts.map((k) => `<th class="n">${esc(k)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>${M.map(([mo, x]) => `<tr><td>${esc(mo)}</td>${carts.map((k) => { const n = perd.filter((o) => (o.motivo || "(sin motivo)") === mo && (o.cartera || "S/C") === k).length; return `<td class="c" style="${n ? `background:${alfa(C.bad, Math.min(0.7, 0.12 + n / Math.max(...M.map((z) => z[1].n)) * 0.55))}` : ""}">${n || "·"}</td>`; }).join("")}<td class="c" style="font-weight:600">${x.n}</td></tr>`).join("")}</tbody></table></div>`;
    const comp = {}; for (const o of perd) if (o.competidor) { const k = o.competidor.trim().toUpperCase(); const x = (comp[k] = comp[k] || { n: 0, m: 0 }); x.n++; x.m += +o.monto || 0; }
    const CP = Object.entries(comp).sort((a, b) => b[1].m - a[1].m).slice(0, 10);
    const top = M[0] && M[0][0] !== "(sin motivo)" ? M[0] : M[1];
    const catalogo = esAdmin() ? `<details><summary class="campo-label" style="cursor:pointer">Catálogo de motivos de pérdida (${motivos().length})</summary><div class="motivos-ed">${motivos().map((mo, i) => `<div style="display:flex;gap:6px"><input class="campo" data-motivo="${i}" value="${esc(mo)}" aria-label="Motivo ${i + 1}"><button class="restaurar" type="button" data-motivo-borrar="${i}" title="Quitar">✕</button></div>`).join("")}<button class="btn chico" type="button" data-motivo-nuevo>+ Motivo</button></div><p class="nota-pie">Cambiar el nombre de un motivo no modifica las oportunidades ya registradas con el nombre anterior.</p></details>` : "";
    return campSeccion("c-perdidas", "C3", "Análisis de pérdidas", "¿Por qué perdemos oportunidades?",
      perd.length ? `<div class="tira"><div class="celda"><label>Oportunidades perdidas</label><div class="valor neg">${perd.length}</div><small>${fmtP(div(perd.length, cerradas))} de las cerradas</small></div>
        <div class="celda"><label>Monto perdido</label><div class="valor neg">${fmtM(perd.reduce((s, o) => s + (+o.monto || 0), 0))}</div><small>con los filtros del resumen</small></div>
        <div class="celda"><label>Motivo principal</label><div class="valor" style="font-size:20px;line-height:1.2">${top ? esc(top[0]) : "—"}</div><small>${top ? `${top[1].n} oportunidades · ${fmtM(top[1].m)}` : ""}</small></div>
        <div class="celda"><label>Sin motivo registrado</label><div class="valor ${pm["(sin motivo)"] ? "neg" : ""}">${pm["(sin motivo)"] ? pm["(sin motivo)"].n : 0}</div><small>pérdidas por documentar</small></div></div>
      <div class="grid-6-4"><div><div class="sub">Motivos de pérdida <span class="der">${seg("perd-modo", [["num", "Número"], ["monto", "Monto"]], modo)}</span></div><div class="graf" style="height:${Math.max(220, M.length * 30 + 50)}px"><canvas id="g-perd" role="img" aria-label="Motivos de pérdida"></canvas></div></div>
        <div><div class="sub">Competidores a los que perdimos</div>${CP.length ? `<div class="tabla-wrap" style="max-height:none"><table class="t"><tbody>${CP.map(([k, x]) => `<tr><td>${esc(k)}</td><td class="n">${x.n}</td><td class="n neg">${fmt$(x.m)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="vacio">Registra el competidor en las oportunidades perdidas para verlo aquí.</div>`}</div></div>
      <div><div class="sub">Motivo por cartera</div>${mat}</div>${catalogo}`
      : `<div class="vacio">No hay oportunidades perdidas con estos filtros.</div>${catalogo}`);
  }

  const CAMP_SECC = [["c-resumen", "C1", "Resumen", cResumen], ["c-detalle", "C2", "Detalle", cDetalle], ["c-perdidas", "C3", "Pérdidas", cPerdidas]];

  /* --------------------------------------------- eventos de campañas */
  function guardarCampana() {
    const c = UI.campBorrador; if (!c) return;
    if (!c.nombre.trim()) { toast("Escribe el nombre de la campaña."); $("#cf-nombre").focus(); return; }
    if (c.inicio && c.fin && c.fin < c.inicio) { toast("La fecha de fin es anterior al inicio."); return; }
    for (const k of Object.keys(c.metas)) if (k !== "principal" && (c.metas[k] === "" || !fin(+c.metas[k]))) delete c.metas[k]; else if (k !== "principal") c.metas[k] = +c.metas[k];
    c.nombre = c.nombre.trim();
    G.campanas[c.id] = c; UI.campSel = c.id; UI.campEdit = null; UI.campBorrador = null; guardar(); render(); toast("Campaña guardada");
  }
  function nuevaOport(cid) {
    const c = G.campanas[cid]; const id = crypto.randomUUID ? crypto.randomUUID() : uid();
    G.oport[id] = { id, campana_id: cid, cartera: c.carteras.length === 1 ? c.carteras[0] : "", cliente: "", oportunidad: "", marca: c.marca || "", modelo: "", monto: 0, estado: "abierta", motivo: "", detalle: "", competidor: "", fecha_alta: hoyIso(), fecha_cierre: "", fecha_factura: "", monto_facturado: null, notas: "" };
    return id;
  }
  function fechaPegada(s) {
    s = String(s || "").trim(); if (!s) return "";
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); if (m) { let a = +m[3]; if (a < 100) a += 2000; return `${a}-${pad(+m[2])}-${pad(+m[1])}`; }
    return "";
  }
  function importarPegado(cid) {
    const c = G.campanas[cid]; const txt = ($("#op-pegado") || {}).value || "";
    const filas = txt.split(/\r?\n/).map((l) => l.split("\t")).filter((f) => f.join("").trim());
    let n = 0, omit = 0;
    const cat = Object.entries(IDX.cartNom);
    for (const f of filas) {
      const [cart, cli, opo, mod, monto, est, mot, fa, fc, ff, mf] = f.map((x) => (x || "").trim());
      if (!cli || /^cliente$/i.test(cli)) { omit++; continue; }
      let k = (cart.match(/^C?\s?(\d{1,2})\b/i) || [])[1]; k = k ? "C" + pad(+k) : (cat.find(([, nn]) => nn && ISELParser.norm(nn).includes(ISELParser.norm(cart))) || [])[0] || "";
      const e = /gan|won/i.test(est) ? "ganada" : /perd|lost/i.test(est) ? "perdida" : "abierta";
      const id = nuevaOport(cid);
      Object.assign(G.oport[id], { cartera: k, cliente: cli.toUpperCase(), oportunidad: opo, modelo: mod, monto: +String(monto).replace(/[$,\s]/g, "") || 0, estado: e, motivo: e === "perdida" && mot ? (motivos().find((x) => ISELParser.norm(x).startsWith(ISELParser.norm(mot).slice(0, 6))) || mot) : "", fecha_alta: fechaPegada(fa) || hoyIso(), fecha_cierre: fechaPegada(fc), fecha_factura: fechaPegada(ff), monto_facturado: mf ? +String(mf).replace(/[$,\s]/g, "") || null : null, marca: c.marca || "" });
      n++;
    }
    UI.pegar = false; guardar(); render(); toast(`Se agregaron ${n} oportunidades${omit ? ` (${omit} filas omitidas sin cliente)` : ""}.`);
  }
  function eventosCampana(ev, tipo) {
    const t = ev.target, d = t.dataset || {};
    if (tipo === "click") {
      const b = t.closest("button, tr, label") || t; const bd = b.dataset || {};
      if ("campNueva" in bd) { UI.campEdit = "nueva"; UI.campBorrador = null; UI.tab = "campanas"; render(); const s = $("#b-c-detalle"); if (s) s.scrollIntoView(); return true; }
      if (bd.campEditar) { UI.campEdit = bd.campEditar; UI.campBorrador = null; render(); const s = $("#b-c-detalle"); if (s) s.scrollIntoView(); return true; }
      if ("campCancelar" in bd) { UI.campEdit = null; UI.campBorrador = null; render(); return true; }
      if (bd.campVer) { UI.campSel = bd.campVer; UI.campEdit = null; render(); const s = $("#b-c-detalle"); if (s) s.scrollIntoView(); return true; }
      if (bd.campBorrar) { if (UI.borrar === "c" + bd.campBorrar) { for (const o of opsDe(bd.campBorrar)) delete G.oport[o.id]; delete G.campanas[bd.campBorrar]; UI.borrar = null; UI.campSel = null; guardar(); toast("Campaña eliminada"); } else UI.borrar = "c" + bd.campBorrar; render(); return true; }
      if ("cbTodas" in bd) { const c = UI.campBorrador; const todas = Object.entries(IDX.cartNom).filter(([, n]) => n && n !== "(sin asignar)" && !/vacante/i.test(n)).map(([k]) => k); c.carteras = c.carteras.length === todas.length ? [] : todas.sort(); render(); return true; }
      if (bd.opNueva) { const id = nuevaOport(bd.opNueva); guardar(); render(); setTimeout(() => { const el = document.querySelector(`input[data-op="${id}"][data-campo="cliente"]`); if (el) el.focus(); }, 30); return true; }
      if ("opPegar" in bd) { UI.pegar = !UI.pegar; render(); return true; }
      if (bd.opImportar) { importarPegado(bd.opImportar); return true; }
      if (bd.opBorrar) { if (UI.borrar === "o" + bd.opBorrar) { delete G.oport[bd.opBorrar]; UI.borrar = null; guardar(); } else UI.borrar = "o" + bd.opBorrar; render(); return true; }
      if ("motivoNuevo" in bd) { G.config.motivos = [...motivos(), "Nuevo motivo"]; guardar(); render(); return true; }
      if (bd.motivoBorrar !== undefined) { const L = [...motivos()]; L.splice(+bd.motivoBorrar, 1); G.config.motivos = L; guardar(); render(); return true; }
      return false;
    }
    if (tipo === "change") {
      if (t.id === "camp-sel") { UI.campSel = t.value; render(); return true; }
      if (d.cbCart !== undefined) { const c = UI.campBorrador; c.carteras = t.checked ? [...new Set([...c.carteras, t.value])].sort() : c.carteras.filter((x) => x !== t.value); render(); return true; }
      if ("cbPrincipal" in d) { UI.campBorrador.metas.principal = t.value; return true; }
      if (d.cb && t.tagName === "SELECT") { UI.campBorrador[d.cb] = t.value; return true; }
      if (d.op && (t.tagName === "SELECT" || t.type === "date")) {
        const o = G.oport[d.op]; if (!o) return true; o[d.campo] = t.value;
        if (d.campo === "estado") { if (t.value !== "abierta" && !o.fecha_cierre) o.fecha_cierre = hoyIso(); if (t.value !== "perdida") o.motivo = ""; if (t.value === "abierta") o.fecha_cierre = ""; }
        guardar(); render(); return true;
      }
      if (d.op) { const o = G.oport[d.op]; if (!o) return true; o[d.campo] = d.campo === "monto" || d.campo === "monto_facturado" ? (t.value.trim() === "" ? (d.campo === "monto" ? 0 : null) : +t.value.replace(/[$,\s]/g, "") || 0) : d.campo === "cliente" ? t.value.trim().toUpperCase() : t.value; guardar(); render(); return true; }
      if (d.motivo !== undefined) { const L = [...motivos()]; L[+d.motivo] = t.value.trim() || L[+d.motivo]; G.config.motivos = L; guardar(); render(); return true; }
      return false;
    }
    if (tipo === "input") {
      if (d.cb) { UI.campBorrador[d.cb] = t.value; return true; }
      if (d.cbMeta) { UI.campBorrador.metas[d.cbMeta] = t.value.replace(/[$,\s]/g, ""); return true; }
      return false;
    }
    if (tipo === "submit" && t.id === "f-campana") { ev.preventDefault(); guardarCampana(); return true; }
    return false;
  }
  document.addEventListener("submit", (ev) => { if (UI.tab === "campanas" || UI.foco) eventosCampana(ev, "submit"); });

  /* ===================================================================== */
  /*                                USUARIOS                                 */
  /* ===================================================================== */
  const US = { lista: null, cargando: false, error: "", form: { nombre: "", email: "", rol: "lector", password: "", pedir: true }, reset: null };
  const passTemporal = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; const r = new Uint32Array(10); crypto.getRandomValues(r); return "Isel-" + [...r].map((x) => A[x % A.length]).join(""); };
  async function cargarUsuarios() {
    if (!NUBE) return;
    US.cargando = true; US.error = "";
    try { US.lista = (await NUBE.funcion("jm-usuarios", { accion: "listar" })).usuarios || []; }
    catch (e) { US.error = e.status === 404 ? "La función de usuarios no está instalada en Supabase (jm-usuarios)." : e.message; }
    US.cargando = false; if (UI.tab === "usuarios") render();
  }
  async function accionUsuario(cuerpo, ok) {
    try { const r = await NUBE.funcion("jm-usuarios", cuerpo); if (ok !== false) toast(ok || (r && r.mensaje) || "Listo"); await cargarUsuarios(); return r; }
    catch (e) { toast(e.message); if (e.status === 401) sesionPerdida(); else render(); return null; }
  }
  function vistaUsuarios() {
    if (!NUBE) return `<section class="bloque"><header><h2>Usuarios</h2></header><div class="bloque-cuerpo"><div class="aviso info">La administración de usuarios funciona en la versión conectada a Supabase.</div></div></section>`;
    if (!esAdmin()) return `<section class="bloque"><div class="bloque-cuerpo"><div class="aviso">Solo los administradores pueden ver esta sección.</div></div></section>`;
    if (US.lista === null && !US.cargando && !US.error) cargarUsuarios();
    const F = US.form;
    const filas = (US.lista || []).map((u) => `<tr>
      <td class="nombre"><b>${esc(u.nombre || "—")}</b><div class="cod" style="margin:0">${esc(u.email)}</div></td>
      <td><select class="estado-sel" data-us-rol="${u.user_id}" aria-label="Rol de ${esc(u.email)}"><option value="lector" ${u.rol === "lector" ? "selected" : ""}>Solo ver</option><option value="admin" ${u.rol === "admin" ? "selected" : ""}>Administrador</option></select></td>
      <td><label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-us-activo="${u.user_id}" ${u.activo ? "checked" : ""}> ${u.activo ? "Activo" : "Sin acceso"}</label></td>
      <td class="mono" style="font-size:12px">${u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "Nunca"}</td>
      <td>${u.debe_cambiar ? '<span class="sem warn">Contraseña temporal</span>' : '<span class="sem ok">Personal</span>'}</td>
      <td style="white-space:nowrap">${US.reset === u.user_id ? `<span style="display:inline-flex;gap:6px;align-items:center"><input class="campo" id="us-reset-pass" style="width:170px;padding:4px 8px" value="${esc(passTemporal())}" aria-label="Contraseña temporal"><button class="btn chico prim" type="button" data-us-reset-ok="${u.user_id}">Asignar</button><button class="btn chico" type="button" data-us-reset="">Cancelar</button></span>`
        : `<button class="btn chico" type="button" data-us-reset="${u.user_id}">Asignar contraseña temporal</button> ${u.user_id !== YO.id ? `<button class="btn chico peligro" type="button" data-us-quitar="${u.user_id}">${UI.borrar === "u" + u.user_id ? "Confirmar" : "Quitar acceso"}</button>` : '<span class="cod">tú</span>'}`}</td></tr>`).join("");
    return `<section class="bloque" id="b-usuarios"><header><h2>Usuarios y accesos</h2><span class="pregunta">Quién puede entrar y qué puede hacer</span></header><div class="bloque-cuerpo">
      <div class="grid-6-4"><div>
        <div class="sub">Usuarios con acceso <span class="der"><button class="btn chico" type="button" data-us-recargar>Actualizar</button></span></div>
        ${US.error ? `<div class="aviso">${esc(US.error)}</div>` : US.lista === null ? `<div class="cargando" style="padding:20px">Cargando usuarios…</div>` : `<div class="tabla-wrap" style="max-height:none"><table class="t"><thead><tr><th>Usuario</th><th>Rol</th><th>Acceso</th><th>Último ingreso</th><th>Contraseña</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`}
        <p class="nota-pie"><b>Solo ver:</b> consulta todo y usa filtros, periodos, Ampliar y el simulador, sin modificar nada. <b>Administrador:</b> acceso total, incluida esta sección. Quitar el acceso no borra la cuenta, porque también se usa en el PDI.</p>
      </div><div>
        ${US.ultimo ? `<div class="aviso info" style="margin-bottom:10px"><b>Datos de acceso para compartir</b><br>Correo: <span class="mono">${esc(US.ultimo.email)}</span><br>Contraseña temporal: <span class="mono">${esc(US.ultimo.password)}</span><div style="display:flex;gap:8px;margin-top:8px"><button class="btn chico prim" type="button" data-us-copiar>Copiar</button><button class="btn chico" type="button" data-us-ok>Listo</button></div></div>` : ""}
        <div class="sub">Agregar usuario</div>
        <form id="f-usuario" class="caja" style="display:flex;flex-direction:column;gap:10px">
          <div><label class="campo-label" for="us-nombre">Nombre</label><input class="campo" id="us-nombre" data-usf="nombre" value="${esc(F.nombre)}" required></div>
          <div><label class="campo-label" for="us-email">Correo</label><input class="campo" type="email" id="us-email" data-usf="email" value="${esc(F.email)}" required></div>
          <div><label class="campo-label" for="us-rol">Rol</label><select class="campo" id="us-rol" data-usf="rol"><option value="lector" ${F.rol === "lector" ? "selected" : ""}>Solo ver</option><option value="admin" ${F.rol === "admin" ? "selected" : ""}>Administrador</option></select></div>
          <div><label class="campo-label" for="us-pass">Contraseña temporal</label><div style="display:flex;gap:6px"><input class="campo" id="us-pass" data-usf="password" value="${esc(F.password || (F.password = passTemporal()))}" minlength="8" required><button class="btn chico" type="button" data-us-generar>Generar</button></div></div>
          <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="checkbox" id="us-pedir" data-usf="pedir" ${F.pedir ? "checked" : ""}> <span>Pedir cambio de contraseña al entrar<br><span class="nota-pie" style="margin:0">Desmárcalo si es una cuenta de solo vista que compartirán varias personas.</span></span></label>
          <button class="btn prim" type="submit" id="us-crear">Agregar usuario</button>
          <p class="nota-pie" style="margin:0">Comparte el correo y la contraseña temporal con la persona por un medio seguro. Si el correo ya tiene cuenta (por ejemplo del PDI), solo se le da acceso y conserva su contraseña.</p>
        </form></div></div>
    </div></section>`;
  }
  function eventosUsuarios(ev, tipo) {
    const t = ev.target, d = t.dataset || {};
    if (tipo === "click") {
      const b = t.closest("button") || t; const bd = b.dataset || {};
      if ("usRecargar" in bd) { US.lista = null; US.error = ""; render(); return true; }
      if ("usGenerar" in bd) { US.form.password = passTemporal(); render(); return true; }
      if (bd.usReset !== undefined) { US.reset = bd.usReset || null; render(); return true; }
      if (bd.usResetOk) { const p = ($("#us-reset-pass") || {}).value || ""; if (p.length < 8) { toast("Mínimo 8 caracteres."); return true; } const u = (US.lista || []).find((x) => x.user_id === bd.usResetOk); US.reset = null; accionUsuario({ accion: "password", user_id: bd.usResetOk, password: p, pedir_cambio: true }, "Contraseña temporal asignada").then((r) => { if (r) { US.ultimo = { email: u ? u.email : "", password: p }; render(); } }); return true; }
      if ("usCopiar" in bd) { copiar(`Correo: ${US.ultimo.email}\nContraseña temporal: ${US.ultimo.password}\nEntra en: ${location.href.split("#")[0]}`); return true; }
      if ("usOk" in bd) { US.ultimo = null; render(); return true; }
      if (bd.usQuitar) { if (UI.borrar === "u" + bd.usQuitar) { UI.borrar = null; accionUsuario({ accion: "quitar", user_id: bd.usQuitar }, "Acceso retirado"); } else { UI.borrar = "u" + bd.usQuitar; render(); } return true; }
      return false;
    }
    if (tipo === "change") {
      if (d.usRol) { accionUsuario({ accion: "rol", user_id: d.usRol, rol: t.value }, "Rol actualizado"); return true; }
      if (d.usActivo) { accionUsuario({ accion: "activo", user_id: d.usActivo, activo: t.checked }, t.checked ? "Acceso activado" : "Acceso desactivado"); return true; }
      if (d.usf === "pedir") { US.form.pedir = t.checked; return true; }
      if (d.usf) { US.form[d.usf] = t.value; return true; }
      return false;
    }
    if (tipo === "input" && d.usf && d.usf !== "pedir") { US.form[d.usf] = t.value; return true; }
    if (tipo === "submit" && t.id === "f-usuario") {
      ev.preventDefault();
      const F = US.form; const b = $("#us-crear"); if (b) { b.disabled = true; b.textContent = "Agregando…"; }
      accionUsuario({ accion: "crear", nombre: F.nombre, email: F.email, rol: F.rol, password: F.password, pedir_cambio: F.pedir }).then((r) => {
        if (r) { if (r.nuevo) US.ultimo = { email: F.email.trim().toLowerCase(), password: F.password }; US.form = { nombre: "", email: "", rol: "lector", password: "", pedir: true }; }
        render();
      });
      return true;
    }
    return false;
  }
  document.addEventListener("submit", (ev) => { if (UI.tab === "usuarios") eventosUsuarios(ev, "submit"); });

  /* ------------------------------------------ solo lectura (rol lector) */
  const EDITA = ["nota", "juntaCampo", "cf", "an", "canc", "kx", "fc", "cliCart", "ed", "kpi", "cli", "op", "motivo", "cb", "cbCart", "cbMeta", "cbPrincipal"];
  const ACCIONES_ADMIN = ["modoEd", "compNuevo", "sugerir", "compBorrar", "anRegenerar", "anNuevo", "anBorrar", "anComp", "cancNueva", "cancBorrar", "kxNuevo", "kxBorrar", "fcSem", "igualar", "rest", "edQuitar", "edTodo", "baseReset", "importarTxt", "campNueva", "campEditar", "campBorrar", "opNueva", "opPegar", "opImportar", "opBorrar", "motivoNuevo", "motivoBorrar", "cbTodas"];
  const esEdicion = (d) => EDITA.some((k) => d[k] !== undefined) || ACCIONES_ADMIN.some((k) => d[k] !== undefined);
  function bloquearLector(raiz) {
    document.body.classList.toggle("lector", !esAdmin());
    if (esAdmin()) return;
    const sel = EDITA.map((k) => `[data-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}]`).join(",");
    $$(sel, raiz).forEach((el) => { if (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "radio" || el.type === "date" || el.type === "range") el.disabled = true; else el.readOnly = true; el.classList.add("solo-lectura"); });
    $$(ACCIONES_ADMIN.map((k) => `[data-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}]`).join(","), raiz).forEach((el) => { if (el.dataset.fcSem !== undefined) el.disabled = true; else el.hidden = true; });
    $$('label[for="archivos-excel"], label[for="archivo-resp"], .solo-admin', raiz).forEach((el) => (el.hidden = true));
    $$("textarea[data-nota]", raiz).forEach((ta) => { if (!ta.value.trim()) { const det = ta.closest("details"); if (det) det.hidden = true; } });
  }

  /* --------------------------------------------- líneas de tendencia */
  function regresion(data) {
    const pts = data.map((y, x) => [x, y]).filter(([, y]) => fin(y));
    if (pts.length < 3) return null;
    const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
    const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
    const den = n * sxx - sx * sx; if (!den) return null;
    const m = (n * sxy - sx * sy) / den, b = (sy - m * sx) / n;
    return { m, b, x0: pts[0][0], x1: pts[n - 1][0] };
  }
  function agregarTendencias(cfg) {
    if (G.prefs && G.prefs.tendencias === false) return;
    if ((cfg.options || {}).indexAxis === "y") return;
    const C = colores(); const extra = [];
    (cfg.data.datasets || []).forEach((ds, i) => {
      if (!ds.tend || ds.tendencia) return;
      const r = regresion(ds.data || []); if (!r) return;
      const hasta = Number.isInteger(ds.tendHasta) ? ds.tendHasta : r.x1;
      const piso = (v) => (fin(ds.tendMin) ? Math.max(ds.tendMin, v) : v);
      const data = (ds.data || []).map((_, x) => (x >= r.x0 && x <= hasta ? piso(r.m * x + r.b) : null));
      if (hasta >= data.length) for (let x = data.length; x <= hasta; x++) data.push(piso(r.m * x + r.b));
      const color = ds.tendColor || (typeof ds.borderColor === "string" ? ds.borderColor : typeof ds.backgroundColor === "string" ? ds.backgroundColor : C.ink2);
      const paso = ds.tendPaso || "mes";
      const pend = ds.tend === "M" ? `${r.m >= 0 ? "+" : ""}${etqM(r.m)}/${paso}` : ds.tend === "%" ? `${r.m >= 0 ? "+" : "−"}${Math.abs(r.m * 100).toFixed(1)} pts/${paso}` : ds.tend === "x" ? `${r.m >= 0 ? "+" : "−"}${Math.abs(r.m).toFixed(2)}×/${paso}` : `${r.m >= 0 ? "+" : "−"}${Math.abs(r.m).toFixed(1)}/${paso}`;
      extra.push({ type: "line", label: `${ds.tendNombre || "Tendencia " + (ds.label || "")} (${pend})`, data, borderColor: color, backgroundColor: color, borderDash: [7, 5], borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 0, fill: false, tendencia: true, order: -10, stack: "__t" + i, yAxisID: ds.yAxisID, spanGaps: true });
    });
    cfg.data.datasets.push(...extra);
  }

  /* ===================================================================== */
  /*                       NUBE · sincronización con Supabase                */
  /* ===================================================================== */
  const COLS_CAMP = ["id", "nombre", "tipo", "estado", "inicio", "fin", "marca", "modelos", "carteras", "objetivo", "metas", "notas"];
  const COLS_OP = ["id", "campana_id", "cartera", "cliente", "oportunidad", "marca", "modelo", "monto", "estado", "motivo", "detalle", "competidor", "fecha_alta", "fecha_cierre", "fecha_factura", "monto_facturado", "notas"];
  const SYNC = { reg: new Map(), camp: new Map(), op: new Map(), base: new Map(), ts: null, tsBase: null, enCurso: false, otraVez: false, estado: "ok" };
  const limpiarFila = (o, cols) => { const r = {}; for (const c of cols) r[c] = o[c] === "" || o[c] === undefined ? null : o[c]; if (cols === COLS_OP) { r.monto = +r.monto || 0; r.monto_facturado = r.monto_facturado == null ? null : +r.monto_facturado || 0; r.cliente = r.cliente || "(sin cliente)"; } if (cols === COLS_CAMP) { r.carteras = r.carteras || []; r.metas = r.metas || {}; r.nombre = r.nombre || "(sin nombre)"; } return r; };
  // Registros: todo lo que se captura en la junta, como pares colección/clave
  function registrosActuales() {
    const m = new Map();
    for (const [k, v] of Object.entries(G.juntas || {})) m.set(`junta|${k}`, v);
    for (const x of G.compromisos || []) m.set(`compromiso|${x.id}`, x);
    for (const t of ["h", "k", "c", "s"]) for (const [k, v] of Object.entries(G.ed[t] || {})) m.set(`edicion|${t}|${k}`, v);
    for (const [k, v] of Object.entries(G.analisis || {})) m.set(`analisis|${k}`, v);
    for (const [k, v] of Object.entries(G.cliCart || {})) m.set(`cliente_cartera|${k}`, { cartera: v });
    for (const [k, v] of Object.entries(G.config || {})) m.set(`config|${k}`, v);
    return m;
  }
  function aplicarRegistro(col, clave, datos, borrado) {
    if (col === "junta") { if (borrado) delete G.juntas[clave]; else G.juntas[clave] = datos; }
    else if (col === "compromiso") { G.compromisos = G.compromisos.filter((x) => x.id !== clave); if (!borrado) G.compromisos.push(datos); }
    else if (col === "edicion") { const i = clave.indexOf("|"); const t = clave.slice(0, i), k = clave.slice(i + 1); if (G.ed[t]) { if (borrado) delete G.ed[t][k]; else G.ed[t][k] = datos; } }
    else if (col === "analisis") { if (borrado) delete G.analisis[clave]; else G.analisis[clave] = datos; }
    else if (col === "cliente_cartera") { if (borrado) delete G.cliCart[clave]; else G.cliCart[clave] = datos.cartera; }
    else if (col === "config") { if (borrado) delete G.config[clave]; else G.config[clave] = datos; }
  }
  const claveReg = (r) => `${r.coleccion}|${r.clave}`;
  const masReciente = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

  function marcarEstado(e, detalle) {
    SYNC.estado = e;
    const el = document.getElementById("estado-sync");
    if (el) { el.dataset.e = e; el.textContent = { pendiente: "Guardando…", ok: "Guardado", error: "Sin guardar · reintentar" }[e] || ""; el.title = detalle || ""; }
  }
  function programarSync() {
    marcarEstado("pendiente");
    clearTimeout(guardadoPend);
    guardadoPend = setTimeout(sincronizar, 700);
  }
  async function sincronizar() {
    if (!NUBE || !esAdmin()) return;
    if (SYNC.enCurso) { SYNC.otraVez = true; return; }
    SYNC.enCurso = true;
    try {
      // Registros
      const act = registrosActuales(); const subir = [];
      for (const [k, v] of act) { const j = JSON.stringify(v); if (SYNC.reg.get(k) !== j) { const i = k.indexOf("|"); subir.push({ coleccion: k.slice(0, i), clave: k.slice(i + 1), datos: v, borrado: false, _j: j, _k: k }); } }
      for (const k of SYNC.reg.keys()) if (!act.has(k)) { const i = k.indexOf("|"); subir.push({ coleccion: k.slice(0, i), clave: k.slice(i + 1), datos: {}, borrado: true, _j: null, _k: k }); }
      for (let i = 0; i < subir.length; i += 200) {
        const lote = subir.slice(i, i + 200);
        await NUBE.db.guardar("jm_registros", lote.map(({ _j, _k, ...r }) => r), "coleccion,clave");
        lote.forEach((r) => (r._j === null ? SYNC.reg.delete(r._k) : SYNC.reg.set(r._k, r._j)));
      }
      // Campañas y oportunidades
      for (const [tabla, obj, mapa, cols] of [["jm_campanas", G.campanas, SYNC.camp, COLS_CAMP], ["jm_campana_oport", G.oport, SYNC.op, COLS_OP]]) {
        const filas = [];
        for (const [id, o] of Object.entries(obj || {})) { const f = limpiarFila(o, cols); const j = JSON.stringify(f); if (mapa.get(id) !== j) filas.push({ f, j, id }); }
        const borrar = [...mapa.keys()].filter((id) => !(obj || {})[id]);
        if (filas.length) { await NUBE.db.guardar(tabla, filas.map((x) => ({ ...x.f, borrado: false })), "id"); filas.forEach((x) => mapa.set(x.id, x.j)); }
        for (const id of borrar) { await NUBE.db.cambiar(tabla, { id }, { borrado: true }); mapa.delete(id); }
      }
      marcarEstado("ok");
    } catch (e) {
      console.error(e); marcarEstado("error", e.message);
      if (e.status === 401) return sesionPerdida();
      toast("No se pudo guardar: " + e.message);
    } finally {
      SYNC.enCurso = false;
      if (SYNC.otraVez) { SYNC.otraVez = false; sincronizar(); }
    }
  }

  // Datos de los reportes: se guardan en partes (base, facturas por mes, fotos por mes)
  function partesBase(B) {
    const P = new Map();
    const { facturas, fotos, ...resto } = B;
    P.set("base", resto);
    if (facturas) {
      const { docs, ...meta } = facturas; P.set("facturas:meta", meta);
      const porMes = {}; for (const d of docs || []) (porMes[d[1].slice(0, 7)] = porMes[d[1].slice(0, 7)] || []).push(d);
      for (const [m, L] of Object.entries(porMes)) P.set("facturas:" + m, L);
    }
    for (const [m, f] of Object.entries(fotos || {})) P.set("fotos:" + m, f);
    return P;
  }
  function armarBase(filas) {
    const r = new Map(filas.map((f) => [f.clave, f.datos]));
    if (!r.has("base")) return null;
    const B = r.get("base");
    if (r.has("facturas:meta")) {
      const docs = []; [...r.keys()].filter((k) => /^facturas:\d{4}-\d{2}$/.test(k)).sort().forEach((k) => docs.push(...r.get(k)));
      B.facturas = Object.assign({}, r.get("facturas:meta"), { docs });
    }
    const fotos = {}; for (const [k, v] of r) if (k.startsWith("fotos:")) fotos[k.slice(6)] = v;
    if (Object.keys(fotos).length) B.fotos = fotos;
    return B;
  }
  async function guardarBase(B, avance) {
    const P = partesBase(B); const subir = [];
    for (const [k, v] of P) { const j = JSON.stringify(v); if (SYNC.base.get(k) !== j) subir.push({ clave: k, datos: v, _j: j }); }
    let n = 0;
    for (const x of subir) {
      if (avance) avance(`Guardando en el servidor ${++n} de ${subir.length}…`);
      await NUBE.db.guardar("jm_base", [{ clave: x.clave, datos: x.datos }], "clave");
      SYNC.base.set(x.clave, x._j);
    }
    SYNC.tsBase = new Date().toISOString();
  }

  async function cargarNube() {
    const [base, regs, camps, ops] = await Promise.all([
      NUBE.db.leer("jm_base"), NUBE.db.leer("jm_registros", { filtro: { borrado: false } }),
      NUBE.db.leer("jm_campanas", { filtro: { borrado: false } }), NUBE.db.leer("jm_campana_oport", { filtro: { borrado: false } }),
    ]);
    BASE = armarBase(base);
    SYNC.base = new Map(base.map((f) => [f.clave, JSON.stringify(f.datos)]));
    SYNC.tsBase = base.reduce((m, f) => masReciente(m, f.actualizado_en), null);
    const prefs = G.prefs; G = vacio(); G.prefs = prefs;
    for (const r of regs) { aplicarRegistro(r.coleccion, r.clave, r.datos, false); }
    SYNC.reg = new Map([...registrosActuales()].map(([k, v]) => [k, JSON.stringify(v)]));
    for (const c of camps) G.campanas[c.id] = limpiarFila(c, COLS_CAMP);
    for (const o of ops) G.oport[o.id] = limpiarFila(o, COLS_OP);
    SYNC.camp = new Map(Object.entries(G.campanas).map(([id, o]) => [id, JSON.stringify(limpiarFila(o, COLS_CAMP))]));
    SYNC.op = new Map(Object.entries(G.oport).map(([id, o]) => [id, JSON.stringify(limpiarFila(o, COLS_OP))]));
    SYNC.ts = [...regs, ...camps, ...ops].reduce((m, f) => masReciente(m, f.actualizado_en), null) || new Date(0).toISOString();
  }

  // Revisa cambios hechos por otras personas (cada 30 s con la pestaña visible)
  let RENDER_PEND = false;
  const editando = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "search" && a.type !== "range"; };
  function renderSeguro() { if (editando() || UI.abierto) RENDER_PEND = true; else { if (BASE) indexar(); render(); } }
  document.addEventListener("focusout", () => setTimeout(() => { if (RENDER_PEND && !editando()) { RENDER_PEND = false; if (BASE) indexar(); render(); } }, 50));
  async function revisarCambios() {
    if (!NUBE || !YO || document.hidden || SYNC.enCurso || SYNC.estado === "pendiente") return;
    try {
      const yo = (await NUBE.db.leer("jm_acceso", { filtro: { user_id: YO.id } }))[0];
      if (!yo || !yo.activo) { await salir("Tu acceso a esta herramienta fue retirado."); return; }
      if (yo.rol !== YO.rol) { YO.rol = yo.rol; UI.modoEdicion = false; toast(yo.rol === "admin" ? "Ahora tienes acceso de administrador." : "Tu acceso cambió a solo lectura."); render(); }
      const desde = SYNC.ts || new Date(0).toISOString();
      const [regs, camps, ops, base] = await Promise.all([
        NUBE.db.leer("jm_registros", { filtro: { actualizado_en: ["gt", desde] } }), NUBE.db.leer("jm_campanas", { filtro: { actualizado_en: ["gt", desde] } }),
        NUBE.db.leer("jm_campana_oport", { filtro: { actualizado_en: ["gt", desde] } }), NUBE.db.leer("jm_base", { select: "clave,actualizado_en", filtro: { actualizado_en: ["gt", SYNC.tsBase || desde] } }),
      ]);
      let cambio = false;
      const locales = registrosActuales();
      for (const r of regs) {
        const k = claveReg(r); const loc = locales.get(k);
        const pendiente = (loc ? JSON.stringify(loc) : undefined) !== SYNC.reg.get(k);
        if (!pendiente) { aplicarRegistro(r.coleccion, r.clave, r.datos, r.borrado); if (r.borrado) SYNC.reg.delete(k); else SYNC.reg.set(k, JSON.stringify(r.datos)); cambio = true; }
      }
      for (const [rows, obj, mapa, cols] of [[camps, G.campanas, SYNC.camp, COLS_CAMP], [ops, G.oport, SYNC.op, COLS_OP]]) for (const r of rows) {
        const loc = obj[r.id] ? JSON.stringify(limpiarFila(obj[r.id], cols)) : undefined;
        if (loc !== mapa.get(r.id)) continue;
        if (r.borrado) { delete obj[r.id]; mapa.delete(r.id); } else { obj[r.id] = limpiarFila(r, cols); mapa.set(r.id, JSON.stringify(obj[r.id])); }
        cambio = true;
      }
      SYNC.ts = [...regs, ...camps, ...ops].reduce((m, f) => masReciente(m, f.actualizado_en), SYNC.ts);
      if (base.length) { SYNC.tsBase = base.reduce((m, f) => masReciente(m, f.actualizado_en), SYNC.tsBase); avisoDatosNuevos(); }
      if (cambio) renderSeguro();
    } catch (e) { if (e.status === 401) sesionPerdida(); }
  }
  function avisoDatosNuevos() {
    if (document.getElementById("aviso-datos")) return;
    const d = document.createElement("div"); d.id = "aviso-datos"; d.className = "aviso-flotante";
    d.innerHTML = `<span>Hay datos nuevos de los reportes.</span><button class="btn chico prim" type="button" data-recargar-base>Actualizar</button>`;
    document.body.appendChild(d);
  }
  async function recargarBase() {
    const el = document.getElementById("aviso-datos"); if (el) el.remove();
    try { const base = await NUBE.db.leer("jm_base"); BASE = armarBase(base); SYNC.base = new Map(base.map((f) => [f.clave, JSON.stringify(f.datos)])); FAC = null; VCF = null; indexar(); render(); toast("Datos actualizados"); }
    catch (e) { toast("No se pudieron actualizar los datos: " + e.message); }
  }

  /* ------------------------------------------------- inactividad (10 min) */
  const INACT_MS = 10 * 60 * 1000, AVISO_MS = 60 * 1000, LS_ACT = "isel-jm-actividad";
  let ultimaAct = Date.now(), relojInact = null, ultimaEscritura = 0;
  function actividad() {
    ultimaAct = Date.now();
    if (ultimaAct - ultimaEscritura > 5000) { ultimaEscritura = ultimaAct; try { localStorage.setItem(LS_ACT, String(ultimaAct)); } catch (e) {} }
    const av = document.getElementById("aviso-inact"); if (av) av.remove();
  }
  ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, (e) => { if (YO && !(e.target && e.target.closest && e.target.closest("#aviso-inact"))) actividad(); }, { passive: true, capture: true }));
  let ultimoMov = 0;
  window.addEventListener("mousemove", (e) => { if (YO && Date.now() - ultimoMov > 3000 && !(e.target && e.target.closest && e.target.closest("#aviso-inact"))) { ultimoMov = Date.now(); actividad(); } }, { passive: true });
  const actividadCompartida = () => { let x = 0; try { x = +localStorage.getItem(LS_ACT) || 0; } catch (e) {} return Math.max(ultimaAct, x); };
  function vigilarInactividad() {
    clearInterval(relojInact);
    actividad();
    relojInact = setInterval(() => {
      if (!YO) return;
      const resta = INACT_MS - (Date.now() - actividadCompartida());
      if (resta <= 0) { salir("Tu sesión se cerró después de 10 minutos sin actividad."); return; }
      let av = document.getElementById("aviso-inact");
      if (resta <= AVISO_MS) {
        if (!av) {
          av = document.createElement("div"); av.id = "aviso-inact"; av.className = "modal-fondo"; av.setAttribute("role", "alertdialog"); av.setAttribute("aria-modal", "true");
          av.innerHTML = `<div class="modal"><strong>¿Sigues ahí?</strong><p>Por seguridad, la sesión se cerrará en <b id="inact-seg">60</b> segundos por inactividad.</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" data-salir>Cerrar sesión</button><button class="btn prim" type="button" data-seguir>Seguir conectado</button></div></div>`;
          document.body.appendChild(av); const b = av.querySelector("[data-seguir]"); if (b) b.focus();
        }
        const s = document.getElementById("inact-seg"); if (s) s.textContent = Math.ceil(resta / 1000);
      } else if (av) av.remove();
    }, 1000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && YO) { if (Date.now() - actividadCompartida() >= INACT_MS) salir("Tu sesión se cerró después de 10 minutos sin actividad."); else revisarCambios(); } });
  setInterval(() => revisarCambios(), 30000);

  /* --------------------------------------------------- acceso y sesión */
  async function salir(mensaje) {
    if (NUBE && esAdmin() && SYNC.estado === "pendiente") { clearTimeout(guardadoPend); try { await sincronizar(); } catch (e) {} }
    YO = null; clearInterval(relojInact);
    ["aviso-inact", "aviso-datos"].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    try { localStorage.removeItem(LS_ACT); } catch (e) {}
    if (NUBE) await NUBE.auth.salir();
    BASE = null; G = Object.assign(vacio(), { prefs: G.prefs }); UI.foco = null; UI.modoEdicion = false; document.body.classList.remove("en-pres", "lector");
    pantallaLogin(mensaje);
  }
  function sesionPerdida() { if (YO) salir("Tu sesión expiró. Vuelve a entrar."); }
  function cajaAcceso(contenido) {
    document.body.classList.remove("en-pres", "lector");
    document.getElementById("app").innerHTML = `<div class="acceso"><div class="acceso-caja"><strong>ISEL</strong><p>Junta mensual de resultados de ventas</p>${contenido}</div></div>`;
  }
  function pantallaLogin(mensaje, error) {
    cajaAcceso(`${mensaje ? `<div class="aviso info">${esc(mensaje)}</div>` : ""}
      <form id="f-login" style="display:flex;flex-direction:column;gap:12px">
        <label class="campo-label" for="l-email">Correo</label><input class="campo" type="email" id="l-email" autocomplete="username" required>
        <label class="campo-label" for="l-pass">Contraseña</label><input class="campo" type="password" id="l-pass" autocomplete="current-password" required>
        ${error ? `<span class="error">${esc(error)}</span>` : ""}
        <button class="btn prim" type="submit" id="l-entrar">Entrar</button>
      </form><p class="nota-pie">¿Olvidaste tu contraseña? Pídele al administrador que te asigne una temporal.</p>`);
    $("#l-email").focus();
    $("#f-login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = $("#l-entrar"); b.disabled = true; b.textContent = "Entrando…";
      try { await NUBE.auth.entrar($("#l-email").value, $("#l-pass").value); await entrarConSesion(); }
      catch (x) { const em = $("#l-email").value; pantallaLogin(null, x.message); $("#l-email").value = em; $("#l-pass").focus(); }
    });
  }
  function pantallaCambio(forzado, error) {
    cajaAcceso(`<form id="f-cambio" style="display:flex;flex-direction:column;gap:12px">
        <div class="aviso info">${forzado ? "Entraste con una contraseña temporal. Define tu contraseña personal para continuar." : "Cambia tu contraseña."}</div>
        <label class="campo-label" for="c-pass1">Nueva contraseña (mínimo 8 caracteres)</label><input class="campo" type="password" id="c-pass1" minlength="8" autocomplete="new-password" required>
        <label class="campo-label" for="c-pass2">Repite la contraseña</label><input class="campo" type="password" id="c-pass2" minlength="8" autocomplete="new-password" required>
        ${error ? `<span class="error">${esc(error)}</span>` : ""}
        <div style="display:flex;gap:8px;justify-content:flex-end">${forzado ? `<button class="btn" type="button" data-salir>Salir</button>` : `<button class="btn" type="button" data-cancelar-cambio>Cancelar</button>`}<button class="btn prim" type="submit">Guardar contraseña</button></div>
      </form>`);
    $("#c-pass1").focus();
    $("#f-cambio").addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = $("#c-pass1").value, b = $("#c-pass2").value;
      if (a.length < 8) return pantallaCambio(forzado, "La contraseña debe tener al menos 8 caracteres.");
      if (a !== b) return pantallaCambio(forzado, "Las contraseñas no coinciden.");
      try { await NUBE.auth.cambiarPassword(a); await NUBE.db.rpc("jm_password_cambiada"); toast("Contraseña actualizada"); await entrarConSesion(); }
      catch (x) { pantallaCambio(forzado, x.message); }
    });
  }
  async function entrarConSesion() {
    const s = NUBE.auth.sesion(); if (!s) return pantallaLogin();
    cajaAcceso(`<div class="cargando" style="padding:20px 0">Cargando datos…</div>`);
    let yo;
    try { yo = (await NUBE.db.leer("jm_acceso", { filtro: { user_id: s.user.id } }))[0]; }
    catch (e) { if (e.status === 401) { NUBE.auth.olvidar(); return pantallaLogin("Tu sesión expiró. Vuelve a entrar."); } return pantallaLogin(null, e.message); }
    if (!yo || !yo.activo) { await NUBE.auth.salir(); return pantallaLogin(null, "Tu cuenta no tiene acceso a esta herramienta. Pídele acceso al administrador."); }
    YO = { id: s.user.id, email: yo.email || s.user.email, nombre: yo.nombre || "", rol: yo.rol };
    if (yo.debe_cambiar) return pantallaCambio(true);
    vigilarInactividad();
    try { await cargarNube(); } catch (e) { return cajaAcceso(`<div class="aviso">No se pudieron cargar los datos: ${esc(e.message)}</div><button class="btn" type="button" data-salir>Salir</button>`); }
    if (!BASE) return pantallaSinBase();
    arrancar();
  }
  function pantallaSinBase() {
    if (!esAdmin()) return cajaAcceso(`<div class="aviso info">El administrador todavía no ha cargado los reportes.</div><button class="btn" type="button" data-salir>Salir</button>`);
    cajaAcceso(`<div class="aviso info">La base de datos está vacía. Carga los reportes para empezar.</div>
      <div class="sub" style="margin:4px 0 0">Opción 1 · Datos actuales de la página</div>
      <p class="nota-pie" style="margin:0">Importa los datos que ya tenía la página (Resultado de ventas 2025 y 2026, Tablero de septiembre y facturas de Odoo) con la clave de acceso anterior.</p>
      <form id="f-importar" style="display:flex;gap:8px;flex-wrap:wrap"><input class="campo" type="password" id="i-clave" placeholder="Clave anterior" style="flex:1;min-width:160px" required><button class="btn prim" type="submit">Importar</button></form>
      <div class="sub" style="margin:8px 0 0">Opción 2 · Archivos de Excel</div>
      <label class="btn" for="archivos-excel" style="width:max-content">Elegir archivos de Excel</label><input type="file" id="archivos-excel" accept=".xlsx,.xlsm,.xls,.csv" multiple hidden>
      <p class="nota-pie" id="estado-carga">Resultado de ventas del año (y del anterior), Tablero ISEL del mes y Estadísticas de facturas de Odoo.</p>
      <button class="btn chico" type="button" data-salir>Salir</button>`);
    $("#f-importar").addEventListener("submit", async (e) => {
      e.preventDefault();
      const est = $("#estado-carga");
      try {
        est.textContent = "Descifrando…";
        const paq = await (await fetch("datos.enc.json", { cache: "no-store" })).json();
        const B = await descifrar(paq, $("#i-clave").value);
        await guardarBase(B, (m) => (est.textContent = m));
        BASE = B; arrancar(); toast("Datos importados");
      } catch (x) { est.textContent = x.name === "OperationError" ? "La clave no es correcta." : "No se pudo importar: " + x.message; }
    });
  }

  /* ----------------------------------------------------- arranque */
  function ajustarPeriodo() {
    const anios = IDX.anios;
    const a = anios.includes(hoy.getFullYear()) && cerrado(hoy.getFullYear()) > 0 ? hoy.getFullYear() : anios[anios.length - 1];
    P.anio = a; P.mes = Math.max(1, cerrado(a));
    P.trim = Math.ceil(P.mes / 3); P.sem = P.mes > 6 ? 2 : 1;
    P.desde = `${a}-01-01`; P.hasta = isoLocal(new Date(a, P.mes, 0));
  }
  async function descifrar(paq, clave) {
    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(paq.salt), iterations: paq.iter, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(paq.iv) }, key, b64(paq.datos));
    return JSON.parse(new TextDecoder().decode(buf));
  }
  function pantallaClave(paq, error) {
    document.getElementById("app").innerHTML = `<div class="acceso"><form class="acceso-caja" id="f-clave"><strong>ISEL</strong><p>Junta mensual de resultados de ventas. Los datos están cifrados; escribe la clave de acceso.</p>
      <label class="campo-label" for="clave">Clave de acceso</label><input class="campo" type="password" id="clave" autocomplete="current-password" required>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="recordar"> Recordar en este equipo</label>
      ${error ? `<span class="error">${esc(error)}</span>` : ""}<button class="btn prim" type="submit">Entrar</button></form></div>`;
    $("#clave").focus();
    $("#f-clave").addEventListener("submit", async (e) => {
      e.preventDefault();
      const clave = $("#clave").value;
      try { BASE = await descifrar(paq, clave); if ($("#recordar").checked) try { localStorage.setItem(LS_PASS, clave); } catch (x) {} arrancar(); }
      catch (x) { pantallaClave(paq, "La clave no es correcta."); }
    });
  }
  function arrancar() {
    if (!NUBE) try { const b = localStorage.getItem(LS_BASE); if (b) { const x = JSON.parse(b); if (x && x.hechos) { BASE = x; G_BASE_LOCAL = true; } } } catch (e) {}
    if (!esAdmin()) UI.modoEdicion = false;
    if (G.prefs.tema) document.documentElement.dataset.theme = G.prefs.tema;
    indexar(); ajustarPeriodo();
    const mh2 = location.hash.match(/^#ver-([a-z-]+)$/);
    if (mh2) { const id = mh2[1]; if (BLOQUES.some((b) => b[0] === id)) { UI.tab = "junta"; UI.foco = id; } else if (SECC2.some((b) => b[0] === id)) { UI.tab = "analisis"; UI.foco = id; } else if (CAMP_SECC.some((b) => b[0] === id)) { UI.tab = "campanas"; UI.foco = id; } }
    render();
    if (window.matchMedia && !arrancar.tema) { arrancar.tema = true; matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (BASE && document.querySelector(".top")) render(); }); }
  }
  async function iniciar() {
    if (window.DATOS_BASE) { BASE = window.DATOS_BASE; arrancar(); return; }
    if (CONF) {
      if (G.prefs.tema) document.documentElement.dataset.theme = G.prefs.tema;
      NUBE = window.Nube.crear(CONF.url, CONF.llave);
      if (!NUBE.auth.sesion()) return pantallaLogin();
      let ultima = 0; try { ultima = +localStorage.getItem(LS_ACT) || 0; } catch (e) {}
      if (ultima && Date.now() - ultima >= INACT_MS) { await NUBE.auth.salir(); try { localStorage.removeItem(LS_ACT); } catch (e) {} return pantallaLogin("Tu sesión se cerró después de 10 minutos sin actividad."); }
      return entrarConSesion();
    }
    try { const b = localStorage.getItem(LS_BASE); if (b && JSON.parse(b).hechos) { BASE = JSON.parse(b); arrancar(); return; } } catch (e) {}
    try {
      const r = await fetch("datos.enc.json", { cache: "no-store" });
      if (!r.ok) throw new Error("sin datos");
      const paq = await r.json();
      let guardada = null; try { guardada = localStorage.getItem(LS_PASS); } catch (e) {}
      if (guardada) { try { BASE = await descifrar(paq, guardada); arrancar(); return; } catch (e) { try { localStorage.removeItem(LS_PASS); } catch (x) {} } }
      pantallaClave(paq);
    } catch (e) {
      document.getElementById("app").innerHTML = `<div class="cargando">No encontré los datos de la página (datos.enc.json).</div>`;
    }
  }
  iniciar();
})();
