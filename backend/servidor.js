/* Servidor del Sistema Mesa de Partes: sirve las páginas (css, js, pages, img) y la API conectada a MySQL.
   Uso:  npm start   →   http://localhost:3001 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { consultar, configuracion } = require('./conexion');
const { verificarClave, crearSesion, usuarioDeToken, cerrarSesion, fechaSQL } = require('./seguridad');
const { aplicar, leerEstado, leerColeccion } = require('./colecciones');

const RAIZ = path.join(__dirname, '..');
const CARPETA_ARCHIVOS = path.join(__dirname, 'uploads');
const PUERTO = Number(process.env.PORT || 3001);
const MAX_ARCHIVO = 50 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
const PUBLICO = new Set(['css', 'img', 'js', 'pages']);
fs.mkdirSync(CARPETA_ARCHIVOS, { recursive: true });

let version = Date.now(); // cambia cada vez que algún usuario guarda algo; los navegadores lo consultan para refrescarse
const subio = () => { version = Math.max(version + 1, Date.now()); };

/* ---------- utilidades HTTP ---------- */
function responder(res, estado, cuerpo, cabeceras = {}) {
  const esTexto = typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo);
  res.writeHead(estado, {
    'Content-Type': esTexto ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...cabeceras
  });
  res.end(esTexto ? cuerpo : JSON.stringify(cuerpo));
}
const fallo = (res, estado, mensaje) => responder(res, estado, { error: mensaje });
function leerJSON(req, limite = 10 * 1024 * 1024) {
  return new Promise((resolver, rechazar) => {
    const partes = []; let total = 0;
    req.on('data', (p) => { total += p.length; if (total > limite) { rechazar(Object.assign(new Error('Contenido demasiado grande'), { estado: 413 })); req.destroy(); } else partes.push(p); });
    req.on('end', () => { try { resolver(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch { rechazar(Object.assign(new Error('JSON no válido'), { estado: 400 })); } });
    req.on('error', rechazar);
  });
}
function guardarFlujo(req, destino, limite) {
  return new Promise((resolver, rechazar) => {
    const salida = fs.createWriteStream(destino); let total = 0; let roto = false;
    req.on('data', (p) => { total += p.length; if (total > limite && !roto) { roto = true; salida.destroy(); fs.unlink(destino, () => {}); rechazar(Object.assign(new Error('El archivo supera el tamaño permitido.'), { estado: 413 })); req.destroy(); } });
    req.pipe(salida);
    salida.on('finish', () => { if (!roto) resolver(total); });
    salida.on('error', (e) => { if (!roto) rechazar(e); });
  });
}
const tokenDe = (req, url) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('t') || '';
const ipDe = (req) => req.socket.remoteAddress || 'x';
const golpes = new Map();
function limitado(req, max = 30) {
  const ip = ipDe(req); const ahora = Date.now(); const l = (golpes.get(ip) || []).filter((t) => ahora - t < 60000);
  l.push(ahora); golpes.set(ip, l); return l.length > max;
}

/* ---------- API ---------- */
async function login(req, res) {
  if (limitado(req, 20)) return fallo(res, 429, 'Demasiados intentos. Espere un minuto.');
  const { usuario = '', clave = '' } = await leerJSON(req, 10000);
  const u = String(usuario).trim().toLowerCase();
  const [fila] = await consultar('SELECT * FROM usuarios WHERE usuario = ?', [u]);
  if (!fila || !fila.activo || !verificarClave(clave, fila.clave_hash)) return fallo(res, 401, 'Usuario o contraseña incorrectos.');
  const token = await crearSesion(fila.usuario);
  const ahora = fechaSQL();
  await consultar('UPDATE usuarios SET ultimo_acceso = ? WHERE usuario = ?', [ahora, fila.usuario]);
  if (fila.rol !== 'Externo') {
    const id = crypto.createHash('sha1').update(`${ahora}${fila.usuario}login${token}`).digest('hex').slice(0, 20);
    await consultar('INSERT IGNORE INTO bitacora (id, fecha, tipo, usuario, accion, detalle) VALUES (?,?,?,?,?,?)', [id, ahora, 'Accesos', fila.usuario, 'Inicio de sesión', `${fila.rol} · ${fila.pagina}`]);
    subio();
  }
  responder(res, 200, { token, cuenta: { usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol, dependencia: fila.dependencia, pagina: fila.pagina } });
}

async function consulta(res, codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  let [e] = await consultar('SELECT codigo, remitente, tipo, asunto, area, estado, fecha, canal FROM expedientes WHERE codigo = ?', [c]);
  if (!e) [e] = await consultar('SELECT codigo, remitente, tipo, asunto, area, estado, fecha FROM solicitudes_portal WHERE UPPER(codigo) = ?', [c]);
  if (!e) return fallo(res, 404, 'No se encontró un expediente con ese número.');
  const movs = e.codigo.startsWith('EXP-') ? await consultar('SELECT fecha, accion, detalle FROM movimientos WHERE expediente = ? ORDER BY fecha DESC, id DESC LIMIT 12', [e.codigo]) : [];
  responder(res, 200, { ...e, fecha: `${String(e.fecha).replace(' ', 'T')}Z`, movimientos: movs.map((m) => ({ ...m, fecha: `${String(m.fecha).replace(' ', 'T')}Z` })) });
}

async function subirArchivo(req, res, origen, usuario) {
  const nombre = decodeURIComponent(String(req.headers['x-nombre'] || 'archivo')).slice(0, 200).replace(/[\\/\0]/g, '_');
  const tipo = String(req.headers['x-tipo'] || 'application/octet-stream').slice(0, 100);
  if (origen === 'portal' && !/\.(pdf|doc|docx|jpg|jpeg)$/i.test(nombre)) return fallo(res, 400, 'Formato de archivo no permitido.');
  const id = crypto.randomUUID(); const ruta = path.join(CARPETA_ARCHIVOS, id);
  const tam = await guardarFlujo(req, ruta, origen === 'portal' ? MAX_ARCHIVO : MAX_ARCHIVO);
  if (!tam) { fs.unlink(ruta, () => {}); return fallo(res, 400, 'El archivo está vacío.'); }
  await consultar('INSERT INTO archivos (id, nombre, tipo, tam, ruta, origen, creado) VALUES (?,?,?,?,?,?,?)', [id, nombre, tipo, tam, id, origen, fechaSQL()]);
  responder(res, 201, { id, nombre, tipo, tam });
}
async function bajarArchivo(res, id) {
  const [a] = await consultar('SELECT * FROM archivos WHERE id = ?', [id]);
  const ruta = a && path.join(CARPETA_ARCHIVOS, path.basename(a.ruta));
  if (!a || !fs.existsSync(ruta)) return fallo(res, 404, 'Archivo no encontrado.');
  res.writeHead(200, { 'Content-Type': a.tipo, 'Content-Length': a.tam, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600', 'X-Nombre': encodeURIComponent(a.nombre) });
  fs.createReadStream(ruta).pipe(res);
}

const metaArchivo = (a) => (a ? { id: a.id, name: a.nombre, nombre: a.nombre, type: a.tipo, size: Number(a.tam), tam: Number(a.tam) } : null);
async function listarPortal() {
  const filas = await consultar('SELECT * FROM solicitudes_portal ORDER BY fecha DESC');
  const [archivos] = [await consultar('SELECT id, nombre, tipo, tam FROM archivos WHERE origen = ?', ['portal'])];
  const mapa = new Map(archivos.map((a) => [a.id, a]));
  return filas.map((f) => {
    let datos = {}; try { datos = JSON.parse(f.datos || '{}'); } catch { /* sin datos */ }
    let anexos = []; try { anexos = JSON.parse(f.anexos || '[]'); } catch { /* sin anexos */ }
    return { ...datos, codigo: f.codigo, remitente: f.remitente, dni: f.dni, correo: f.correo, asunto: f.asunto, tipo: f.tipo, estado: f.estado, area: f.area, expediente: f.expediente, fecha: `${String(f.fecha).replace(' ', 'T')}Z`, archivo: metaArchivo(mapa.get(f.archivo_id)), anexos: anexos.map((i) => metaArchivo(mapa.get(i))).filter(Boolean) };
  });
}
async function crearSolicitud(req, res) {
  if (limitado(req, 15)) return fallo(res, 429, 'Demasiadas solicitudes. Intente en un minuto.');
  const b = await leerJSON(req, 200000); const d = b.datos || {};
  const remitente = [d.nombres, d['apellido-paterno'], d['apellido-materno']].map((x) => String(x || '').trim()).join(' ').trim();
  if (remitente.length < 3) return fallo(res, 400, 'Ingrese al menos 3 caracteres en el nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.correo || ''))) return fallo(res, 400, 'Ingrese un correo electrónico válido.');
  const ids = [b.archivo, ...(Array.isArray(b.anexos) ? b.anexos : [])].filter(Boolean).map(String);
  const validos = ids.length ? await consultar('SELECT id FROM archivos WHERE origen = ? AND id IN (?)', ['portal', ids]) : [];
  if (!b.archivo || validos.length !== ids.length) return fallo(res, 400, 'Los archivos adjuntos no son válidos. Vuelva a cargarlos.');
  const codigo = `LOCAL-${new Date().getFullYear()}-${crypto.randomUUID()}`;
  const limpio = Object.fromEntries(Object.entries(d).slice(0, 40).map(([k, v]) => [String(k).slice(0, 60), String(v ?? '').slice(0, 1000)]));
  await consultar('INSERT INTO solicitudes_portal (codigo, remitente, dni, correo, asunto, tipo, estado, area, fecha, archivo_id, anexos, datos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [codigo, remitente.slice(0, 200), String(limpio.dni || '').slice(0, 20), limpio.correo.slice(0, 160), String(limpio.asunto || '').slice(0, 400), String(limpio.tipo || '').slice(0, 40), 'Pendiente de envío', '', fechaSQL(), String(b.archivo), JSON.stringify(ids.slice(1)), JSON.stringify(limpio)]);
  subio();
  responder(res, 201, { codigo });
}
async function actualizarSolicitud(req, res, codigo) {
  const c = await leerJSON(req, 20000); const campos = []; const valores = [];
  [['estado', 120], ['area', 80], ['expediente', 30]].forEach(([k, n]) => { if (c[k] !== undefined) { campos.push(`${k} = ?`); valores.push(String(c[k]).slice(0, n)); } });
  if (c.observacion !== undefined) {
    const [f] = await consultar('SELECT datos FROM solicitudes_portal WHERE codigo = ?', [codigo]); let datos = {};
    try { datos = JSON.parse((f && f.datos) || '{}'); } catch { /* vacío */ }
    datos.observacion = String(c.observacion).slice(0, 1000); campos.push('datos = ?'); valores.push(JSON.stringify(datos));
  }
  if (campos.length) { await consultar(`UPDATE solicitudes_portal SET ${campos.join(', ')} WHERE codigo = ?`, [...valores, codigo]); subio(); }
  responder(res, 200, { ok: true });
}

async function api(req, res, url) {
  const ruta = url.pathname; const m = req.method;
  if (m === 'GET' && ruta === '/api/salud') { await consultar('SELECT 1'); return responder(res, 200, { ok: true, baseDatos: configuracion.baseDatos }); }
  if (m === 'POST' && ruta === '/api/login') return login(req, res);
  if (m === 'GET' && ruta.startsWith('/api/consulta/')) { if (limitado(req, 60)) return fallo(res, 429, 'Demasiadas consultas.'); return consulta(res, decodeURIComponent(ruta.slice(14))); }
  if (m === 'POST' && ruta === '/api/portal/archivo') { if (limitado(req, 40)) return fallo(res, 429, 'Demasiadas solicitudes.'); return subirArchivo(req, res, 'portal'); }
  if (m === 'POST' && ruta === '/api/portal') return crearSolicitud(req, res);

  const token = tokenDe(req, url); const yo = await usuarioDeToken(token);
  if (!yo) return fallo(res, 401, 'Sesión no válida o vencida. Vuelva a iniciar sesión.');
  if (m === 'POST' && ruta === '/api/logout') { await cerrarSesion(token); return responder(res, 200, { ok: true }); }
  if (m === 'GET' && ruta === '/api/yo') return responder(res, 200, yo);
  if (yo.rol === 'Externo') return fallo(res, 403, 'Esta cuenta no tiene acceso al panel.');

  if (m === 'GET' && ruta === '/api/version') return responder(res, 200, { version });
  if (m === 'GET' && ruta === '/api/estado') return responder(res, 200, { version, datos: await leerEstado() });
  if (m === 'POST' && ruta === '/api/sync') {
    const b = await leerJSON(req); await aplicar(String(b.clave), b.cambios || {}, yo.rol); subio();
    return responder(res, 200, { ok: true, version });
  }
  if (m === 'POST' && ruta === '/api/archivos') return subirArchivo(req, res, 'panel', yo.usuario);
  if (m === 'GET' && ruta.startsWith('/api/archivos/')) return bajarArchivo(res, path.basename(ruta));
  if (m === 'GET' && ruta === '/api/portal') return responder(res, 200, await listarPortal());
  if (m === 'POST' && /^\/api\/portal\/[^/]+\/actualizar$/.test(ruta)) return actualizarSolicitud(req, res, decodeURIComponent(ruta.split('/')[3]));
  // Rutas de consulta directa (compatibles con la primera versión del backend)
  if (m === 'GET' && ruta === '/api/documentos') return responder(res, 200, await leerColeccion('expedientes'));
  if (m === 'GET' && ruta === '/api/usuarios') { if (yo.rol !== 'Administración') return fallo(res, 403, 'Solo el administrador.'); return responder(res, 200, await leerColeccion('usuarios')); }
  fallo(res, 404, 'Ruta no encontrada.');
}

/* ---------- archivos estáticos ---------- */
function estatico(req, res, url) {
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const partes = p.split('/').filter(Boolean);
  if (!(partes.length === 1 && partes[0] === 'index.html') && !PUBLICO.has(partes[0])) return fallo(res, 404, 'No encontrado');
  const archivo = path.normalize(path.join(RAIZ, p));
  if (!archivo.startsWith(RAIZ + path.sep) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) return fallo(res, 404, 'No encontrado');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
  fs.createReadStream(archivo).pipe(res);
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') estatico(req, res, url);
    else fallo(res, 405, 'Método no permitido');
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    if (!e.estado) console.error(e);
    fallo(res, e.estado || 500, e.estado ? e.message : 'Error interno del servidor.');
  }
});

if (require.main === module) {
  consultar('SELECT 1').then(() => {
    servidor.listen(PUERTO, () => console.log(`Mesa de Partes en http://localhost:${PUERTO}  ·  MySQL ${configuracion.servidor}:${configuracion.puerto}/${configuracion.baseDatos}`));
  }).catch((e) => { console.error(`No se pudo conectar a MySQL (${e.code || e.message}).\nEjecuta primero:  npm run db:init   y revisa el archivo .env`); process.exit(1); });
}
module.exports = { servidor };
