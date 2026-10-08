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
  const LS = "isel-junta-mensual-v1", LS_BASE = "isel-junta-mensual-base-v1", LS_PASS = "isel-junta-mensual-clave";
  const vacio = () => ({ ed: { h: {}, k: {}, c: {}, s: {} }, juntas: {}, compromisos: [], prefs: {} });
  let G = vacio();
  try { const x = JSON.parse(localStorage.getItem(LS) || "null"); if (x) G = Object.assign(vacio(), x, { ed: Object.assign(vacio().ed, x.ed || {}) }); } catch (e) { /* sin almacenamiento */ }
  let guardadoPend = null;
  function guardar() {
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
    IDX = { h, kp, hist, anios: [...anios].sort(), corte };
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
  function chart(id, cfg) { PEND.push(() => { const el = document.getElementById(id); if (!el || !window.Chart) return; if (CH.has(id)) CH.get(id).destroy(); CH.set(id, new Chart(el, cfg)); }); }
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
    Chart.defaults.font.size = 12;
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
    ["otros", "09", "Otros", "Facturas canceladas y pendientes"],
  ];
  function bloque(id, cuerpo, acciones = "") {
    const b = BLOQUES.find((x) => x[0] === id);
    const J = ctx().clave;
    const nota = (junta(J).notas || {})[id] || "";
    return `<section class="bloque" id="b-${id}"><header><span class="bloque-num">${b[1]}</span><h2>${b[2]}</h2><span class="pregunta">${b[3]}</span><div class="acciones-h">${acciones}</div></header>
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
          <label class="campo-label" for="diag-txt">Diagnóstico en una frase (lo que dirá Iván)</label>
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
    if (pasa("tend-series", "venta")) ds.push({ type: "bar", label: `Venta ${a}`, data: venta, backgroundColor: meses.map((m) => (enPer.has(m) ? C.s1 : alfa(C.s1, 0.45))), order: 2 });
    if (pasa("tend-series", "meta")) ds.push({ type: "line", label: `Meta ${a}`, data: meta, borderColor: C.meta, backgroundColor: C.meta, borderDash: [5, 4], pointRadius: 0, order: 1 });
    if (pasa("tend-series", "prev")) ds.push({ type: "line", label: `Venta ${a - 1}`, data: prev, borderColor: C.s2, backgroundColor: C.s2, pointRadius: 3, order: 0 });
    chart("g-tend", { data: { labels: MC, datasets: ds }, options: { scales: { y: ejeM({ beginAtZero: true }), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: tipM, afterBody: (it) => { const m = it[0].dataIndex; const r = div(venta[m], meta[m]); return fin(r) ? `Cumplimiento: ${fmtP(r)}` : ""; } } } } } });

    // Déficit acumulado por año
    const aniosMeta = IDX.anios.filter((y) => metaAnual(y) > 0);
    const opA = aniosMeta.map((y) => ({ v: String(y), t: String(y) }));
    registrarMs("tend-anios", opA);
    const paleta = [C.s1, C.s2, C.s3, C.s4];
    const dsD = aniosMeta.filter((y) => (UI.filtros["tend-anios"] ? pasa("tend-anios", String(y)) : y >= a - 1 && y <= a)).map((y, i) => {
      let acM = 0, acL = 0;
      const lim = Math.max(cerrado(y), y === a ? c.Jm : 0);
      return { label: `Déficit ${y}`, data: meses.map((m) => { const t = tot(y, m); if (!t || m > lim) return null; acM += t.meta; acL += t.log; return acL - acM; }), borderColor: y === a ? C.s1 : paleta[(i + 1) % 4], backgroundColor: y === a ? alfa(C.s1, 0.12) : "transparent", fill: y === a ? "origin" : false };
    });
    chart("g-def", { type: "line", data: { labels: MC, datasets: dsD }, options: { scales: { y: ejeM(), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: tipM } } } } });
    // Brecha de cada mes
    const brecha = meses.map((m) => (venta[m - 1] !== null && meta[m - 1] !== null ? venta[m - 1] - meta[m - 1] : null));
    chart("g-brecha", { type: "bar", data: { labels: MC, datasets: [{ label: "Brecha del mes", data: brecha, backgroundColor: brecha.map((v) => (v >= 0 ? C.ok : C.bad)) }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${x.parsed.y >= 0 ? "Recupera" : "Amplía"} ${fmt$(Math.abs(x.parsed.y))}` } } }, scales: { y: ejeM(), x: { grid: { display: false } } } } });

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
      chart("g-vel", { type: "bar", data: { labels: deltas.map((x) => "S" + x.s), datasets: [{ label: "Cambio del déficit", data: deltas.map((x) => x.d), backgroundColor: deltas.map((x) => alfa(x.d >= 0 ? C.ok : C.bad, enRango(x) ? 1 : 0.4)) }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => `Semana ${deltas[it[0].dataIndex].s} · ${deltas[it[0].dataIndex].f}`, label: (x) => `${x.parsed.y >= 0 ? "Recupera" : "Amplía"} ${fmt$(Math.abs(x.parsed.y))}`, afterLabel: (x) => `Déficit acumulado ${fmt$(deltas[x.dataIndex].def)}` } } }, scales: { y: ejeM(), x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } } } } });
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
      chart(id, { type: "line", data: { labels: W.map((w) => "S" + w.s), datasets: [{ label: o.t, data: W.map((w) => w[o.v]), borderColor: [C.s1, C.s2, C.s3][i % 3], backgroundColor: [C.s1, C.s2, C.s3][i % 3], pointRadius: 2 }, ...(fin(meta) ? [{ label: "Meta", data: W.map(() => meta), borderColor: C.meta, borderDash: [5, 4], pointRadius: 0 }] : [])] },
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
    chart("g-mezcla", { type: "bar", data: { labels: men.map((x) => MC[x.m - 1]), datasets: [{ label: "Venta de clientes retenidos", data: men.map((x) => x.ir_monto), backgroundColor: C.s1 }, { label: "Venta de clientes ganados", data: men.map((x) => x.ig_monto), backgroundColor: C.s3 }] }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: ejeP({ stacked: true, max: 1 }) }, plugins: { tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmtP(x.parsed.y)}`, footer: (it) => `Clientes activos: ${men[it[0].dataIndex].clientes}` } } } } });
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
    chart("g-proy", { type: "line", data: { labels: MC, datasets: [{ label: "Venta acumulada real", data: real, borderColor: C.s1, backgroundColor: C.s1 }, { label: "Proyección", data: proy, borderColor: C.s1, borderDash: [6, 4], backgroundColor: C.s1, pointStyle: "rectRot" }, { label: "Meta acumulada", data: metaA, borderColor: C.meta, backgroundColor: C.meta, pointRadius: 0, borderDash: [2, 3] }] }, options: { scales: { y: ejeM(), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: tipM } } } } });
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
  function bOtros() {
    const c = ctx(), J = junta(c.clave);
    const L = J.canceladas || (J.canceladas = []);
    const total = L.reduce((s, x) => s + (+x.monto || 0), 0);
    const cuerpo = `<div class="sub" style="margin:0">Facturas canceladas en ${MESES[c.Jm - 1]} ${c.Ja} <span class="der"><button class="btn chico" data-canc-nueva type="button">+ Agregar factura</button></span></div>
      ${L.length ? `<div class="tabla-wrap" style="max-height:none"><table class="t compromisos"><thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Cartera / vendedor</th><th class="n">Monto</th><th>Motivo</th><th></th></tr></thead><tbody>
        ${L.map((x, i) => `<tr><td><input data-canc="${i}" data-campo="folio" value="${esc(x.folio)}" aria-label="Folio"></td><td><input type="date" data-canc="${i}" data-campo="fecha" value="${esc(x.fecha)}" aria-label="Fecha"></td><td><input data-canc="${i}" data-campo="cliente" value="${esc(x.cliente)}" aria-label="Cliente"></td><td><input data-canc="${i}" data-campo="cartera" value="${esc(x.cartera)}" aria-label="Cartera"></td><td class="n"><input data-canc="${i}" data-campo="monto" value="${esc(x.monto)}" inputmode="decimal" style="text-align:right" aria-label="Monto"></td><td><textarea rows="1" data-canc="${i}" data-campo="motivo" aria-label="Motivo">${esc(x.motivo)}</textarea></td><td><button class="restaurar" data-canc-borrar="${i}" type="button" title="Eliminar">✕</button></td></tr>`).join("")}
        </tbody><tfoot><tr><td colspan="4">${L.length} facturas</td><td class="n">${fmt$(total)}</td><td colspan="2">${fmtP(div(total, c.per.log), 2)} de la venta del periodo</td></tr></tfoot></table></div>` : `<div class="vacio">Sin facturas canceladas registradas. Usa <b>+ Agregar factura</b> para capturarlas antes de la junta.</div>`}`;
    return bloque("otros", cuerpo);
  }

  /* ===================================================================== */
  /*                       PARTE 2 · ANÁLISIS ADICIONAL                     */
  /* ===================================================================== */
  const SECC2 = [
    ["historico", "Histórico y estacionalidad"], ["anual", "Año contra año"], ["calor", "Mapa de cumplimiento"],
    ["mezcla", "Línea × cartera"], ["concentracion", "Concentración"], ["clientes", "Movimiento de clientes"],
    ["tipo", "Tipo de cliente"], ["simulador", "Simulador de cierre"],
  ];
  function seccion(id, titulo, pregunta, cuerpo) {
    const i = SECC2.findIndex((x) => x[0] === id);
    return `<section class="bloque" id="b-${id}"><header><span class="bloque-num">${String.fromCharCode(65 + i)}</span><h2>${titulo}</h2><span class="pregunta">${pregunta}</span></header><div class="bloque-cuerpo">${cuerpo}</div></section>`;
  }

  function sHistorico() {
    const C = colores(), c = ctx();
    const anios = [...new Set((BASE.historico || []).map((x) => x.a))].sort();
    const op = anios.map((a) => ({ v: String(a), t: String(a) }));
    registrarMs("hist-anios", op);
    const sel = anios.filter((a) => pasa("hist-anios", String(a)));
    const pal = [C.meta, C.s4, C.s2, C.s1, C.s3, C.s5];
    const val = (a, m) => { const t = tot(a, m); const lim = cerrado(a); if (t && m <= lim) return t.log; if (t) return null; return IDX.hist.get(`${a}-${m}`) ?? null; };
    chart("g-hist", { type: "line", data: { labels: MC, datasets: sel.map((a) => ({ label: String(a), data: MC.map((_, i) => val(a, i + 1)), borderColor: pal[(anios.indexOf(a) + (6 - anios.length)) % 6] || C.s1, backgroundColor: pal[(anios.indexOf(a) + (6 - anios.length)) % 6] || C.s1, borderWidth: a === c.Ja ? 3 : 2 })) }, options: { scales: { y: ejeM(), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: tipM } } } } });
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

  function sClientes() {
    const c = ctx();
    const cl = clientesDe(c.Ja, c.Jm);
    if (!cl) return seccion("clientes", "Movimiento de clientes", "", `<div class="aviso info">Sin datos de clientes.</div>`);
    const d = cl.datos, li = d.listas || {};
    const lista = (t, L, cls) => `<div><div class="sub">${t}</div><div class="tabla-wrap" style="max-height:none"><table class="t"><tbody>${(L || []).map((x, i) => `<tr><td class="mono" style="width:28px">${i + 1}</td><td>${esc(x.cliente)}</td><td class="n ${cls}">${fmt$(x.monto)}</td></tr>`).join("") || '<tr><td>Sin datos</td></tr>'}</tbody></table></div></div>`;
    // Comparativo trimestre a trimestre
    const ant = new Map((d.top_ant || []).map((x) => [x.cliente, x.monto]));
    const q = (UI.busq["cli-q"] || "").toLowerCase();
    const comp = (d.top_ult || []).map((x) => ({ cliente: x.cliente, ult: x.monto, ant: ant.get(x.cliente) ?? 0 }));
    for (const [k, v] of ant) if (!comp.find((x) => x.cliente === k)) comp.push({ cliente: k, ult: 0, ant: v });
    comp.forEach((x) => (x.dif = x.ult - x.ant));
    ordenar("cli-comp", comp, "ult:d");
    const vis = comp.filter((x) => !q || x.cliente.toLowerCase().includes(q)).slice(0, +vista("cli-n", "25"));
    return seccion("clientes", "Movimiento de clientes", "¿Quiénes explican la pérdida y la ganancia de venta?",
      `<div class="grid2">${lista(`Venta perdida · ${fmt$(d.venta_perdida)}`, li.perdida, "neg")}${lista(`Venta disminuida · ${fmt$(d.venta_disminuida)}`, li.disminuida, "neg")}${lista(`Venta aumentada · ${fmt$(d.venta_aumentada)}`, li.aumentada, "pos")}${lista(`Venta nueva · ${fmt$(d.venta_nueva)}`, li.nueva, "pos")}</div>
      <div><div class="sub">Comparativo por cliente · trimestre anterior vs último <span class="der" style="display:flex;gap:8px;flex-wrap:wrap"><input type="search" class="campo" style="width:200px;padding:4px 8px" placeholder="Buscar cliente" data-busq="cli-q" id="busq-cli" value="${esc(UI.busq["cli-q"] || "")}">${seg("cli-n", [["25", "25"], ["100", "100"], ["2000", "Todos"]], vista("cli-n", "25"))}</span></div>
      <div class="tabla-wrap"><table class="t"><thead><tr>${th("cli-comp", "cliente", "Cliente", false)}${th("cli-comp", "ant", "Trim. anterior")}${th("cli-comp", "ult", "Último trim.")}${th("cli-comp", "dif", "Diferencia")}</tr></thead><tbody>
      ${vis.map((x) => `<tr><td>${esc(x.cliente)}</td><td class="n">${fmt$(x.ant)}</td><td class="n">${fmt$(x.ult)}</td><td class="n ${x.dif < 0 ? "neg" : "pos"}">${fmt$(x.dif)}</td></tr>`).join("")}</tbody></table></div>
      <p class="nota-pie">${comp.length} clientes con venta en alguno de los dos trimestres. Fuente: listados SAE pegados en el Tablero ISEL.</p></div>`);
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

  function sSimulador() {
    const c = ctx(), C = colores();
    const a = c.Ja, cm = c.Jm;
    const pct = +(UI.vistas["sim-pct"] || 85) / 100;
    const real = c.acum.log;
    let restoMeta = 0; for (let m = cm + 1; m <= 12; m++) restoMeta += tot(a, m)?.meta || 0;
    const cierre = real + restoMeta * pct;
    const necesario = c.mAnual - real;
    const pctNec = div(necesario, restoMeta);
    const esc_ = [0.7, 0.8, 0.9, 1, 1.1].map((p) => ({ p, cierre: real + restoMeta * p }));
    chart("g-sim", { type: "bar", data: { labels: esc_.map((x) => fmtP(x.p)), datasets: [{ label: "Cierre anual", data: esc_.map((x) => x.cierre), backgroundColor: esc_.map((x) => (x.cierre >= c.mAnual ? C.ok : x.cierre >= c.mAnual * 0.9 ? C.warn : C.bad)) }, { type: "line", label: "Meta anual", data: esc_.map(() => c.mAnual), borderColor: C.ink2, borderDash: [5, 4], pointRadius: 0 }] }, options: { scales: { y: ejeM({ beginAtZero: true }), x: { grid: { display: false }, title: { display: true, text: "Cumplimiento promedio de los meses restantes" } } }, plugins: { tooltip: { callbacks: { label: tipM } } } } });
    return seccion("simulador", "Simulador de cierre", `¿Cómo cerraría ${a} según el cumplimiento de los meses que faltan?`,
      `<div class="grid2"><div style="display:flex;flex-direction:column;gap:12px">
        <label class="campo-label" for="sim-pct">Cumplimiento esperado de ${MC[Math.min(11, cm)]} a Dic: <b class="mono" style="font-size:14px">${fmtP(pct)}</b></label>
        <input type="range" id="sim-pct" min="50" max="130" step="1" value="${Math.round(pct * 100)}" data-sim>
        <div class="tira" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <div class="celda"><label>Venta real a ${MC[cm - 1]}</label><div class="valor">${fmtM(real)}</div></div>
          <div class="celda"><label>Meta de meses restantes</label><div class="valor">${fmtM(restoMeta)}</div></div>
          <div class="celda"><label>Cierre proyectado</label><div class="valor ${cierre >= c.mAnual ? "pos" : "neg"}">${fmtM(cierre)}</div><small>${fmtP(div(cierre, c.mAnual))} de la meta anual</small></div>
          <div class="celda"><label>Para llegar a la meta</label><div class="valor">${fmtP(pctNec)}</div><small>de cumplimiento en cada mes restante (${fmtM(12 - cm > 0 ? necesario / (12 - cm) : null)}/mes)</small></div>
        </div></div>
        <div class="graf"><canvas id="g-sim" role="img" aria-label="Escenarios de cierre anual"></canvas></div></div>`);
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
    return `<section class="bloque"><header><h2>Datos de la página</h2><span class="pregunta">Fuentes, actualización mensual y respaldo</span></header><div class="bloque-cuerpo">
      <div class="grid2"><div><div class="sub">Cargar reportes de Excel</div>
        <p style="margin:0 0 10px">Cada mes selecciona el <b>Resultado de ventas</b> del año y el <b>Tablero ISEL</b> actualizados (.xlsm o .xlsx). La página reconoce cada archivo por sus hojas y reemplaza solo lo que trae ese archivo; lo demás se conserva.</p>
        <label class="btn prim" for="archivos-excel" style="width:max-content">Elegir archivos de Excel</label>
        <input type="file" id="archivos-excel" accept=".xlsx,.xlsm,.xls" multiple hidden>
        <p class="nota-pie" id="estado-carga">Las cifras se leen tal como quedaron calculadas la última vez que se guardó el Excel.</p>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:6px"><input type="checkbox" id="limpiar-ed" checked> Al cargar, descartar las cifras modificadas a mano de los años que traiga el archivo</label>
      </div><div><div class="sub">Fuentes en uso</div>
        <div class="tabla-wrap" style="max-height:none"><table class="t"><tbody>${(BASE.fuentes || []).map((f) => `<tr><td>${esc(f.tipo)}</td><td class="mono">${esc(f.archivo)}</td></tr>`).join("")}</tbody></table></div>
        <p class="nota-pie">Actualizado: ${BASE.generado ? new Date(BASE.generado).toLocaleString("es-MX") : "—"}${G_BASE_LOCAL ? " · con archivos cargados en este navegador" : ""}.</p>
        ${G_BASE_LOCAL ? `<button class="btn chico peligro" data-base-reset type="button">${UI.confirmar === "base" ? "Confirmar: volver a los datos originales" : "Volver a los datos originales de la página"}</button>` : ""}</div></div>
      <div class="grid2"><div><div class="sub">Respaldo de compromisos, notas y cambios</div>
        <p style="margin:0 0 10px">Todo lo que escribes se guarda en este navegador. Para usarlo en otra computadora, o para no perderlo, descarga un respaldo y cárgalo allá.</p>
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
      <nav class="tabs" role="tablist">${[["junta", "Junta mensual"], ["analisis", "Análisis adicional"], ["datos", "Datos"]].map(([v, t]) => `<button class="tab" role="tab" data-tab="${v}" aria-selected="${UI.tab === v}">${t}</button>`).join("")}</nav>
      <button class="chip-btn" data-modo-ed aria-pressed="${UI.modoEdicion}" type="button">${UI.modoEdicion ? "✎ Modificando cifras" : "✎ Modificar cifras"}</button>
      <button class="chip-btn" data-tema type="button" title="Cambiar tema claro / oscuro">◐</button></div>
      <div class="periodo"><div class="periodo-in"><label>Periodo</label>
        <div class="seg" role="group">${[["mes", "Mes"], ["trim", "Trimestre"], ["sem", "Semestre"], ["anio", "Año"], ["rango", "Personalizado"]].map(([v, t]) => `<button type="button" data-ptipo="${v}" aria-pressed="${P.tipo === v}">${t}</button>`).join("")}</div>
        ${P.tipo !== "rango" ? `<select id="p-anio" aria-label="Año">${anios.map((a) => `<option ${P.anio === a ? "selected" : ""}>${a}</option>`).join("")}</select>` : ""}${ctrl[P.tipo]}
        <span class="periodo-resumen">${esc(etiquetaPeriodo(L))} · ${L.length} ${L.length === 1 ? "mes" : "meses"} · vs ${esc(etiquetaPeriodo(anteriorDe(L)).replace(/^(T\d|S\d|Año) · /, ""))}</span></div></div></header>`;
  }
  function indice(lista, pref) {
    return `<nav class="indice" aria-label="Bloques">${lista.map(([id, n, t, q]) => `<a href="#b-${id}" data-ir="${id}"><b>${n}</b><span>${t}</span>${q ? `<small>${q}</small>` : ""}</a>`).join("")}</nav>`;
  }
  function render() {
    CTX = null; PEND = [];
    const scroll = window.scrollY;
    const focoId = document.activeElement && document.activeElement.id;
    let cuerpo;
    try {
      if (UI.tab === "junta") cuerpo = `<div class="wrap">${indice(BLOQUES)}<main class="lienzo">${[bSeguimiento, bMarcador, bTendencia, bContribucion, bDiagnostico, bSalud, bPortafolio, bPronostico, bAccion, bOtros].map((f) => f()).join("")}</main></div>`;
      else if (UI.tab === "analisis") cuerpo = `<div class="wrap">${indice(SECC2.map(([id, t], i) => [id, String.fromCharCode(65 + i), t, ""]))}<main class="lienzo"><div class="aviso info">Información de apoyo que no forma parte del orden de la junta. Usa el mismo periodo de la barra superior.</div>${[sHistorico, sAnual, sCalor, sMezcla, sConcentracion, sClientes, sTipo, sSimulador].map((f) => f()).join("")}</main></div>`;
      else cuerpo = `<div class="wrap sin-indice"><main class="lienzo">${vistaDatos()}</main></div>`;
    } catch (e) {
      console.error(e);
      cuerpo = `<div class="wrap sin-indice"><div class="aviso">No se pudo armar esta vista: ${esc(e.message)}. Revisa la pestaña Datos.</div></div>`;
    }
    document.getElementById("app").innerHTML = cabecera() + cuerpo;
    document.body.classList.toggle("editando", UI.modoEdicion);
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

  /* ------------------------------------------------------------ eventos */
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, a, label") || ev.target;
    const d = t.dataset || {};
    // Cerrar selector abierto al hacer clic fuera
    if (UI.abierto && !ev.target.closest(".ms")) { UI.abierto = null; render(); return; }
    if (d.tab) { UI.tab = d.tab; window.scrollTo(0, 0); render(); return; }
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
    if (d.cf === "estado") { const x = G.compromisos.find((z) => z.id === t.closest("tr").dataset.comp); if (x) { x.estado = t.value; if (t.value === "cumplido") x.avance = 100; guardar(); render(); } return; }
    if (d.cf === "avance") { render(); return; }
    if (t.id === "archivos-excel") { cargarExcel([...t.files]); return; }
    if (t.id === "archivo-resp") { const f = t.files[0]; if (!f) return; f.text().then((s) => importar(JSON.parse(s))).catch(() => toast("El archivo no es un respaldo válido.")); return; }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.nota) { junta(ctx().clave).notas[d.nota] = t.value; guardar(); return; }
    if (d.juntaCampo) { junta(ctx().clave)[d.juntaCampo] = t.value; guardar(); return; }
    if (d.cf) { const x = G.compromisos.find((z) => z.id === t.closest("tr").dataset.comp); if (x) { x[d.cf] = d.cf === "avance" ? +t.value : t.value; if (d.cf === "avance") t.nextElementSibling.textContent = t.value + "%"; guardar(); } return; }
    if (d.canc !== undefined) { const J = junta(ctx().clave); J.canceladas[+d.canc][d.campo] = t.value; guardar(); return; }
    if (d.msQ) { UI.busq[d.msQ] = t.value; render(); return; }
    if (d.busq) { UI.busq[d.busq] = t.value; render(); return; }
    if ("sim" in d) { UI.vistas["sim-pct"] = t.value; render(); return; }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && UI.abierto) { UI.abierto = null; render(); }
    if (ev.key === "Enter" && ev.target.matches("input.ed")) ev.target.blur();
  });

  function copiar(txt) {
    const ok = () => toast("Copiado al portapapeles");
    try { navigator.clipboard.writeText(txt).then(ok, () => respaldoManual(txt)); } catch (e) { respaldoManual(txt); }
  }
  function respaldoManual(txt) { const el = $("#resp-texto"); if (el) { el.value = txt; el.select(); toast("Selecciona y copia el texto del cuadro."); } else toast("No se pudo copiar."); }

  /* ----------------------------------------------------- respaldo */
  const respaldo = () => ({ app: "isel-junta-mensual", version: 1, fecha: new Date().toISOString(), ed: G.ed, juntas: G.juntas, compromisos: G.compromisos });
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
        const L = ISELParser.leer(ISELParser.libroDeSheetJS(wb));
        ISELParser.combinar(nueva, L, f.name);
        hechos.push(`${f.name}: ${L.tipo === "resultados" ? "Resultado de ventas " + L.anio + " (corte " + MESES[L.corte - 1] + ")" : "Tablero " + MESES[L.mes - 1] + " " + L.anio}`);
        if ($("#limpiar-ed") && $("#limpiar-ed").checked) {
          const pref = L.anio + "-";
          if (L.tipo === "resultados") for (const k of Object.keys(G.ed.h)) if (k.startsWith(pref)) delete G.ed.h[k];
          if (L.tipo === "tablero") { for (const k of Object.keys(G.ed.s)) if (k.startsWith(pref)) delete G.ed.s[k]; delete G.ed.c[L.clave]; }
        }
      }
      BASE = nueva;
      try { localStorage.setItem(LS_BASE, JSON.stringify(BASE)); G_BASE_LOCAL = true; } catch (e) { toast("Los datos se cargaron, pero el navegador no permitió guardarlos: se perderán al cerrar."); }
      guardar(); indexar(); ajustarPeriodo(); render();
      toast("Datos actualizados");
      const e2 = $("#estado-carga"); if (e2) e2.textContent = "Cargado: " + hechos.join(" · ");
    } catch (e) { console.error(e); msg("No se pudo leer: " + e.message); toast(e.message); }
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
    try { const b = localStorage.getItem(LS_BASE); if (b) { const x = JSON.parse(b); if (x && x.hechos) { BASE = x; G_BASE_LOCAL = true; } } } catch (e) {}
    if (G.prefs.tema) document.documentElement.dataset.theme = G.prefs.tema;
    indexar(); ajustarPeriodo(); render();
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render());
  }
  async function iniciar() {
    if (window.DATOS_BASE) { BASE = window.DATOS_BASE; arrancar(); return; }
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
