# Base de datos MySQL · Sistema Mesa de Partes

Todo el sistema (Secretaría, Coordinación, Dirección, Administración, Biblioteca, portal externo y consulta pública)
guarda ahora sus datos en **MySQL** (base `mesa_partes`). Ya no depende del navegador.

## Puesta en marcha (3 pasos)

1. **Enciende MySQL** (XAMPP → Start en MySQL, o el servicio MySQL de tu PC).
2. En la carpeta del proyecto abre una terminal y ejecuta:
   ```
   npm install
   npm run db:init
   npm start
   ```
   - `npm install` instala el único paquete necesario (`mysql2`). Requiere Node.js 18 o superior.
   - `npm run db:init` crea la base `mesa_partes`, sus 14 tablas y las cuentas iniciales (puedes repetirlo sin perder datos).
   - `npm start` enciende el sistema.
3. Abre **http://localhost:3001** (las páginas ya las sirve el mismo servidor; no uses Live Server ni abras el HTML directo).

Si tu MySQL tiene otra clave o puerto, copia `.env.example` como `.env` y edita `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`.
(XAMPP por defecto: usuario `root`, sin clave: ya viene así en `.env`.)

Cuentas iniciales (usuario = clave): 00000001 Secretaría Académica · 00000002 Coordinación · 00240130 Dirección ·
00000004 Administrador · 00000005 Secretaría · 17528716 Bibliotecaria. Portal: `estudiante` / `externo` con clave `1234`.
**Cámbialas desde el panel del Administrador antes de usarlo en serio.**

## Qué se guarda y dónde

| Módulo | Tablas MySQL |
|---|---|
| Cuentas y sesiones | `usuarios` (claves cifradas con scrypt), `sesiones` |
| Mesa de Partes | `expedientes`, `movimientos` (historial), `archivos` (+ carpeta `backend/uploads/`) |
| Portal externo | `solicitudes_portal` (+ sus archivos en `archivos`) |
| Administrador | `bitacora`, `configuracion` |
| Biblioteca | `libros`, `lectores`, `prestamos`, `reservas`, `visitas`, `constancias` |

El esquema completo está en `database/schema.sql` (también puedes importarlo con phpMyAdmin).

## Cómo funciona

- `backend/servidor.js` sirve las páginas y la API (`/api/...`); `backend/conexion.js` abre el pool MySQL;
  `backend/colecciones.js` traduce los datos a tablas; `backend/seguridad.js` maneja claves y sesiones.
- `js/db-sync.js` está incluido en todas las páginas: carga los datos de MySQL al abrir cada panel, envía cada cambio a la
  base apenas se guarda y refresca la pantalla cuando otra persona cambia algo (cada ~3 s). Así dos personas
  (por ejemplo Secretaría y Dirección) ven lo mismo en tiempo casi real.
- El inicio de sesión se valida en MySQL y cada petición lleva un token. Los datos de la institución no se dejan
  en el navegador al cerrar sesión.
- Los archivos adjuntos se guardan en `backend/uploads/` y su registro en la tabla `archivos`.
- Si el servidor no está encendido, las páginas siguen funcionando en **modo local** (como antes), sin base de datos.
- La primera vez que alguien abre un panel, los datos de ejemplo se cargan en MySQL. Si ya tenías datos en el navegador
  de una versión anterior, se suben a la base automáticamente.

## Respaldo

`mysqldump -u root mesa_partes > respaldo.sql` (y copia la carpeta `backend/uploads/`). Para restaurar: `mysql -u root < respaldo.sql`.
Desde el panel del Administrador también puedes descargar el respaldo JSON.

## Seguridad (resumen)

Claves con scrypt + sal, sesiones de 12 h (`SESION_HORAS`), API protegida por token y por rol (solo el Administrador
modifica cuentas), límites de intentos en login y portal público, `.env`, `backend/` y `database/` no se sirven por HTTP.
Para publicarlo en internet usa HTTPS (por ejemplo detrás de Nginx) y cambia todas las claves iniciales.
