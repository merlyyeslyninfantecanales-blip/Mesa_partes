/* Traduce los datos del sistema (objetos JSON que usa el frontend) a tablas MySQL y viceversa.
   Cada colección guarda sus campos principales en columnas reales (para consultas e informes)
   y el objeto completo en la columna "datos". Al leer, las columnas tienen prioridad. */
const crypto = require('crypto');
const { obtenerConexion } = require('./conexion');
const { hashClave, fechaSQL } = require('./seguridad');

/* Tipos de columna:  s texto · n número · b booleano (falso por defecto) · B booleano (verdadero por defecto) · d fecha opcional · D fecha obligatoria */
const T = {
  expedientes: {
    tabla: 'expedientes', pk: 'codigo', orden: 'fecha DESC, seq DESC', hijos: 'movimientos',
    cols: {
      codigo: ['codigo', 's'], remitente: ['remitente', 's'], dni: ['dni', 's'], correo: ['correo', 's'], tipo: ['tipo', 's'], asunto: ['asunto', 's'],
      canal: ['canal', 's'], area: ['area', 's'], prioridad: ['prioridad', 's'], estado: ['estado', 's'], plazo: ['plazo', 'd'],
      portal_codigo: ['portalCodigo', 'sn'], fecha: ['fecha', 'D']
    }
  },
  usuarios: {
    tabla: 'usuarios', pk: 'usuario', orden: 'seq ASC', secreto: 'clave',
    cols: { usuario: ['usuario', 's'], nombre: ['nombre', 's'], rol: ['rol', 's'], dependencia: ['dependencia', 's'], pagina: ['pagina', 's'], activo: ['activo', 'B'], ultimo_acceso: ['ultimoAcceso', 'd'], creado: ['creado', 'd'] }
  },
  bitacora: {
    tabla: 'bitacora', pk: 'id', orden: 'fecha ASC, seq ASC', sinDatos: true,
    cols: { id: ['id', 's'], fecha: ['fecha', 'D'], tipo: ['tipo', 's'], usuario: ['usuario', 's'], accion: ['accion', 's'], detalle: ['detalle', 's'] }
  },
  libros: { tabla: 'libros', pk: 'id', orden: 'seq ASC', cols: { id: ['id', 's'], codigo: ['codigo', 'sn'], titulo: ['titulo', 's'], autor: ['autor', 's'], categoria: ['categoria', 's'], ejemplares: ['ejemplares', 'n'], activo: ['activo', 'B'] } },
  lectores: { tabla: 'lectores', pk: 'id', orden: 'seq ASC', cols: { id: ['id', 's'], dni: ['dni', 's'], nombre: ['nombre', 's'], tipo: ['tipo', 's'], estado: ['estado', 's'] } },
  prestamos: { tabla: 'prestamos', pk: 'id', orden: 'seq DESC', cols: { id: ['id', 's'], codigo: ['codigo', 'sn'], libro_id: ['libroId', 'sn'], lector_id: ['lectorId', 'sn'], tipo: ['tipo', 's'], fecha: ['fecha', 'd'], vence: ['vence', 'd'], fecha_devolucion: ['fechaDevolucion', 'd'] } },
  reservas: { tabla: 'reservas', pk: 'id', orden: 'seq DESC', cols: { id: ['id', 's'], codigo: ['codigo', 'sn'], libro_id: ['libroId', 'sn'], lector_id: ['lectorId', 'sn'], estado: ['estado', 's'], fecha: ['fecha', 'd'] } },
  visitas: { tabla: 'visitas', pk: 'id', orden: 'seq DESC', cols: { id: ['id', 's'], lector_id: ['lectorId', 'sn'], dni: ['dni', 's'], nombre: ['nombre', 's'], motivo: ['motivo', 's'], ingreso: ['ingreso', 'd'], salida: ['salida', 'd'] } },
  constancias: { tabla: 'constancias', pk: 'id', orden: 'seq DESC', cols: { id: ['numero', 's'], codigo: ['numero', 'sn'], lector_id: ['lectorId', 'sn'], fecha: ['fecha', 'd'] } }
};

/* Qué colecciones y valores sueltos forman cada clave de almacenamiento del navegador. */
const CLAVES = {
  'mesaPartes.expedientes.v2': { tipo: 'array', col: 'expedientes' },
  'mesaPartes.usuarios.v1': { tipo: 'array', col: 'usuarios', soloAdmin: true },
  'mesaPartes.bitacora.v1': { tipo: 'array', col: 'bitacora' },
  'mesaPartes.config.v2': { tipo: 'escalar' },
  'mesaPartes.admin.v1': { tipo: 'escalar' },
  'mesaPartes.biblioteca.v1': { tipo: 'objeto', cols: ['libros', 'lectores', 'prestamos', 'reservas', 'visitas', 'constancias'], escalares: ['config', 'contadores'] }
};

/* ---------- conversiones ---------- */
const aSQLFecha = (v) => { if (v == null || v === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : fechaSQL(d); };
const deSQLFecha = (v) => (v ? `${String(v).replace(' ', 'T')}${/Z$/.test(v) ? '' : 'Z'}` : null);
function aColumna(tipo, v) {
  switch (tipo) {
    case 'n': return Number(v) || 0;
    case 'b': return v ? 1 : 0;
    case 'B': return v === false || v === 0 ? 0 : 1;
    case 'd': return aSQLFecha(v);
    case 'D': return aSQLFecha(v) || fechaSQL();
    case 'sn': return v == null || v === '' ? null : String(v).slice(0, 400);
    default: return v == null ? '' : String(v).slice(0, 400);
  }
}
function deColumna(tipo, v) {
  if (tipo === 'n') return Number(v); if (tipo === 'b' || tipo === 'B') return Boolean(Number(v));
  if (tipo === 'd' || tipo === 'D') return deSQLFecha(v); return v == null ? '' : String(v);
}
const firma = (m) => crypto.createHash('sha1').update(`${m.fecha}|${m.accion}|${m.detalle}|${m.responsable || ''}`).digest('hex');
const analizar = (s) => { try { return JSON.parse(s); } catch { return {}; } };

/* ---------- escritura ---------- */
async function subir(cx, nombre, filas) {
  const t = T[nombre]; const columnas = Object.keys(t.cols); if (!columnas.includes(t.pk)) columnas.unshift(t.pk);
  for (const { id, datos: fila } of filas) {
    if (!fila || typeof fila !== 'object') continue;
    const objeto = { ...fila };
    if (nombre === 'constancias') objeto.numero = objeto.numero || id;
    const valores = columnas.map((c) => {
      if (c === t.pk) return String(id).slice(0, 80);
      return aColumna(t.cols[c][1], objeto[t.cols[c][0]]);
    });
    const extras = []; const extraValores = [];
    if (t.hijos) delete objeto.movimientos;
    if (t.secreto) {
      const clave = objeto[t.secreto]; delete objeto[t.secreto];
      if (clave) { extras.push('clave_hash'); extraValores.push(hashClave(clave)); }
    }
    if (!t.sinDatos) { extras.push('datos'); extraValores.push(JSON.stringify(objeto)); }
    const todas = [...columnas, ...extras]; const todosValores = [...valores, ...extraValores];
    const actualiza = todas.filter((c) => c !== t.pk).map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
    await cx.query(`INSERT INTO \`${t.tabla}\` (${todas.map((c) => `\`${c}\``).join(',')}) VALUES (${todas.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${actualiza}`, todosValores);
    if (t.hijos && Array.isArray(fila.movimientos)) {
      for (const m of fila.movimientos) {
        await cx.query('INSERT IGNORE INTO movimientos (expediente, firma, fecha, accion, detalle, responsable, datos) VALUES (?,?,?,?,?,?,?)',
          [String(id), firma(m), aColumna('D', m.fecha), String(m.accion || '').slice(0, 40), m.detalle || '', String(m.responsable || '').slice(0, 120), JSON.stringify(m)]);
      }
    }
  }
}
async function borrar(cx, nombre, ids) {
  if (!ids.length) return; const t = T[nombre];
  await cx.query(`DELETE FROM \`${t.tabla}\` WHERE \`${t.pk}\` IN (?)`, [ids.map(String)]);
}

async function marcarInicial(cx, clave) {
  await cx.query('INSERT INTO configuracion (clave, valor, actualizado) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado = VALUES(actualizado)', [`init:${clave}`, '1', fechaSQL()]);
}
async function guardarEscalar(cx, nombre, valor) {
  if (nombre === 'biblioteca.contadores' && valor && typeof valor === 'object') { // dos bibliotecarias a la vez: se conserva el contador más alto
    const [f] = await cx.query('SELECT valor FROM configuracion WHERE clave = ? FOR UPDATE', [nombre]);
    const previo = f[0] ? analizar(f[0].valor) : {};
    Object.keys(previo).forEach((k) => { if (Number(previo[k]) > Number(valor[k] || 0)) valor[k] = previo[k]; });
  }
  await cx.query('INSERT INTO configuracion (clave, valor, actualizado) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado = VALUES(actualizado)', [nombre, JSON.stringify(valor ?? null), fechaSQL()]);
}

/* Aplica un lote de cambios enviado por el navegador. cambios = { cols:{nombre:{up:[{id,datos}],del:[id]}}, escalares:{nombre:valor} } */
async function aplicar(clave, cambios, rol) {
  const spec = CLAVES[clave]; if (!spec) { const e = new Error('Clave desconocida'); e.estado = 400; throw e; }
  if (spec.soloAdmin && rol !== 'Administración') { const e = new Error('Solo el administrador puede modificar las cuentas.'); e.estado = 403; throw e; }
  const cx = await obtenerConexion().getConnection();
  try {
    await cx.beginTransaction();
    for (const [nombre, c] of Object.entries(cambios.cols || {})) {
      if (!T[nombre] || !(spec.col === nombre || (spec.cols || []).includes(nombre))) continue;
      await borrar(cx, nombre, Array.isArray(c.del) ? c.del : []);
      await subir(cx, nombre, Array.isArray(c.up) ? c.up : []);
    }
    for (const [nombre, valor] of Object.entries(cambios.escalares || {})) {
      const permitido = spec.tipo === 'escalar' ? nombre === clave : (spec.escalares || []).some((n) => `biblioteca.${n}` === nombre);
      if (permitido) await guardarEscalar(cx, nombre, valor);
    }
    await marcarInicial(cx, clave);
    await cx.commit();
  } catch (e) { await cx.rollback(); throw e; } finally { cx.release(); }
}

/* ---------- lectura ---------- */
async function leerColeccion(nombre) {
  const t = T[nombre]; const cx = obtenerConexion();
  const [filas] = await cx.query(`SELECT * FROM \`${t.tabla}\` ORDER BY ${t.orden}`);
  let movs = {};
  if (t.hijos) {
    const [ms] = await cx.query('SELECT * FROM movimientos ORDER BY fecha ASC, id ASC');
    ms.forEach((m) => { const o = { ...analizar(m.datos), fecha: deSQLFecha(m.fecha), accion: m.accion, detalle: m.detalle ?? '', responsable: m.responsable }; (movs[m.expediente] ||= []).push(o); });
  }
  return filas.map((f) => {
    const base = t.sinDatos ? {} : analizar(f.datos);
    for (const [col, [campo, tipo]] of Object.entries(t.cols)) {
      if (col === t.pk) { base[campo] = f[col]; continue; }
      const valor = deColumna(tipo, f[col]);
      if (t.sinDatos || aColumna(tipo, base[campo]) !== aColumna(tipo, valor)) base[campo] = valor;
    }
    if (t.hijos) base.movimientos = movs[f[t.pk]] || [];
    return JSON.parse(JSON.stringify(base)); // elimina "undefined"
  });
}

async function leerEstado() {
  const cx = obtenerConexion();
  const [inic] = await cx.query("SELECT clave FROM configuracion WHERE clave LIKE 'init:%'");
  const listos = new Set(inic.map((f) => f.clave.slice(5)));
  const [cfg] = await cx.query("SELECT clave, valor FROM configuracion WHERE clave NOT LIKE 'init:%'");
  const escalares = Object.fromEntries(cfg.map((f) => [f.clave, analizar(f.valor)]));
  const datos = {};
  for (const [clave, spec] of Object.entries(CLAVES)) {
    if (!listos.has(clave)) continue;
    if (spec.tipo === 'array') datos[clave] = await leerColeccion(spec.col);
    else if (spec.tipo === 'escalar') datos[clave] = escalares[clave] ?? {};
    else {
      const o = {};
      for (const c of spec.cols) o[c] = await leerColeccion(c);
      for (const e of spec.escalares) o[e] = escalares[`biblioteca.${e}`] ?? {};
      datos[clave] = o;
    }
  }
  return datos;
}

module.exports = { T, CLAVES, aplicar, leerEstado, leerColeccion };
