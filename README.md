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
| 09 | Otros | Facturas canceladas |

La pestaña **Análisis adicional** reúne lo que no está en la estructura de la junta: histórico
2023–2026 y estacionalidad, año contra año, mapa de cumplimiento mensual, línea × cartera,
concentración de carteras y clientes, movimiento de clientes, tipo de cliente y simulador de cierre.

## Cómo se usa

- **Periodo**: mes, trimestre, semestre, año o rango personalizado. Todo se compara contra el
  mismo periodo del año anterior. Los periodos largos se cortan en el último mes cerrado.
- **Filtros**: cada tabla y gráfica tiene su selector para ver uno, varios o todos los elementos.
- **Modificar cifras**: activa el botón de la barra superior para cambiar metas, ventas e
  indicadores. Cada valor modificado se marca con un punto y se puede restaurar.
- **Compromisos y notas** se guardan al escribir.

## Dónde viven los datos

- `datos.enc.json`: cifras extraídas de los reportes de Excel, **cifradas** (AES-GCM). El
  repositorio es público, así que sin la clave nadie puede leer montos, vendedores ni clientes.
  La clave se escribe una vez por equipo (opción *Recordar en este equipo*).
- Compromisos, notas y cifras modificadas se guardan **en el navegador** de quien las captura.
  Para pasarlas a otra computadora: pestaña **Datos → Descargar respaldo** y en la otra
  **Cargar respaldo**. Conviene descargar un respaldo al terminar cada junta.

## Actualizar cada mes

**Opción rápida (desde la página):** pestaña **Datos → Elegir archivos de Excel** y selecciona
el *Resultado de ventas* del año y el *Tablero ISEL* actualizados. La página los lee en el
navegador; los archivos no se suben a ningún lado. Lo cargado queda en ese navegador.

**Opción para todos (actualizar el sitio):** después de cargarlos, el sitio publicado sigue
con los datos anteriores para los demás. Para publicarlos, pide a Claude que regenere
`datos.enc.json` con los Excel nuevos, o usa `herramientas/cifrar.mjs` con un `datos.json`.

```
node herramientas/cifrar.mjs datos.json datos.enc.json "clave"
```

## Publicar en GitHub Pages

Settings → Pages → Branch `main`, carpeta `/ (root)`. Queda en
`https://inavae.github.io/ISEL-Junta-Mensual/`.

## Archivos

```
index.html            Página
styles.css            Estilos
js/parser.js          Lectura de los reportes de Excel
js/app.js             Vistas, filtros, edición, compromisos y respaldo
datos.enc.json        Datos cifrados
herramientas/         Cifrado de datos
```

## Notas sobre los datos

- "Pendientes x surtir" de las hojas mensuales trae la misma serie en 2025 y 2026, así que no se
  usa; los pendientes vienen del Tablero ISEL.
- La hoja *Gráfica* del reporte 2026 tiene el año en curso rotulado como 2025; la página lo
  detecta y toma 2025 del reporte 2025.
- Automatización y Marcas clave son agrupaciones de otras divisiones; no se suman al total.
