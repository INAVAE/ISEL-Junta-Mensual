-- =========================================================================
--  ISEL · Junta mensual de resultados de ventas
--  Proyecto Supabase "ISEL - PDI". Tablas con prefijo jm_; comparten los
--  usuarios de Authentication con la herramienta del PDI, pero el permiso
--  en esta herramienta es independiente (jm_acceso).
--
--  Roles:  admin  → acceso total
--          lector → solo ver y usar filtros
--  Las reglas viven en la base de datos (RLS): aunque alguien manipule la
--  página, el servidor rechaza cualquier cambio de un lector.
-- =========================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ------------------------------------------------------------ Accesos ---
create table if not exists public.jm_acceso (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  nombre        text,
  rol           text not null check (rol in ('admin', 'lector')),
  activo        boolean not null default true,
  debe_cambiar  boolean not null default false,   -- pedir nueva contraseña al entrar
  creado_por    text,
  creado_en     timestamptz not null default now()
);

-- Rol del usuario actual (null si no tiene acceso o está inactivo)
create or replace function private.jm_rol()
returns text language sql stable security definer set search_path = '' as $$
  select a.rol from public.jm_acceso a
  where a.user_id = (select auth.uid()) and a.activo
$$;
revoke all on function private.jm_rol() from public, anon;
grant execute on function private.jm_rol() to authenticated;

-- El usuario confirma que ya cambió su contraseña temporal
create or replace function public.jm_password_cambiada()
returns void language sql security definer set search_path = '' as $$
  update public.jm_acceso set debe_cambiar = false where user_id = (select auth.uid())
$$;
revoke all on function public.jm_password_cambiada() from public, anon;
grant execute on function public.jm_password_cambiada() to authenticated;

alter table public.jm_acceso enable row level security;
drop policy if exists jm_acceso_leer on public.jm_acceso;
create policy jm_acceso_leer on public.jm_acceso for select to authenticated
  using (user_id = (select auth.uid()) or (select private.jm_rol()) = 'admin');
-- Altas, bajas y cambios de rol solo por la función jm-usuarios (service role)
revoke all on public.jm_acceso from anon;
revoke insert, update, delete on public.jm_acceso from authenticated;

-- Marca de última modificación (hora del servidor y correo de quien guardó)
create or replace function private.jm_tocar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce((select auth.jwt()) ->> 'email', new.actualizado_por);
  return new;
end $$;

-- --------------------------------------------- Datos de los reportes ---
-- Claves: base | facturas:AAAA-MM | fotos:AAAA-MM
create table if not exists public.jm_base (
  clave            text primary key,
  datos            jsonb not null,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);

-- --------------------- Lo que se captura en la página (junta, análisis) ---
-- coleccion: junta | compromiso | edicion | analisis | cliente_cartera | config
create table if not exists public.jm_registros (
  coleccion        text not null,
  clave            text not null,
  datos            jsonb not null,
  borrado          boolean not null default false,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  primary key (coleccion, clave)
);
create index if not exists jm_registros_actualizado on public.jm_registros (actualizado_en);

-- ----------------------------------------------------------- Campañas ---
create table if not exists public.jm_campanas (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  tipo             text not null default 'outbound' check (tipo in ('outbound', 'inbound')),
  estado           text not null default 'activa' check (estado in ('planeada', 'activa', 'pausada', 'terminada')),
  inicio           date,
  fin              date,
  marca            text,
  modelos          text,
  carteras         text[] not null default '{}',
  objetivo         text,
  metas            jsonb not null default '{}'::jsonb,
  notas            text,
  borrado          boolean not null default false,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (fin is null or inicio is null or fin >= inicio)
);
create index if not exists jm_campanas_actualizado on public.jm_campanas (actualizado_en);

create table if not exists public.jm_campana_oport (
  id               uuid primary key default gen_random_uuid(),
  campana_id       uuid not null references public.jm_campanas (id) on delete cascade,
  cartera          text,
  cliente          text not null,
  oportunidad      text,
  marca            text,
  modelo           text,
  monto            numeric(16, 2) not null default 0,
  estado           text not null default 'abierta' check (estado in ('abierta', 'ganada', 'perdida')),
  motivo           text,
  detalle          text,
  competidor       text,
  fecha_alta       date,
  fecha_cierre     date,
  fecha_factura    date,
  monto_facturado  numeric(16, 2),
  notas            text,
  borrado          boolean not null default false,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
create index if not exists jm_campana_oport_campana on public.jm_campana_oport (campana_id);
create index if not exists jm_campana_oport_actualizado on public.jm_campana_oport (actualizado_en);

-- ------------------------------------------- Disparadores y permisos ---
do $$
declare t text;
begin
  foreach t in array array['jm_base', 'jm_registros', 'jm_campanas', 'jm_campana_oport'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_tocar', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function private.jm_tocar()', t || '_tocar', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('drop policy if exists %I on public.%I', t || '_alta', t);
    execute format('drop policy if exists %I on public.%I', t || '_cambio', t);
    execute format('drop policy if exists %I on public.%I', t || '_baja', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.jm_rol()) is not null)', t || '_leer', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.jm_rol()) = ''admin'')', t || '_alta', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.jm_rol()) = ''admin'') with check ((select private.jm_rol()) = ''admin'')', t || '_cambio', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.jm_rol()) = ''admin'')', t || '_baja', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ------------------------------------------------- Administrador inicial ---
insert into public.jm_acceso (user_id, email, nombre, rol, creado_por)
select id, email, 'Iván Nava', 'admin', 'instalación' from auth.users where email = 'ivan.n@isel.com.mx'
on conflict (user_id) do update set rol = 'admin', activo = true;

-- ------------------------------------- Campañas: productos y oportunidades ---
alter table public.jm_campanas
  add column if not exists productos jsonb not null default '[]'::jsonb;

alter table public.jm_campana_oport
  add column if not exists cantidad numeric(14, 2),
  add column if not exists partidas jsonb not null default '[]'::jsonb,
  add column if not exists contacto text,
  add column if not exists origen text,
  add column if not exists etapa text,
  add column if not exists probabilidad integer check (probabilidad between 0 and 100),
  add column if not exists fecha_estimada date,
  add column if not exists cotizacion text,
  add column if not exists factura text,
  add column if not exists linea text,
  add column if not exists numero_parte text;

-- Ajustes por campaña: moneda, paridad, metas por cartera, indicadores propios y datos del último reporte
alter table public.jm_campanas
  add column if not exists ajustes jsonb not null default '{}'::jsonb;

-- Partidas facturadas de una oportunidad ganada (piezas vendidas reales)
alter table public.jm_campana_oport
  add column if not exists venta jsonb not null default '[]'::jsonb;

-- ---------------------------------------------- Uso de la herramienta ---
-- Una fila por ingreso: inicio, última señal, tiempo activo y tiempo por sección.
-- Cada usuario solo escribe sus propias filas; el administrador ve todas.
create table if not exists public.jm_sesiones (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email        text,
  inicio       timestamptz not null default now(),
  ultimo       timestamptz not null default now(),
  fin          timestamptz,
  activo_seg   integer not null default 0 check (activo_seg >= 0),
  tiempo       jsonb not null default '{}'::jsonb,
  acciones     jsonb not null default '{}'::jsonb,
  cierre       text,
  dispositivo  text
);
create index if not exists jm_sesiones_inicio on public.jm_sesiones (inicio desc);
create index if not exists jm_sesiones_usuario on public.jm_sesiones (user_id, inicio desc);
alter table public.jm_sesiones enable row level security;
revoke all on public.jm_sesiones from anon;
drop policy if exists jm_sesiones_leer on public.jm_sesiones;
drop policy if exists jm_sesiones_alta on public.jm_sesiones;
drop policy if exists jm_sesiones_cambio on public.jm_sesiones;
drop policy if exists jm_sesiones_baja on public.jm_sesiones;
create policy jm_sesiones_leer on public.jm_sesiones for select to authenticated
  using (user_id = (select auth.uid()) or (select private.jm_rol()) = 'admin');
create policy jm_sesiones_alta on public.jm_sesiones for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.jm_rol()) is not null);
create policy jm_sesiones_cambio on public.jm_sesiones for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy jm_sesiones_baja on public.jm_sesiones for delete to authenticated
  using ((select private.jm_rol()) = 'admin');
