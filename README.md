# ISEL · Junta mensual de resultados de ventas

Página para presentar los resultados de ventas en la junta mensual, en el orden acordado:

| # | Bloque | Pregunta |
|---|---|---|
| 00 | Seguimiento | ¿Cumplimos lo acordado en la junta anterior? |
| 01 | Marcador | ¿Dónde estamos? |
| 02 | Tendencia | ¿Mejoramos o empeoramos? (déficit acumulado y velocidad de recuperación) |
| 03 | Contribución | ¿Quién explica el resultado? (cartera, equipo/sucursal, división) |
| 04 | Diagnóstico | ¿Por qué ocurrió? (KPIs y árbol de diagnóstico) |
| 05 | Salud | ¿Estamos fortaleciendo el negocio? (retención, pérdida, ganancia, usuario/reventa) |
| 06 | Portafolio | ¿Dónde crecemos o perdemos? (líneas) |
| 07 | Pronóstico | ¿Qué viene? (meta, forecast, gap, pipeline, cierre del año) |
| 08 | Acción | ¿Qué vamos a hacer? (compromisos con responsable, fecha e indicador) |
| 09 | Otros | Facturas que afectaron el cierre (re-fechadas, canceladas, notas de crédito) |

Cada módulo tiene el botón **⤢ Ampliar**: lo muestra a pantalla completa con tipografía y gráficas
escaladas al tamaño de la pantalla; con ← y → se pasa al módulo anterior o siguiente y Esc cierra.
También se puede abrir en otra pestaña (por ejemplo `.../#ver-marcador`).

La pestaña **Análisis adicional** abre con el **Análisis general de ISEL** (situación, hallazgos por
severidad, sugerencias de enfoque y plan de acción; todo editable) y reúne lo que no está en la
estructura de la junta: histórico
2023–2026 y estacionalidad, año contra año, mapa de cumplimiento mensual, línea × cartera,
concentración de carteras y clientes, movimiento de clientes, tipo de cliente y simulador de cierre.

## Cómo se usa

- **Periodo**: mes, trimestre, semestre, año o rango personalizado. Todo se compara contra el
  mismo periodo del año anterior. Los periodos largos se cortan en el último mes cerrado.
- **Filtros**: cada tabla y gráfica tiene su selector para ver uno, varios o todos los elementos.
- **Modificar cifras**: activa el botón de la barra superior para cambiar metas, ventas e
  indicadores. Cada valor modificado se marca con un punto y se puede restaurar.
- **Compromisos y notas** se guardan al escribir.

## Acceso y roles

La página se conecta a Supabase (proyecto **ISEL - PDI**, tablas `jm_*`). Cada persona entra con
su correo y contraseña.

| | Administrador | Solo ver |
|---|---|---|
| Ver todo, filtros, periodos, Ampliar, simulador | Sí | Sí |
| Modificar cifras, notas, compromisos, análisis | Sí | No |
| Cargar reportes de Excel | Sí | No |
| Crear y editar campañas y oportunidades | Sí | No |
| Pestaña Usuarios | Sí | No |

Las reglas viven en la base de datos (RLS): aunque alguien manipule la página, el servidor rechaza
cualquier cambio de un usuario de solo vista.

- **Usuarios:** el administrador agrega personas con su correo, rol y una contraseña temporal. Al
  entrar por primera vez se les pide definir su contraseña (se puede desactivar para una cuenta de
  solo vista compartida). Si el correo ya existe por el PDI, solo se le da acceso.
- **Inactividad:** a los 9 minutos sin actividad aparece un aviso y a los 10 se cierra la sesión.
- **Cambios en vivo:** cada 30 segundos la página trae lo que otros capturaron (compromisos, notas,
  campañas). Si el administrador carga reportes nuevos, aparece el aviso *Actualizar*.

## Campañas

Pestaña **Campañas**, capturada a mano:

- **Campaña:** nombre, tipo (Outbound / Inbound), estado, fechas, marca, modelos, carteras que
  participan, objetivo y metas (monto ganado, facturado, cotizado, oportunidades, clientes). Una
  meta se marca como principal.
- **Oportunidades:** cartera, cliente, oportunidad, modelo, monto, estado (abierta, ganada, perdida),
  motivo de pérdida, competidor, fechas y monto facturado. Se pueden pegar varias desde Excel.
- **Tablero:** avance contra tiempo transcurrido, proyección por tendencia, resultado por cartera,
  modelos, tasa de cierre, ciclo de venta y análisis de pérdidas por motivo, cartera y competidor.
  El catálogo de motivos es editable.

## Líneas de tendencia

Las gráficas en el tiempo muestran una línea punteada de tendencia (regresión lineal) con su
pendiente en la leyenda. El botón **↗ Tendencias** de la barra superior las muestra u oculta.

## Instalación en Supabase (una sola vez)

1. Ejecutar `schema.sql` en **SQL Editor**.
2. Publicar la función `supabase/functions/jm-usuarios` (Edge Functions, con verificación de JWT).
3. Entrar con el administrador; si la base está vacía, la página ofrece importar los datos
   anteriores (con la clave previa) o cargar los Excel.

## Actualizar cada mes

Pestaña **Datos → Elegir archivos de Excel** (administrador): *Resultado de ventas* del año,
*Tablero ISEL* del mes y *Estadísticas de facturas* de Odoo. La página los lee en el navegador y
guarda las cifras en Supabase; todos los usuarios ven los datos nuevos.

**Facturas de Odoo:** cada mes carga también *Estadísticas de facturas* (Odoo → Contabilidad →
Reportes, exportado a Excel con todas las columnas). Con él:

- El bloque 09 detecta las facturas emitidas con folio del mes que se cancelaron y se volvieron a
  emitir con fecha de otro mes (re-fechadas), los folios faltantes (canceladas), las notas de crédito
  posteriores que no son de anticipo y las diferencias por cartera entre el Resultado de ventas y Odoo.
- La primera vez que se ve un mes ya cerrado se guarda una **foto** de sus facturas; en cada carga
  siguiente se comparan y aparecen las canceladas o modificadas con su monto.
- Las re-fechadas afectan el cierre del mes, no el acumulado anual, salvo las que cambian de año.
- El análisis de clientes usa este reporte para la cartera de cada cliente y cualquier periodo.

**Ventas por cliente (otra fuente):** para ver la cartera de cada cliente, desglosar clientes atendidos por
varias carteras y filtrar el movimiento de clientes por cualquier periodo, carga también un reporte
de ventas por cliente de SAE u Odoo (Excel o CSV) con fecha, cliente, cartera o vendedor e importe.
Sin ese archivo se usan los listados del Tablero (un trimestre fijo) y la cartera se asigna a mano.

## Publicar en GitHub Pages

Settings → Pages → Branch `main`, carpeta `/ (root)`. Queda en
`https://inavae.github.io/ISEL-Junta-Mensual/`.

## Archivos

```
index.html            Página
styles.css            Estilos
js/config.js          Conexión con Supabase
js/nube.js            Cliente de Supabase (acceso, datos, función de usuarios)
js/parser.js          Lectura de los reportes de Excel
js/app.js             Vistas, filtros, edición, compromisos, campañas, usuarios y sesión
schema.sql            Tablas y reglas de acceso
supabase/functions/   Función jm-usuarios (alta y administración de usuarios)
datos.enc.json        Datos anteriores cifrados (solo para la importación inicial)
herramientas/         Cifrado de datos
```

## Notas sobre los datos

- "Pendientes x surtir" de las hojas mensuales trae la misma serie en 2025 y 2026, así que no se
  usa; los pendientes vienen del Tablero ISEL.
- La hoja *Gráfica* del reporte 2026 tiene el año en curso rotulado como 2025; la página lo
  detecta y toma 2025 del reporte 2025.
- Automatización y Marcas clave son agrupaciones de otras divisiones; no se suman al total.
