/* ===========================================================================
   Lectura de los reportes de Excel de ISEL.
   Trabaja sobre un "libro" abstracto: { hojas: [nombres], celda(hoja, "B7") }.
   En el navegador el libro se arma con SheetJS; para pruebas, con cualquier
   otra fuente que entregue los valores ya calculados de cada celda.
   =========================================================================== */
(function (global) {
  "use strict";

  const MESES_HOJA = ["Ene", "Feb", "Mzo", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const AGREGADOS = new Set(["automatizacion", "marcas_clave"]);

  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  const r2 = (v) => Math.round((v || 0) * 100) / 100;
  const txt = (v) => (typeof v === "string" ? v.trim() : "");
  const slug = (s) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  function aFecha(v) {
    if (v instanceof Date) return v;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v.slice(0, 10) + "T12:00:00");
    if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5) + 12 * 36e5);
    return null;
  }
  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

  function colNum(letras) { let n = 0; for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64); return n; }
  function colLetra(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

  function tipoDeLibro(libro) {
    const h = new Set(libro.hojas);
    if (h.has("Tablero") && h.has("Velocidad Déficit")) return "tablero";
    if (h.has("Trend") && h.has("Ene") && h.has("Grafica")) return "resultados";
    return null;
  }

  /* --------------------------------------------- Resultado de ventas AAAA --- */
  function leerResultados(libro) {
    const c = libro.celda;
    // Año del reporte: encabezado "2026" del comparativo en la primera hoja con datos
    let anio = null;
    for (const h of MESES_HOJA) {
      const k = num(c(h, "K7")) || parseInt(txt(String(c(h, "K7") ?? "")), 10);
      if (k > 2000) { anio = k; break; }
    }
    if (!anio) throw new Error("No encontré el año del reporte (celda K7 de las hojas mensuales).");

    const hechos = [];
    const add = (mes, dim, clave, nombre, meta, log, orden) => {
      meta = num(meta); log = num(log);
      if (meta === null && log === null) return;
      hechos.push({ a: anio, m: mes, d: dim, k: clave, n: nombre, meta: r2(meta), log: r2(log), o: orden,
        ag: dim === "division" && AGREGADOS.has(clave) });
    };

    MESES_HOJA.forEach((hoja, i) => {
      const mes = i + 1;
      if (!libro.hojas.includes(hoja)) return;
      for (let f = 8; f <= 17; f++) {
        const a = txt(c(hoja, "A" + f));
        if (a === "Gran Total") add(mes, "total", "total", "ISEL", c(hoja, "F" + f), c(hoja, "G" + f), 0);
        else if (a) add(mes, "division", slug(a), a, c(hoja, "F" + f), c(hoja, "G" + f), f);
        const r = txt(c(hoja, "R" + f));
        if (r && r !== "Gran Total") add(mes, "equipo", slug(r), r, c(hoja, "W" + f), c(hoja, "X" + f), f);
      }
      for (let f = 20; f <= 46; f++) {
        const a = txt(c(hoja, "A" + f));
        const m = a.match(/^C(\d\d)\s*(.*)$/);
        if (m) add(mes, "cartera", "C" + m[1], m[2].trim() || "(sin asignar)", c(hoja, "F" + f), c(hoja, "G" + f), +m[1]);
      }
      let ini = null;
      for (let f = 44; f <= 56; f++) if (txt(c(hoja, "A" + f)) === "Linea") { ini = f; break; }
      if (ini) for (let f = ini + 2; f <= ini + 26; f++) {
        const a = txt(c(hoja, "A" + f));
        if (a) add(mes, "linea", slug(a), a, c(hoja, "F" + f), c(hoja, "G" + f), f);
      }
    });

    // Histórico mensual (hoja Grafica). En el reporte del año en curso las
    // últimas 12 filas traen el año actual con rótulo del anterior: se descartan
    // las filas cuyo monto coincide con la venta mensual del año del reporte.
    const totAnio = {};
    hechos.filter((h) => h.d === "total").forEach((h) => (totAnio[h.m] = h.log));
    const historico = [];
    for (let f = 2; f <= 60; f++) {
      const d = aFecha(c("Grafica", "A" + f)); const v = num(c("Grafica", "B" + f));
      if (!d || v === null) continue;
      const a = d.getFullYear(), m = d.getMonth() + 1;
      if (a >= anio) continue;
      if (a === anio - 1 && totAnio[m] !== undefined && Math.abs(totAnio[m] - v) < 1) continue;
      historico.push({ a, m, v: r2(v), prio: 1 });
    }
    hechos.filter((h) => h.d === "total").forEach((h) => historico.push({ a: anio, m: h.m, v: h.log, prio: 2 }));

    // Venta acumulada línea × cartera
    const lineaCartera = [];
    if (libro.hojas.includes("Vta x Linea $")) {
      const lineas = [];
      for (let col = 4; col <= 40; col++) {
        const n = txt(c("Vta x Linea $", colLetra(col) + "2"));
        if (n) lineas.push([col, n]);
      }
      for (let f = 3; f <= 40; f++) {
        const cart = num(c("Vta x Linea $", "A" + f)); const vend = txt(c("Vta x Linea $", "B" + f));
        if (cart === null || !vend) continue;
        for (const [col, n] of lineas) {
          const v = num(c("Vta x Linea $", colLetra(col) + f));
          if (v) lineaCartera.push({ cartera: "C" + String(cart).padStart(2, "0"), vendedor: vend, linea: n, monto: r2(v) });
        }
      }
    }
    // Mes de corte: último mes con venta
    let corte = 0;
    hechos.filter((h) => h.d === "total" && h.log > 0).forEach((h) => (corte = Math.max(corte, h.m)));
    return { tipo: "resultados", anio, corte, hechos, historico, lineaCartera };
  }

  /* -------------------------------------------------------- Tablero ISEL --- */
  function leerTablero(libro) {
    const c = libro.celda;
    const g = (ref) => c("Tablero", ref);
    const del = aFecha(g("B3"));
    if (!del) throw new Error("No encontré el periodo del tablero (celda B3).");
    const anio = del.getFullYear(), mes = num(g("D3")) || del.getMonth() + 1;
    const corte = aFecha(g("I5"));

    const tablero = {
      corte: corte ? iso(corte) : null, meta_mes: num(g("B7")), resultado_mes: num(g("D7")), venta_mes: num(g("E7")),
      pronostico_mes: num(g("H7")), pronostico_pct: num(g("I7")),
      margen_meta: num(g("C10")), margen: num(g("C11")), cotizaciones_meta: num(g("D10")), cotizaciones: num(g("D11")),
      efectividad_meta: num(g("H10")), efectividad: num(g("H11")), pedidos_meta: num(g("I10")), pedidos: num(g("I11")),
      pendientes_meta: num(g("C15")), pendientes: num(g("C16")), pendientes_monto_meta: num(g("D15")), pendientes_monto: num(g("D16")),
      meta_acum: num(g("I15")), venta_acum: num(g("I16")), deficit: num(g("I17")),
    };

    // Semanas: fechas de la hoja "Base de datos" (se corrige el año si viene mal capturado)
    const fechas = {};
    for (let f = 8; f <= 70; f++) {
      const s = num(c("Base de datos", "B" + f)); const d = aFecha(c("Base de datos", "C" + f));
      if (s && d) { d.setFullYear(anio); fechas[s] = d; }
    }
    const semanal = [];
    let ultimaVenta = null;
    for (let f = 41; f <= 92; f++) {
      const s = num(g("A" + f)); if (!s) continue;
      const d = fechas[s] || new Date(anio, 0, 2 + (s - 1) * 7, 12);
      let venta = num(g("D" + f));
      // Semanas sin captura repiten el acumulado anterior: se dejan vacías
      if (venta !== null && ultimaVenta !== null && Math.abs(venta - ultimaVenta) < 0.01 && num(g("O" + f)) === null) venta = null;
      if (venta !== null) ultimaVenta = venta;
      semanal.push({ a: anio, s, fecha: iso(d), meta_acum: r2(num(g("B" + f))), venta_acum: venta === null ? null : r2(venta),
        meta_sem: num(g("M" + f)), margen: num(g("O" + f)), efectividad: num(g("P" + f)), pendientes: num(g("Q" + f)) });
    }

    // Indicadores por mes: última semana capturada de cada mes; el mes del tablero usa sus cifras oficiales
    const kpis = [];
    const porMes = {};
    semanal.forEach((w) => { if (w.margen !== null) porMes[+w.fecha.slice(5, 7)] = w; });
    Object.entries(porMes).forEach(([m, w]) => {
      kpis.push({ a: anio, m: +m, k: "margen", v: w.margen }, { a: anio, m: +m, k: "efectividad", v: w.efectividad }, { a: anio, m: +m, k: "pendientes", v: w.pendientes });
    });
    const fija = (k, v) => { if (v === null) return; const x = kpis.find((z) => z.a === anio && z.m === mes && z.k === k); if (x) x.v = v; else kpis.push({ a: anio, m: mes, k, v }); };
    fija("margen", tablero.margen); fija("efectividad", tablero.efectividad); fija("pendientes", tablero.pendientes);
    fija("pendientes_monto", tablero.pendientes_monto); fija("cotizaciones", tablero.cotizaciones); fija("pedidos", tablero.pedidos);
    fija("pronostico", tablero.pronostico_mes);
    const metasKpi = { margen: tablero.margen_meta, efectividad: tablero.efectividad_meta, pendientes: tablero.pendientes_meta };

    // Clientes: retención, pérdida, ganancia
    const I = (ref) => c("Indic. de Crecimiento", ref);
    const clientes = { periodo: { ant: [aFecha(I("I2")), aFecha(I("J2"))].map((d) => d && iso(d)), ult: [aFecha(I("I3")), aFecha(I("J3"))].map((d) => d && iso(d)) } };
    if (libro.hojas.includes("Indic. de Crecimiento")) {
      Object.assign(clientes, {
        trim_ant: { clientes: num(I("C5")), monto: num(I("D5")) }, trim_ult: { clientes: num(I("C6")), monto: num(I("D6")) },
        perdida: { clientes: num(I("C7")), monto: num(I("D7")), pct_cli: num(I("C8")), pct_monto: num(I("D8")) },
        retencion: { clientes: num(I("C9")), monto: num(I("D9")), pct_cli: num(I("C10")), pct_monto: num(I("D10")) },
        ganancia: { clientes: num(I("C11")), monto: num(I("D11")), pct_cli: num(I("C12")), pct_monto: num(I("D12")) },
        venta_perdida: num(I("C18")), venta_disminuida: num(I("G18")), venta_aumentada: num(I("K18")), venta_nueva: num(I("O18")),
        indice: num(I("S22")),
      });
      clientes.mensual = [];
      for (let f = 5; f <= 16; f++) {
        const n = num(I("G" + f));
        if (n !== null) clientes.mensual.push({ m: num(I("F" + f)), clientes: n, monto: num(I("H" + f)), ir_cli: num(I("I" + f)), ig_cli: num(I("J" + f)), ir_monto: num(I("K" + f)), ig_monto: num(I("L" + f)) });
      }
      const lista = (cn, cv) => { const L = []; for (let f = 20; f <= 29; f++) { const n = txt(I(cn + f)), v = num(I(cv + f)); if (n && v !== null) L.push({ cliente: n, monto: v }); } return L; };
      clientes.listas = { perdida: lista("B", "C"), disminuida: lista("F", "G"), aumentada: lista("J", "K"), nueva: lista("N", "O") };
      const ant = [], ult = [];
      for (let f = 34; f <= 1504; f++) {
        let n = txt(I("B" + f)), v = num(I("E" + f)); if (n && v) ant.push({ cliente: n, monto: r2(v) });
        n = txt(I("J" + f)); v = num(I("M" + f)); if (n && v) ult.push({ cliente: n, monto: r2(v) });
      }
      clientes.top_ant = ant; clientes.top_ult = ult;
    }

    // Venta por tipo de cliente y canal
    const V = (ref) => c("Vta x tipo cte", ref);
    const tipoCliente = [];
    for (let f = 5; f <= 30; f++) {
      const v = num(V("D" + f)); const k = txt(V("A" + f));
      if (v === null) continue;
      if (!k && !num(V("B" + f))) break;
      tipoCliente.push({ clave: k || "(sin clasificar)", monto: r2(v) });
    }
    const canal = { usuario: num(V("F6")), usuario_meta: num(V("G5")), reventa: num(V("F8")), reventa_meta: num(V("G7")) };

    // Metas anuales por línea
    const lineasAnual = [];
    for (let f = 6; f <= 30; f++) {
      const n = txt(c("Vtas x Linea", "B" + f)); if (!n || n === "Total") continue;
      lineasAnual.push({ linea: n, venta_ant: num(c("Vtas x Linea", "C" + f)), meta: num(c("Vtas x Linea", "E" + f)) });
    }
    const clave = anio + "-" + String(mes).padStart(2, "0");
    return { tipo: "tablero", anio, mes, clave, tablero, semanal, kpis, metasKpi, clientes, tipoCliente, canal, lineasAnual };
  }

  function leer(libro) {
    const t = tipoDeLibro(libro);
    if (t === "resultados") return leerResultados(libro);
    if (t === "tablero") return leerTablero(libro);
    throw new Error("El archivo no parece ser un reporte de Resultado de ventas ni el Tablero ISEL.");
  }

  /* Combina lo leído en la base de datos de la página. Lo más reciente gana. */
  function combinar(base, lectura, archivo) {
    const D = base;
    D.fuentes = (D.fuentes || []).filter((f) => f.archivo !== archivo);
    if (lectura.tipo === "resultados") {
      const a = lectura.anio;
      D.hechos = (D.hechos || []).filter((h) => h.a !== a).concat(lectura.hechos);
      const H = new Map((D.historico || []).map((h) => [h.a + "-" + h.m, h]));
      lectura.historico.forEach((h) => { const k = h.a + "-" + h.m, p = H.get(k); if (!p || (h.prio || 0) >= (p.prio || 0)) H.set(k, h); });
      D.historico = [...H.values()].sort((x, y) => x.a - y.a || x.m - y.m);
      if (lectura.lineaCartera.length) { D.lineaCartera = D.lineaCartera || {}; D.lineaCartera[a + "-" + String(lectura.corte).padStart(2, "0")] = lectura.lineaCartera; }
      D.fuentes.push({ archivo, tipo: "Resultado de ventas " + a, corte: lectura.corte });
    } else {
      const a = lectura.anio;
      D.semanal = (D.semanal || []).filter((w) => w.a !== a).concat(lectura.semanal);
      const K = new Map((D.kpis || []).map((k) => [k.a + "-" + k.m + "-" + k.k, k]));
      lectura.kpis.forEach((k) => K.set(k.a + "-" + k.m + "-" + k.k, k));
      D.kpis = [...K.values()];
      D.metasKpi = Object.assign(D.metasKpi || {}, lectura.metasKpi);
      for (const campo of ["tablero", "clientes", "tipoCliente", "canal"]) { D[campo] = D[campo] || {}; D[campo][lectura.clave] = lectura[campo]; }
      D.lineasAnual = D.lineasAnual || {}; D.lineasAnual[a] = lectura.lineasAnual;
      D.fuentes.push({ archivo, tipo: "Tablero ISEL " + lectura.clave, corte: lectura.mes });
    }
    D.generado = new Date().toISOString();
    return D;
  }

  /* Libro desde SheetJS */
  function libroDeSheetJS(wb) {
    return {
      hojas: wb.SheetNames,
      celda(hoja, ref) { const ws = wb.Sheets[hoja]; if (!ws) return null; const c = ws[ref]; return c ? (c.t === "e" ? null : c.v) : null; },
    };
  }

  const API = { leer, combinar, libroDeSheetJS, tipoDeLibro, colNum, colLetra };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else global.ISELParser = API;
})(typeof window !== "undefined" ? window : globalThis);
