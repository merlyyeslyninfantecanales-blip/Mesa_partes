/* Capa de datos de la Mesa de Partes. Trabaja en memoria del navegador y js/db-sync.js la mantiene sincronizada con MySQL
   (si el servidor no está encendido, funciona en modo local como antes).
   - Expedientes y configuración: localStorage.
   - Archivos adjuntos de la secretaría: IndexedDB "mesaPartesSecretaria".
   - Solicitudes enviadas desde el portal externo: IndexedDB "mesaPartesSolicitudes" (la misma que usa registrar-documento.html).
   Cuando exista el backend real (MySQL), solo hay que reemplazar las funciones de este archivo por llamadas a la API. */
(function (raiz) {
  'use strict';

  const CLAVE = 'mesaPartes.expedientes.v2';
  const CLAVE_CONFIG = 'mesaPartes.config.v2';
  const CLAVE_ESPEJO = 'documentosMesaPartes'; // Formato antiguo que lee la consulta pública de expedientes.

  const AREAS = ['Secretaría Académica', 'Coordinación Académica', 'Dirección General', 'Administración', 'Biblioteca'];
  const ESTADOS = ['Pendiente', 'Asignado', 'En revisión', 'Observado', 'Atendido', 'Archivado'];
  const TIPOS = ['Solicitud', 'Carta', 'Oficio', 'Informe', 'Memorando', 'Otros'];
  const CANALES = ['Ventanilla', 'Canal virtual', 'Correo institucional', 'Portal web'];
  const PRIORIDADES = ['Baja', 'Media', 'Alta'];

  const CONFIG_BASE = { responsable: 'Secretaría Académica', area: 'Secretaría Académica', anio: 2026 };

  /* ---------- Utilidades ---------- */
  const escapar = (valor = '') => String(valor).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const leer = (clave, defecto) => { try { const v = JSON.parse(localStorage.getItem(clave)); return v ?? defecto; } catch { return defecto; } };
  const escribir = (clave, valor) => localStorage.setItem(clave, JSON.stringify(valor));
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const dosDigitos = (n) => String(n).padStart(2, '0');
  const hora = (f) => `${dosDigitos(f.getHours())}:${dosDigitos(f.getMinutes())}`;
  const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function fmtFecha(iso) {
    const f = new Date(iso); if (Number.isNaN(f.getTime())) return '—';
    const hoy = new Date(); const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
    if (mismoDia(f, hoy)) return `Hoy, ${hora(f)}`;
    if (mismoDia(f, ayer)) return `Ayer, ${hora(f)}`;
    return `${dosDigitos(f.getDate())}/${dosDigitos(f.getMonth() + 1)}/${f.getFullYear()} ${hora(f)}`;
  }
  function fmtFechaLarga(iso) {
    const f = new Date(iso); if (Number.isNaN(f.getTime())) return '—';
    return `${dosDigitos(f.getDate())}/${dosDigitos(f.getMonth() + 1)}/${f.getFullYear()} ${hora(f)}`;
  }
  function fmtRelativo(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return 'Ahora mismo';
    if (min < 60) return `Hace ${min} min`;
    if (min < 1440) return `Hace ${Math.round(min / 60)} h`;
    return `Hace ${Math.round(min / 1440)} d`;
  }
  const fmtTam = (bytes = 0) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

  /* ---------- Configuración ---------- */
  const config = () => ({ ...CONFIG_BASE, ...leer(CLAVE_CONFIG, {}) });
  const guardarConfig = (cambios) => { escribir(CLAVE_CONFIG, { ...config(), ...cambios }); avisar(); };

  /* ---------- Expedientes ---------- */
  function avisar() { raiz.dispatchEvent(new CustomEvent('mesa:cambio')); }

  function semilla() {
    const ahora = Date.now(); const MIN = 60000;
    // [n.º, remitente, tipo, asunto, canal, área, prioridad, estado, minutos atrás, correo, dni, folios]
    const filas = [
      [150, 'Rosa Quispe Carrillo', 'Solicitud', 'Autorización de uso de la sala de lectura', 'Canal virtual', 'Biblioteca', 'Baja', 'Pendiente', 38, '', '46781233', 1],
      [149, 'Kevin Atoche Rojas', 'Solicitud', 'Constancia de no adeudo a biblioteca', 'Ventanilla', 'Biblioteca', 'Media', 'Asignado', 3 * 60, '', '70123456', 1],
      [148, 'María Torres Peña', 'Solicitud', 'Constancia de estudios', 'Canal virtual', 'Secretaría Académica', 'Alta', 'Pendiente', 11, 'maria.torres@example.com', '71234501', 2],
      [147, 'Carlos Mendoza Ruiz', 'Carta', 'Convalidación académica', 'Ventanilla', 'Coordinación Académica', 'Media', 'En revisión', 24, '', '45678912', 5],
      [146, 'Asociación de Egresados', 'Oficio', 'Solicitud de uso de auditorio', 'Correo institucional', 'Dirección General', 'Baja', 'Asignado', 50, 'egresados@example.com', '', 1],
      [145, 'Proveedores del Norte SAC', 'Informe', 'Regularización de comprobante', 'Canal virtual', 'Administración', 'Alta', 'Pendiente', 62, 'ventas@example.com', '20512345678', 3],
      [144, 'Lucía Fernández Salazar', 'Solicitud', 'Certificado modular', 'Ventanilla', 'Secretaría Académica', 'Media', 'En revisión', 17 * 60, '', '72345610', 2],
      [143, 'José Ramírez Chunga', 'Solicitud', 'Licencia de estudios', 'Ventanilla', 'Dirección General', 'Media', 'Asignado', 26 * 60, '', '40123987', 4],
      [142, 'Ana Pérez Vilela', 'Carta', 'Reincorporación de matrícula', 'Canal virtual', 'Secretaría Académica', 'Baja', 'Atendido', 30 * 60, 'ana.perez@example.com', '73456120', 2],
      [141, 'Municipalidad Distrital de Zorritos', 'Oficio', 'Invitación a ceremonia cívica', 'Correo institucional', 'Dirección General', 'Media', 'Atendido', 50 * 60, 'mesadepartes@example.com', '', 1],
      [140, 'Rosa Quispe Carrillo', 'Solicitud', 'Traslado externo', 'Ventanilla', 'Coordinación Académica', 'Alta', 'Observado', 52 * 60, '', '46781233', 6],
      [139, 'Diego Salazar Neira', 'Memorando', 'Entrega de sílabo del ciclo', 'Ventanilla', 'Coordinación Académica', 'Baja', 'Atendido', 75 * 60, '', '47891234', 1],
      [138, 'Servicios Generales Tumbes EIRL', 'Informe', 'Mantenimiento de equipos', 'Canal virtual', 'Administración', 'Media', 'Archivado', 5 * 1440, 'servicios@example.com', '20498765432', 3],
      [137, 'Kevin Atoche Rojas', 'Solicitud', 'Constancia de egresado', 'Canal virtual', 'Secretaría Académica', 'Media', 'Archivado', 6 * 1440, '', '70123456', 2]
    ];
    return filas.map(([n, remitente, tipo, asunto, canal, area, prioridad, estado, atras, correo, dni, folios]) => {
      const inicio = ahora - atras * MIN;
      const iso = (m) => new Date(Math.min(ahora, inicio + m * MIN)).toISOString();
      const movimientos = [{ fecha: iso(0), accion: 'Registro', detalle: `Documento recibido por ${canal.toLowerCase()}.`, responsable: 'Secretaría Académica' }];
      if (estado !== 'Pendiente') movimientos.push({ fecha: iso(4), accion: 'Derivación', detalle: `Asignado a ${area}.`, responsable: 'Secretaría Académica', a: area });
      if (estado === 'En revisión') movimientos.push({ fecha: iso(9), accion: 'Cambio de estado', detalle: 'Estado: Asignado → En revisión.', responsable: area });
      if (estado === 'Observado') movimientos.push({ fecha: iso(30), accion: 'Cambio de estado', detalle: 'Estado: Asignado → Observado. Falta adjuntar copia del DNI.', responsable: area });
      if (estado === 'Atendido' || estado === 'Archivado') movimientos.push({ fecha: iso(40), accion: 'Cambio de estado', detalle: 'Estado: En revisión → Atendido.', responsable: area });
      if (estado === 'Archivado') movimientos.push({ fecha: iso(60), accion: 'Archivado', detalle: 'Expediente enviado al archivo.', responsable: 'Secretaría Académica' });
      return {
        codigo: `EXP-2026-${String(n).padStart(4, '0')}`, origen: canal, canal, remitente, dni, correo, telefono: '', tipo, numeroDocumento: '',
        asunto, folios, prioridad, area, estado, estadoPrevio: estado === 'Archivado' ? 'Atendido' : '', notas: '',
        fecha: iso(0), adjuntos: [], movimientos
      };
    });
  }

  function listar() {
    let datos = leer(CLAVE, null);
    if (!Array.isArray(datos)) { datos = semilla(); escribir(CLAVE, datos); espejo(datos); }
    return datos;
  }
  function espejo(datos) {
    // Copia simplificada para que la página pública "Consulta de expediente" siga funcionando con el código EXP-...
    escribir(CLAVE_ESPEJO, datos.map((d) => ({ codigo: d.codigo, remitente: d.remitente, tipo: d.tipo, asunto: d.asunto, area: d.area, estado: d.estado, fecha: d.fecha })));
  }
  function guardar(datos, cambiados = []) {
    escribir(CLAVE, datos); espejo(datos);
    cambiados.filter((d) => d.portalCodigo).forEach((d) => actualizarPortal(d.portalCodigo, { estado: `${d.estado} · ${d.codigo}`, area: d.area }).catch(() => {}));
    avisar();
  }
  const obtener = (codigo) => listar().find((d) => d.codigo === codigo) || null;

  function siguienteCodigo() {
    const { anio } = config(); let max = anio === 2026 ? 150 : 0;
    listar().forEach((d) => { const m = String(d.codigo).match(/^EXP-(\d{4})-(\d+)$/); if (m && Number(m[1]) === Number(anio)) max = Math.max(max, Number(m[2])); });
    return `EXP-${anio}-${String(max + 1).padStart(4, '0')}`;
  }

  function mover(exp, accion, detalle, extra = {}) {
    exp.movimientos = exp.movimientos || [];
    exp.movimientos.push({ fecha: new Date().toISOString(), accion, detalle, responsable: config().responsable, ...extra });
  }

  function crear(datos) {
    const lista = listar();
    const exp = {
      origen: datos.canal || 'Ventanilla', canal: 'Ventanilla', dni: '', correo: '', telefono: '', numeroDocumento: '', folios: 1, notas: '', adjuntos: [],
      ...datos, codigo: siguienteCodigo(), estado: 'Pendiente', estadoPrevio: '', fecha: new Date().toISOString(), movimientos: []
    };
    mover(exp, 'Registro', `Documento recibido por ${String(exp.canal).toLowerCase()}.${exp.adjuntos.length ? ` Adjuntos: ${exp.adjuntos.length}.` : ''}`);
    if (exp.area) { exp.estado = 'Asignado'; mover(exp, 'Derivación', `Asignado a ${exp.area}.${exp.notas ? ` Indicaciones: ${exp.notas}` : ''}`, { a: exp.area }); }
    lista.unshift(exp); guardar(lista, [exp]);
    return exp;
  }

  function aplicar(codigos, fn) {
    const lista = listar(); const cambiados = [];
    lista.forEach((exp) => { if (codigos.includes(exp.codigo)) { fn(exp); cambiados.push(exp); } });
    if (cambiados.length) guardar(lista, cambiados);
    return cambiados;
  }

  function derivar(codigos, { area, prioridad, indicaciones = '', plazoDias = 0 }) {
    return aplicar(codigos, (exp) => {
      const origen = exp.area;
      exp.area = area; if (prioridad) exp.prioridad = prioridad;
      exp.estado = 'Asignado'; exp.estadoPrevio = '';
      if (Number(plazoDias) > 0) { const l = new Date(); l.setDate(l.getDate() + Number(plazoDias)); exp.plazo = l.toISOString(); }
      mover(exp, 'Derivación', `${origen ? `De ${origen} a ${area}` : `Enviado a ${area}`}.${Number(plazoDias) > 0 ? ` Plazo: ${plazoDias} día(s).` : ''}${indicaciones ? ` Indicaciones: ${indicaciones}` : ''}`, { de: origen, a: area });
    });
  }
  function cambiarEstado(codigos, estado, comentario = '') {
    return aplicar(codigos, (exp) => {
      if (exp.estado === estado) return;
      const anterior = exp.estado;
      if (estado === 'Archivado') exp.estadoPrevio = anterior;
      exp.estado = estado;
      mover(exp, estado === 'Archivado' ? 'Archivado' : 'Cambio de estado', `Estado: ${anterior} → ${estado}.${comentario ? ` ${comentario}` : ''}`);
    });
  }
  const archivar = (codigos, comentario = 'Expediente enviado al archivo.') => cambiarEstado(codigos, 'Archivado', comentario);
  function restaurar(codigos) {
    return aplicar(codigos, (exp) => {
      const destino = exp.estadoPrevio && exp.estadoPrevio !== 'Archivado' ? exp.estadoPrevio : 'Atendido';
      exp.estado = destino; exp.estadoPrevio = '';
      mover(exp, 'Restaurado', `Expediente restaurado del archivo. Estado: ${destino}.`);
    });
  }
  const actualizar = (codigo, campos, detalle = 'Se actualizaron los datos del expediente.') => aplicar([codigo], (exp) => { Object.assign(exp, campos); mover(exp, 'Edición', detalle); });
  const agregarNota = (codigo, texto) => aplicar([codigo], (exp) => mover(exp, 'Nota', texto));
  const agregarAdjuntos = (codigo, adjuntos) => aplicar([codigo], (exp) => {
    exp.adjuntos = [...(exp.adjuntos || []), ...adjuntos];
    mover(exp, 'Adjunto', `Se adjuntó: ${adjuntos.map((a) => a.nombre).join(', ')}.`);
  });

  /* ---------- Respaldo y reinicio ---------- */
  const respaldo = () => ({ version: 2, exportado: new Date().toISOString(), config: config(), expedientes: listar() });
  function restaurarRespaldo(objeto) {
    if (!objeto || !Array.isArray(objeto.expedientes)) throw new Error('Archivo de respaldo no válido.');
    escribir(CLAVE, objeto.expedientes); if (objeto.config) escribir(CLAVE_CONFIG, objeto.config);
    espejo(objeto.expedientes); avisar();
  }
  function restablecerDemo() { const d = semilla(); escribir(CLAVE, d); espejo(d); avisar(); }
  function vaciar() { escribir(CLAVE, []); espejo([]); avisar(); }

  /* ---------- IndexedDB ---------- */
  function abrirDB(nombre, almacen, clave) {
    return new Promise((resolver, rechazar) => {
      const a = indexedDB.open(nombre, 1);
      a.onupgradeneeded = () => { if (!a.result.objectStoreNames.contains(almacen)) a.result.createObjectStore(almacen, { keyPath: clave }); };
      a.onsuccess = () => resolver(a.result);
      a.onerror = () => rechazar(a.error);
    });
  }
  function transaccion(db, almacen, modo, operacion) {
    return new Promise((resolver, rechazar) => {
      const t = db.transaction(almacen, modo); let peticion;
      try { peticion = operacion(t.objectStore(almacen)); } catch (error) { db.close(); rechazar(error); return; }
      t.oncomplete = () => { db.close(); resolver(peticion ? peticion.result : undefined); };
      t.onerror = t.onabort = () => { db.close(); rechazar(t.error); };
    });
  }

  const enServidor = () => Boolean(raiz.DBSync && raiz.DBSync.online && sessionStorage.getItem('tokenMesaPartes'));

  async function guardarArchivo(archivo) {
    if (enServidor()) { const r = await raiz.DBSync.subirArchivo(archivo); return { id: r.id, nombre: r.nombre, tipo: r.tipo, tam: r.tam }; } // MySQL + carpeta backend/uploads
    const id = nuevoId();
    const db = await abrirDB('mesaPartesSecretaria', 'archivos', 'id');
    await transaccion(db, 'archivos', 'readwrite', (s) => s.put({ id, nombre: archivo.name, tipo: archivo.type || 'application/octet-stream', tam: archivo.size, blob: archivo }));
    return { id, nombre: archivo.name, tipo: archivo.type || 'application/octet-stream', tam: archivo.size };
  }
  async function obtenerArchivo(id) {
    if (enServidor()) { const r = await raiz.DBSync.bajarArchivo(id); if (r) return r; } // si no está en el servidor, busca en este navegador (datos antiguos)
    const db = await abrirDB('mesaPartesSecretaria', 'archivos', 'id');
    return transaccion(db, 'archivos', 'readonly', (s) => s.get(id));
  }

  /* ---------- Solicitudes del portal externo ---------- */
  async function listarPortal() {
    if (enServidor()) return raiz.DBSync.listarPortal();
    const db = await abrirDB('mesaPartesSolicitudes', 'solicitudes', 'codigo');
    const todas = await transaccion(db, 'solicitudes', 'readonly', (s) => s.getAll());
    return (todas || []).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }
  async function actualizarPortal(codigo, cambios) {
    if (enServidor()) return raiz.DBSync.actualizarPortal(codigo, cambios);
    const db = await abrirDB('mesaPartesSolicitudes', 'solicitudes', 'codigo');
    return new Promise((resolver, rechazar) => {
      const t = db.transaction('solicitudes', 'readwrite'); const almacen = t.objectStore('solicitudes');
      const lectura = almacen.get(codigo);
      lectura.onsuccess = () => { if (lectura.result) almacen.put({ ...lectura.result, ...cambios }); };
      t.oncomplete = () => { db.close(); resolver(); };
      t.onerror = t.onabort = () => { db.close(); rechazar(t.error); };
    });
  }
  async function recibirPortal(solicitud, { area, prioridad, indicaciones }) {
    const adjuntos = [];
    for (const archivo of [solicitud.archivo, ...(solicitud.anexos || [])]) {
      if (!archivo) continue;
      if (archivo.id && !(archivo instanceof Blob)) adjuntos.push({ id: archivo.id, nombre: archivo.nombre || archivo.name, tipo: archivo.tipo || archivo.type, tam: archivo.tam || archivo.size }); // ya está guardado en el servidor
      else adjuntos.push(await guardarArchivo(archivo));
    }
    const exp = crear({
      origen: solicitud.origen === 'Biblioteca' ? 'Biblioteca' : 'Portal web', canal: 'Portal web', portalCodigo: solicitud.codigo,
      remitente: solicitud.remitente, dni: solicitud.dni || '', correo: solicitud.correo || '', telefono: solicitud.telefono || '',
      tipo: solicitud.tipo || 'Solicitud', numeroDocumento: solicitud['numero-documento'] || '', asunto: solicitud.asunto || 'Sin asunto',
      folios: Number(solicitud.folios) || 1, prioridad, area, notas: indicaciones || '', adjuntos
    });
    await actualizarPortal(solicitud.codigo, { estado: `${exp.estado} · ${exp.codigo}`, area, expediente: exp.codigo });
    return exp;
  }
  const observarPortal = (codigo, motivo) => actualizarPortal(codigo, { estado: 'Observado', observacion: motivo });

  raiz.MesaDatos = {
    AREAS, ESTADOS, TIPOS, CANALES, PRIORIDADES, escapar, fmtFecha, fmtFechaLarga, fmtRelativo, fmtTam, config, guardarConfig,
    listar, obtener, siguienteCodigo, crear, derivar, cambiarEstado, archivar, restaurar, actualizar, agregarNota, agregarAdjuntos,
    respaldo, restaurarRespaldo, restablecerDemo, vaciar, guardarArchivo, obtenerArchivo, listarPortal, recibirPortal, observarPortal
  };
})(window);
