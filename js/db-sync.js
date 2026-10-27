/* Adaptador de base de datos (MySQL) para todo el frontend.
   Los paneles siguen trabajando con MesaDatos / BiblioDatos / usuarios / bitácora de forma instantánea; este archivo:
     1. Al abrir cada página descarga el estado desde MySQL (vía backend/servidor.js) y lo deja listo para los paneles.
     2. Cada vez que un panel guarda algo, envía SOLO lo que cambió a la base de datos (por fila, no todo el bloque).
     3. Consulta cada pocos segundos si otra persona cambió algo y refresca la pantalla (eventos mesa:cambio / biblio:cambio).
     4. Guarda los archivos adjuntos en el servidor y atiende login, portal externo y consulta pública.
   Si el servidor no está disponible (por ejemplo abres el HTML sin "npm start"), todo sigue funcionando en modo local como antes. */
(function (raiz) {
  'use strict';
  const API = raiz.MESA_API_URL || '';
  const KT = 'tokenMesaPartes';
  const SPEC = {
    'mesaPartes.expedientes.v2': { tipo: 'array', col: 'expedientes', id: (r) => r.codigo, ev: 'mesa:cambio' },
    'mesaPartes.usuarios.v1': { tipo: 'array', col: 'usuarios', id: (r) => r.usuario, ev: 'db:cambio' },
    'mesaPartes.bitacora.v1': { tipo: 'array', col: 'bitacora', id: (r) => r.id || hash(estable([r.fecha, r.tipo, r.usuario, r.accion, r.detalle])), ev: 'db:cambio' },
    'mesaPartes.config.v2': { tipo: 'escalar', ev: 'mesa:cambio' },
    'mesaPartes.admin.v1': { tipo: 'escalar', ev: 'db:cambio' },
    'mesaPartes.biblioteca.v1': {
      tipo: 'objeto', ev: 'biblio:cambio', escalares: ['config', 'contadores'],
      cols: { libros: (r) => r.id, lectores: (r) => r.id, prestamos: (r) => r.id, reservas: (r) => r.id, visitas: (r) => r.id, constancias: (r) => r.numero }
    }
  };
  const PAGINAS_PANEL = /\/(secretaria|coordinadora|direccion|administrador|bibliotecaria|documentos|historial)\.html$/i;

  const orig = { set: Storage.prototype.setItem, quitar: Storage.prototype.removeItem, limpiar: Storage.prototype.clear };
  const ls = raiz.localStorage;

  /* ---------- utilidades ---------- */
  function estable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${estable(v[k])}`).join(',')}}`;
  }
  function hash(s) {
    let a = 0x811c9dc5; let b = 0x1b873593;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519) ^ (b >>> 13); }
    return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${s.length.toString(36)}`;
  }
  const leerLocal = (clave) => { try { return JSON.parse(ls.getItem(clave)); } catch (_) { return null; } };
  const token = () => { try { return raiz.sessionStorage.getItem(KT) || ''; } catch (_) { return ''; } };

  function xhr(metodo, ruta, cuerpo, sincrono) {
    const h = new XMLHttpRequest();
    try {
      h.open(metodo, API + ruta, !sincrono);
      if (cuerpo !== undefined) h.setRequestHeader('Content-Type', 'application/json');
      if (token()) h.setRequestHeader('Authorization', `Bearer ${token()}`);
      h.send(cuerpo === undefined ? null : JSON.stringify(cuerpo));
    } catch (_) { return { estado: 0, datos: null }; }
    let datos = null; try { datos = JSON.parse(h.responseText); } catch (_) { /* sin cuerpo */ }
    return { estado: h.status, datos };
  }
  async function pedir(metodo, ruta, cuerpo, extra = {}) {
    const cabeceras = { ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...extra };
    if (cuerpo !== undefined && !(cuerpo instanceof Blob)) cabeceras['Content-Type'] = 'application/json';
    const r = await fetch(API + ruta, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : (cuerpo instanceof Blob ? cuerpo : JSON.stringify(cuerpo)) });
    if (r.status === 401 && token()) sesionVencida();
    return r;
  }
  function sesionVencida() {
    try { raiz.sessionStorage.removeItem(KT); } catch (_) { /* nada */ }
    if (PAGINAS_PANEL.test(raiz.location.pathname) && DB.online) raiz.location.replace(raiz.location.pathname.replace(/[^/]+$/, 'login.html'));
  }

  /* ---------- instantáneas (qué ya está guardado en MySQL) ---------- */
  const snap = {}; // clave → { cols: {nombre: Map(id→hash)}, esc: {nombre: hash} }
  function instantanea(clave, valor) {
    const e = SPEC[clave]; const s = { cols: {}, esc: {} };
    const filas = (arr, idf) => new Map((Array.isArray(arr) ? arr : []).filter((r) => r && typeof r === 'object').map((r) => [String(idf(r)), hash(estable(r))]));
    if (e.tipo === 'array') s.cols[e.col] = filas(valor, e.id);
    else if (e.tipo === 'escalar') s.esc[clave] = hash(estable(valor ?? {}));
    else {
      const v = valor && typeof valor === 'object' ? valor : {};
      Object.entries(e.cols).forEach(([n, idf]) => { s.cols[n] = filas(v[n], idf); });
      e.escalares.forEach((n) => { s.esc[`biblioteca.${n}`] = hash(estable(v[n] ?? {})); });
    }
    return s;
  }
  function diferencias(clave, valor, base) {
    const e = SPEC[clave]; const act = instantanea(clave, valor); const cambios = { cols: {}, escalares: {} }; let hay = false;
    const filasDe = (nombre) => { const v = e.tipo === 'array' ? valor : (valor || {})[nombre]; return Array.isArray(v) ? v : []; };
    Object.keys(act.cols).forEach((n) => {
      const idf = e.tipo === 'array' ? e.id : e.cols[n]; const antes = (base.cols[n]) || new Map(); const ahora = act.cols[n];
      const up = []; const del = [];
      filasDe(n).forEach((r) => { if (!r || typeof r !== 'object') return; const id = String(idf(r)); if (antes.get(id) !== ahora.get(id)) up.push({ id, datos: r }); });
      antes.forEach((_, id) => { if (!ahora.has(id)) del.push(id); });
      if (up.length || del.length) { cambios.cols[n] = { up, del }; hay = true; }
    });
    Object.keys(act.esc).forEach((n) => {
      if (base.esc[n] !== act.esc[n]) { cambios.escalares[n] = e.tipo === 'escalar' ? (valor ?? {}) : ((valor || {})[n.replace('biblioteca.', '')] ?? {}); hay = true; }
    });
    return hay ? { cambios, nueva: act } : null;
  }

  /* ---------- envío a MySQL ---------- */
  const temporizador = {}; const enVuelo = {}; let pendientes = 0;
  function programar(clave) {
    if (!DB.online || !token()) return;
    if (!temporizador[clave]) pendientes += 1;
    clearTimeout(temporizador[clave]); temporizador[clave] = setTimeout(() => empujar(clave), 80);
  }
  function terminar(clave) { if (temporizador[clave] !== undefined) { delete temporizador[clave]; pendientes = Math.max(0, pendientes - 1); } }
  async function empujar(clave, enSalida = false) {
    if (enVuelo[clave]) { clearTimeout(temporizador[clave]); temporizador[clave] = setTimeout(() => empujar(clave), 150); return; }
    clearTimeout(temporizador[clave]); terminar(clave);
    const d = diferencias(clave, leerLocal(clave), snap[clave] || instantanea(clave, null));
    if (!d) return;
    enVuelo[clave] = true;
    try {
      const r = await fetch(`${API}/api/sync`, { method: 'POST', keepalive: enSalida && JSON.stringify(d.cambios).length < 60000, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ clave, cambios: d.cambios }) });
      if (r.ok) { snap[clave] = d.nueva; DB.errores = 0; }
      else if (r.status === 401) sesionVencida();
      else if (r.status === 403) { snap[clave] = d.nueva; console.warn('[MySQL] Sin permiso para guardar', clave); }
      else throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      DB.errores += 1; console.warn('[MySQL] No se pudo guardar, se reintentará:', e.message);
      if (DB.errores < 12) { pendientes += 1; temporizador[clave] = setTimeout(() => empujar(clave), 4000); }
    } finally { enVuelo[clave] = false; }
  }
  function empujarSincrono(clave) { // se usa al cerrar sesión, para no perder el último cambio
    const d = diferencias(clave, leerLocal(clave), snap[clave] || instantanea(clave, null)); if (!d) return;
    const r = xhr('POST', '/api/sync', { clave, cambios: d.cambios }, true); if (r.estado === 200) snap[clave] = d.nueva;
  }
  const vaciarPendientes = (enSalida) => Object.keys(SPEC).forEach((c) => { if (temporizador[c] !== undefined || diferencias(c, leerLocal(c), snap[c] || instantanea(c, null))) empujar(c, enSalida); });

  // Intercepta los guardados de los paneles (localStorage.setItem / removeItem) para enviarlos a MySQL.
  Storage.prototype.setItem = function (k, v) { orig.set.call(this, k, v); if (this === ls && SPEC[k]) programar(k); };
  Storage.prototype.removeItem = function (k) { orig.quitar.call(this, k); if (this === ls && SPEC[k]) programar(k); };
  Storage.prototype.clear = function () {
    if (this === raiz.sessionStorage && DB.online && token()) { // cierre de sesión
      Object.keys(SPEC).forEach(empujarSincrono);
      xhr('POST', '/api/logout', {}, true);
      Object.keys(SPEC).forEach((k) => orig.quitar.call(ls, k)); // no deja datos de la institución en este navegador
      orig.quitar.call(ls, 'documentosMesaPartes');
    }
    return orig.limpiar.call(this);
  };

  /* ---------- recepción desde MySQL ---------- */
  let ultimaVersion = 0;
  function aplicarEstado(datos, avisar) {
    Object.keys(SPEC).forEach((clave) => {
      if (!(clave in datos)) return;
      const remoto = datos[clave]; const nuevo = instantanea(clave, remoto);
      const local = instantanea(clave, leerLocal(clave));
      const igual = estable(sinMapas(local)) === estable(sinMapas(nuevo));
      snap[clave] = nuevo;
      if (igual && ls.getItem(clave) !== null) return;
      if (temporizador[clave] !== undefined || enVuelo[clave]) return; // hay cambios locales sin enviar: se resolverán con el siguiente ciclo
      orig.set.call(ls, clave, JSON.stringify(remoto));
      if (avisar) raiz.dispatchEvent(new CustomEvent(SPEC[clave].ev));
    });
  }
  const sinMapas = (s) => ({ cols: Object.fromEntries(Object.entries(s.cols).map(([n, m]) => [n, [...m.entries()].sort()])), esc: s.esc });
  async function sondear() {
    if (!DB.online || !token() || document.hidden || pendientes > 0) return;
    try {
      const v = await pedir('GET', '/api/version'); if (!v.ok) return;
      const { version } = await v.json(); if (version === ultimaVersion) return;
      const r = await pedir('GET', '/api/estado'); if (!r.ok) return;
      const est = await r.json(); aplicarEstado(est.datos, true); ultimaVersion = est.version;
    } catch (_) { /* sin conexión: reintenta en el siguiente ciclo */ }
  }

  /* ---------- API pública del adaptador ---------- */
  const DB = {
    online: false, errores: 0,
    async login(usuario, clave) {
      try {
        const r = await fetch(`${API}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, clave }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return { ok: false, error: d.error || 'No se pudo iniciar sesión.' };
        raiz.sessionStorage.setItem(KT, d.token);
        return { ok: true, cuenta: d.cuenta };
      } catch (_) { return { ok: false, error: 'No se pudo conectar con el servidor.' }; }
    },
    async subirArchivo(archivo, ruta = '/api/archivos') {
      const r = await pedir('POST', ruta, archivo, { 'X-Nombre': encodeURIComponent(archivo.name || 'archivo'), 'X-Tipo': archivo.type || 'application/octet-stream', 'Content-Type': 'application/octet-stream' });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'No se pudo subir el archivo.');
      return d;
    },
    async bajarArchivo(id) {
      const r = await pedir('GET', `/api/archivos/${encodeURIComponent(id)}`); if (!r.ok) return null;
      const blob = await r.blob(); let nombre = id; try { nombre = decodeURIComponent(r.headers.get('X-Nombre') || id); } catch (_) { /* usa el id */ }
      return { id, nombre, tipo: blob.type, tam: blob.size, blob };
    },
    async listarPortal() { const r = await pedir('GET', '/api/portal'); if (!r.ok) throw new Error('No se pudo leer el portal.'); return r.json(); },
    async actualizarPortal(codigo, cambios) { const r = await pedir('POST', `/api/portal/${encodeURIComponent(codigo)}/actualizar`, cambios); if (!r.ok) throw new Error('No se pudo actualizar la solicitud.'); },
    async enviarSolicitud(datos, principal, anexos) {
      const p = await DB.subirArchivo(principal, '/api/portal/archivo'); const ids = [];
      for (const a of anexos) ids.push((await DB.subirArchivo(a, '/api/portal/archivo')).id);
      const r = await fetch(`${API}/api/portal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datos, archivo: p.id, anexos: ids }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'No se pudo registrar la solicitud.');
      return d.codigo;
    },
    async consultar(codigo) {
      const r = await fetch(`${API}/api/consulta/${encodeURIComponent(codigo)}`);
      if (r.status === 404) return null; if (!r.ok) throw new Error('Consulta no disponible.');
      return r.json();
    },
    sincronizarAhora: () => vaciarPendientes(false)
  };
  raiz.DBSync = DB;

  /* ---------- arranque ---------- */
  const salud = xhr('GET', '/api/salud', undefined, true);
  DB.online = salud.estado === 200 && salud.datos && salud.datos.ok === true;
  if (!DB.online) { console.info('[MySQL] Servidor no disponible: los paneles funcionan en modo local (navegador).'); return; }
  if (token()) {
    const r = xhr('GET', '/api/estado', undefined, true);
    if (r.estado === 200 && r.datos) {
      ultimaVersion = r.datos.version; aplicarEstado(r.datos.datos, false);
      // Datos que solo existían en este navegador (versión anterior sin base de datos) se suben a MySQL.
      Object.keys(SPEC).forEach((k) => { if (!(k in r.datos.datos)) { snap[k] = instantanea(k, null); if (ls.getItem(k) !== null) programar(k); } });
    } else if (r.estado === 401) {
      try { raiz.sessionStorage.removeItem(KT); } catch (_) { /* nada */ }
      if (PAGINAS_PANEL.test(raiz.location.pathname)) { raiz.location.replace(raiz.location.pathname.replace(/[^/]+$/, 'login.html')); return; }
    } else if (r.estado === 403) { /* cuenta externa: sin acceso a los datos internos */ }
  }
  Object.keys(SPEC).forEach((k) => { if (!snap[k]) snap[k] = instantanea(k, null); });
  setInterval(sondear, 3000);
  raiz.addEventListener('focus', sondear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) vaciarPendientes(true); else sondear(); });
  raiz.addEventListener('pagehide', () => vaciarPendientes(true));
})(window);
