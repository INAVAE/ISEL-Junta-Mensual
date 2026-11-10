/* ===========================================================================
   Cliente mínimo de Supabase (Auth + PostgREST + Edge Functions) sin
   dependencias. Expone window.Nube.
   =========================================================================== */
(function (global) {
  "use strict";
  const CLAVE_SESION = "isel-jm-sesion";

  function crear(url, llave) {
    url = url.replace(/\/+$/, "");
    let sesion = null;
    try { sesion = JSON.parse(localStorage.getItem(CLAVE_SESION) || "null"); } catch (e) { sesion = null; }
    const guardarSesion = (s) => { sesion = s; try { if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s)); else localStorage.removeItem(CLAVE_SESION); } catch (e) {} };

    async function leerRespuesta(r) {
      const t = await r.text();
      let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
      if (!r.ok) {
        const msg = (j && (j.msg || j.message || j.error_description || j.error)) || `Error ${r.status}`;
        const err = new Error(traducir(msg, r.status)); err.status = r.status; err.detalle = j; throw err;
      }
      return j;
    }
    function traducir(msg, status) {
      const m = String(msg);
      if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
      if (/Email not confirmed/i.test(m)) return "El correo no está confirmado. Pide al administrador que revise tu cuenta.";
      if (/row-level security|permission denied/i.test(m)) return "No tienes permiso para hacer este cambio.";
      const largo = m.match(/at least (\d+) characters?/i);
      if (largo) return `La contraseña debe tener al menos ${largo[1]} caracteres.`;
      if (/contain at least one character of each/i.test(m)) return /[!@#$%^&*]/.test(m.split(":").pop()) ? "La contraseña debe incluir mayúsculas, minúsculas, números y al menos un símbolo (por ejemplo ! # $ % & * - _)." : "La contraseña debe incluir mayúsculas, minúsculas y números.";
      if (/pwned|known to be weak|easy to guess/i.test(m)) return "Esa contraseña es muy común o apareció en filtraciones de datos; elige otra.";
      if (/same.*password|different from the old/i.test(m)) return "La nueva contraseña debe ser distinta de la actual.";
      if (/JWT expired|invalid JWT/i.test(m) || status === 401) return "Tu sesión expiró. Vuelve a entrar.";
      if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión con el servidor. Revisa tu internet.";
      return m;
    }
    async function pedir(ruta, op = {}) {
      let r;
      try { r = await fetch(url + ruta, op); }
      catch (e) { const err = new Error("Sin conexión con el servidor. Revisa tu internet."); err.red = true; throw err; }
      return r;
    }

    async function tokenVigente() {
      if (!sesion) throw Object.assign(new Error("Tu sesión expiró. Vuelve a entrar."), { status: 401 });
      if (sesion.expires_at && sesion.expires_at * 1000 - Date.now() < 90000) {
        const r = await pedir("/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: llave, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: sesion.refresh_token }) });
        if (!r.ok) { guardarSesion(null); throw Object.assign(new Error("Tu sesión expiró. Vuelve a entrar."), { status: 401 }); }
        guardarSesion(normalizar(await r.json()));
      }
      return sesion.access_token;
    }
    function normalizar(s) {
      if (!s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + s.expires_in;
      return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: s.user ? { id: s.user.id, email: s.user.email } : sesion && sesion.user };
    }
    async function cabeceras(extra = {}) {
      return Object.assign({ apikey: llave, Authorization: "Bearer " + (await tokenVigente()), "Content-Type": "application/json" }, extra);
    }

    const auth = {
      sesion: () => sesion,
      async entrar(email, password) {
        const r = await pedir("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: llave, "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
        guardarSesion(normalizar(await leerRespuesta(r)));
        return sesion;
      },
      async salir() {
        const s = sesion; guardarSesion(null);
        if (s) try { await fetch(url + "/auth/v1/logout", { method: "POST", headers: { apikey: llave, Authorization: "Bearer " + s.access_token } }); } catch (e) {}
      },
      async cambiarPassword(password) {
        const r = await pedir("/auth/v1/user", { method: "PUT", headers: await cabeceras(), body: JSON.stringify({ password }) });
        return leerRespuesta(r);
      },
      olvidar: () => guardarSesion(null),
    };

    // Filtros: { col: valor } → eq; { col: ["gt", v] } → operador
    function filtros(f = {}) {
      const p = [];
      for (const [k, v] of Object.entries(f)) {
        if (Array.isArray(v)) p.push(`${encodeURIComponent(k)}=${v[0]}.${encodeURIComponent(v[1])}`);
        else p.push(`${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`);
      }
      return p.join("&");
    }
    const db = {
      async leer(tabla, { filtro, orden, select = "*" } = {}) {
        const todo = []; const paso = 1000;
        for (let desde = 0; ; desde += paso) {
          const q = [`select=${encodeURIComponent(select)}`, filtros(filtro), orden ? `order=${encodeURIComponent(orden)}` : "", `limit=${paso}`, `offset=${desde}`].filter(Boolean).join("&");
          const r = await pedir(`/rest/v1/${tabla}?${q}`, { headers: await cabeceras() });
          const filas = await leerRespuesta(r);
          todo.push(...filas);
          if (filas.length < paso) break;
        }
        return todo;
      },
      async guardar(tabla, filas, conflicto) {
        if (!filas.length) return;
        const q = conflicto ? `?on_conflict=${encodeURIComponent(conflicto)}` : "";
        const r = await pedir(`/rest/v1/${tabla}${q}`, { method: "POST", headers: await cabeceras({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(filas) });
        return leerRespuesta(r);
      },
      async cambiar(tabla, filtro, valores) {
        const r = await pedir(`/rest/v1/${tabla}?${filtros(filtro)}`, { method: "PATCH", headers: await cabeceras({ Prefer: "return=minimal" }), body: JSON.stringify(valores) });
        return leerRespuesta(r);
      },
      async borrar(tabla, filtro) {
        const r = await pedir(`/rest/v1/${tabla}?${filtros(filtro)}`, { method: "DELETE", headers: await cabeceras({ Prefer: "return=minimal" }) });
        return leerRespuesta(r);
      },
      async rpc(fn, args = {}) {
        const r = await pedir(`/rest/v1/rpc/${fn}`, { method: "POST", headers: await cabeceras(), body: JSON.stringify(args) });
        return leerRespuesta(r);
      },
    };
    async function funcion(nombre, cuerpo) {
      const r = await pedir(`/functions/v1/${nombre}`, { method: "POST", headers: await cabeceras(), body: JSON.stringify(cuerpo || {}) });
      return leerRespuesta(r);
    }
    return { auth, db, funcion, url };
  }

  global.Nube = { crear };
})(typeof window !== "undefined" ? window : globalThis);
