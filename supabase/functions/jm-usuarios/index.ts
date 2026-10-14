// =========================================================================
//  jm-usuarios · Alta y administración de usuarios de la Junta Mensual ISEL
//  Solo la puede usar un administrador activo (jm_acceso.rol = 'admin').
//  Acciones: listar | crear | rol | activo | password | quitar
// =========================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const falla = (message: string, status = 400) => json({ message }, status);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// deno-lint-ignore no-explicit-any
export async function manejar(req: Request, adm: any, verificarToken: (t: string) => Promise<{ id: string; email: string } | null>) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return falla("Método no permitido", 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const yo = token ? await verificarToken(token) : null;
  if (!yo) return falla("Tu sesión expiró. Vuelve a entrar.", 401);

  const { data: mio } = await adm.from("jm_acceso").select("rol, activo").eq("user_id", yo.id).maybeSingle();
  if (!mio || !mio.activo || mio.rol !== "admin") return falla("Solo un administrador puede gestionar usuarios.", 403);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return falla("Solicitud inválida."); }
  const accion = String(b.accion || "");

  const contarAdmins = async () => {
    const { count } = await adm.from("jm_acceso").select("user_id", { count: "exact", head: true }).eq("rol", "admin").eq("activo", true);
    return count || 0;
  };
  const protegerUltimoAdmin = async (uid: string) => {
    const { data: x } = await adm.from("jm_acceso").select("rol, activo").eq("user_id", uid).maybeSingle();
    if (x && x.rol === "admin" && x.activo && (await contarAdmins()) <= 1) return falla("Debe quedar al menos un administrador activo.");
    return null;
  };

  if (accion === "listar") {
    const { data: filas, error } = await adm.from("jm_acceso").select("*").order("creado_en");
    if (error) return falla(error.message, 500);
    const usuarios = [];
    for (const f of filas || []) {
      const { data: u } = await adm.auth.admin.getUserById(f.user_id);
      usuarios.push({ ...f, ultimo_acceso: u?.user?.last_sign_in_at || null });
    }
    return json({ usuarios });
  }

  if (accion === "crear") {
    const email = String(b.email || "").trim().toLowerCase();
    const nombre = String(b.nombre || "").trim();
    const rol = b.rol === "admin" ? "admin" : "lector";
    const password = String(b.password || "");
    const pedirCambio = b.pedir_cambio !== false;
    if (!EMAIL.test(email)) return falla("Escribe un correo válido.");
    // ¿Ya existe en Authentication (por ejemplo, usuario del PDI)?
    let existente: { id: string } | null = null;
    for (let pagina = 1; pagina < 50 && !existente; pagina++) {
      const { data, error } = await adm.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) return falla(error.message, 500);
      existente = (data.users || []).find((u: { email?: string }) => (u.email || "").toLowerCase() === email) || null;
      if (!data.users || data.users.length < 200) break;
    }
    let uid: string, nuevo = false;
    if (existente) {
      uid = existente.id;
    } else {
      if (password.length < 8) return falla("La contraseña temporal debe tener al menos 8 caracteres.");
      const { data, error } = await adm.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } });
      if (error) return falla(error.message);
      uid = data.user.id; nuevo = true;
    }
    const { error } = await adm.from("jm_acceso").upsert({
      user_id: uid, email, nombre: nombre || null, rol, activo: true, debe_cambiar: nuevo ? pedirCambio : false, creado_por: yo.email,
    }, { onConflict: "user_id" });
    if (error) return falla(error.message, 500);
    return json({ ok: true, nuevo, mensaje: nuevo ? "Usuario creado con la contraseña temporal." : "El correo ya tenía cuenta (por ejemplo del PDI): se le dio acceso y conserva su contraseña actual." });
  }

  const uid = String(b.user_id || "");
  if (!uid) return falla("Falta el usuario.");

  if (accion === "rol") {
    const rol = b.rol === "admin" ? "admin" : "lector";
    if (rol !== "admin") { const p = await protegerUltimoAdmin(uid); if (p) return p; }
    const { error } = await adm.from("jm_acceso").update({ rol }).eq("user_id", uid);
    return error ? falla(error.message, 500) : json({ ok: true });
  }
  if (accion === "activo") {
    const activo = !!b.activo;
    if (!activo) { const p = await protegerUltimoAdmin(uid); if (p) return p; }
    const { error } = await adm.from("jm_acceso").update({ activo }).eq("user_id", uid);
    return error ? falla(error.message, 500) : json({ ok: true });
  }
  if (accion === "password") {
    const password = String(b.password || "");
    if (password.length < 8) return falla("La contraseña temporal debe tener al menos 8 caracteres.");
    const { error } = await adm.auth.admin.updateUserById(uid, { password });
    if (error) return falla(error.message);
    const { error: e2 } = await adm.from("jm_acceso").update({ debe_cambiar: b.pedir_cambio !== false }).eq("user_id", uid);
    return e2 ? falla(e2.message, 500) : json({ ok: true });
  }
  if (accion === "quitar") {
    if (uid === yo.id) return falla("No puedes quitarte el acceso a ti mismo.");
    const p = await protegerUltimoAdmin(uid); if (p) return p;
    // Solo se quita el acceso a esta herramienta; la cuenta sigue existiendo (la comparte el PDI)
    const { error } = await adm.from("jm_acceso").delete().eq("user_id", uid);
    return error ? falla(error.message, 500) : json({ ok: true });
  }
  return falla("Acción desconocida.");
}

if (typeof Deno !== "undefined" && Deno.serve) {
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const adm = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  Deno.serve((req) =>
    manejar(req, adm, async (t) => {
      const { data, error } = await adm.auth.getUser(t);
      return error || !data?.user ? null : { id: data.user.id, email: data.user.email || "" };
    }).catch((e) => falla(String(e?.message || e), 500))
  );
}
