# Panel de Secretaría – Mesa de Partes

## Cómo probarlo
1. Abre la carpeta con un servidor local (recomendado): Live Server de VS Code, o en la terminal `python -m http.server 8000` y entra a `http://localhost:8000/`.
2. Inicia sesión desde Gestores pedagógicos con DNI `00000001` y clave `00000001` (Secretaría Académica) o `00000005` / `00000005`.
3. Para probar la recepción del portal: envía un documento desde `pages/registrar-documento.html` (usuario externo) **en el mismo navegador**; aparecerá en «Solicitudes del portal por recibir».

## Qué hace la secretaria (todo con botones funcionales)
- **Recibir** solicitudes del portal (revisar archivos, recibir y asignar, u observar con motivo).
- **Registrar** documentos de ventanilla/correo con adjuntos y número de expediente automático.
- **Derivar** (enviar) a Secretaría, Coordinación, Dirección o Administración con prioridad, plazo e indicaciones; también en lote.
- **Cambiar estado** (Pendiente, Asignado, En revisión, Observado, Atendido, Archivado).
- **Detalle** con datos, adjuntos (ver/descargar/agregar), historial de movimientos y notas.
- **Cargo de recepción** imprimible y **correo** al remitente.
- **Archivo** (archivar/restaurar), **Asignados a mí**, **Reportes** (gráficos, historial, CSV), **Configuración** (responsable, año, respaldo JSON, restablecer datos).
- Buscador, filtros avanzados, orden, paginación, columnas visibles, exportar CSV y notificaciones.

## Archivos nuevos / modificados
- `pages/secretaria.html` (reescrito)
- `js/secretaria-admin.js` (reescrito) y `js/mesa-datos.js` (nuevo: capa de datos)
- `css/secretaria-funciones.css` (nuevo)

Los datos se guardan en el navegador (localStorage + IndexedDB). Para conectarlo a MySQL, reemplaza las funciones de `js/mesa-datos.js` por llamadas a la API de `backend/`.

## Panel de Coordinación (pages/coordinadora.html)
Archivos: `pages/coordinadora.html`, `css/coordinacion.css`, `js/coordinadora.js` (usa `js/mesa-datos.js`).
Secciones: Tablero (Kanban con arrastrar y soltar), Enviar documentos, Seguimiento, Historial y Reportes.
Lo que Secretaría deriva a "Coordinación Académica" aparece en el tablero; lo que Coordinación envía queda registrado con su firma en el recorrido del expediente.
Para probar: abrir con un servidor local (`python3 -m http.server`) y entrar con la cuenta 00000002.

## Panel de Dirección (pages/direccion.html)
Archivos: `pages/direccion.html`, `css/direccion.css`, `js/direccion.js` (usa `js/mesa-datos.js`). Cuenta de prueba: 00240130.
Secciones: Despacho (lista + lectura: Aprobar, Rechazar/Observar, Derivar con providencia, Responder, Archivar, acciones en lote), Áreas (carga de cada área), Resoluciones (registro de decisiones) y Reportes.
El botón "Derivar documentos" permite enviar cualquier expediente a Secretaría, Coordinación o Administración.

## Panel de Biblioteca (pages/bibliotecaria.html)
Archivos: `pages/bibliotecaria.html`, `css/bibliotecaria.css`, `js/bibliotecaria.js` y la capa de datos `js/biblioteca-datos.js`. Cuenta de prueba: 17528716 / 17528716.
Funciones: préstamos (domicilio y sala), devoluciones con cálculo de multa, renovaciones, catálogo e inventario, lectores, reservas, multas, visitas a sala, reportes y configuración de reglas.
«Biblioteca» es ahora un área de Mesa de Partes: Secretaría, Coordinación, Dirección y Administración pueden derivarle expedientes, y ella puede emitir la constancia de no adeudo, atender o derivar el expediente a otra área.
