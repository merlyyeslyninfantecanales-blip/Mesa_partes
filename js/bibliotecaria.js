/* Panel de Biblioteca: solo envía documentos a la Secretaría de Mesa de Partes y muestra el estado de lo enviado.
   - Con el servidor encendido, el documento y sus archivos se guardan en MySQL (tabla solicitudes_portal) y aparecen en
     «Solicitudes del portal por recibir» del panel de Secretaría.
   - Sin servidor, se guardan en el navegador (IndexedDB "mesaPartesSolicitudes"), la misma bandeja que lee Secretaría en este navegador. */
(function () {
  'use strict';
  const D = window.MesaDatos, E = D.escapar;
  const ORIGEN = 'Biblioteca';
  const REMITENTE = { nombres: 'Biblioteca', 'apellido-paterno': 'IESTP', 'apellido-materno': 'CMVO' };
  const CORREO = 'istpcmvo@hotmail.com'; // Correo institucional (el servidor exige un correo válido).
  const MAX_PRINCIPAL = 50 * 1024 * 1024, MAX_ANEXO = 20 * 1024 * 1024;
  const VISTAS = ['enviar', 'seguimiento'];
  const TEXTOS = {
    enviar: ['BIBLIOTECA → SECRETARÍA', 'Envío de documentos', 'Envía documentos a la Secretaría de Mesa de Partes.', 'Enviar documento'],
    seguimiento: ['SEGUIMIENTO', 'Documentos enviados', 'Revisa en qué estado está cada documento que enviaste a Secretaría.', 'Seguimiento']
  };
  const ESTADO_CLASE = { Pendiente: 'pending', Asignado: 'assigned', 'En revisión': 'review', Observado: 'observed', Atendido: 'done', Archivado: 'archived' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const refrescar = (r) => window.actualizarIconos && window.actualizarIconos(r || document);
  const enServidor = () => Boolean(window.DBSync && window.DBSync.online);
  const st = { vista: 'enviar', envios: [], principal: null, anexos: [] };

  /* ---------- Avisos ---------- */
  function aviso(texto, tipo = 'ok') {
    const t = document.createElement('div'); t.className = `toast ${tipo}`; t.setAttribute('role', 'status'); t.textContent = texto;
    const caja = $('#toasts'); while (caja.children.length >= 3) caja.firstChild.remove();
    caja.append(t); setTimeout(() => t.classList.add('salir'), 3800); setTimeout(() => t.remove(), 4300);
  }
  function mensaje(texto, tipo) { // tipo: 'exito' | 'error' | 'info'
    const m = $('#e-mensaje'); m.textContent = texto; m.className = texto ? `mensaje visible ${tipo}` : 'mensaje';
  }

  /* ---------- Archivos adjuntos ---------- */
  function listaArchivos(ul, archivos, quitar) {
    ul.innerHTML = archivos.map((a, i) => `<li><i data-lucide="file-text"></i><span>${E(a.name)}</span><small>${E(D.fmtTam(a.size))}</small><button type="button" data-quitar="${i}" aria-label="Quitar ${E(a.name)}"><i data-lucide="x"></i></button></li>`).join('');
    $$('[data-quitar]', ul).forEach((b) => b.addEventListener('click', () => quitar(Number(b.dataset.quitar))));
    refrescar(ul);
  }
  function pintarArchivos() {
    listaArchivos($('#e-lista-principal'), st.principal ? [st.principal] : [], () => { st.principal = null; $('#e-archivo').value = ''; pintarArchivos(); });
    listaArchivos($('#e-lista-anexos'), st.anexos, (i) => { st.anexos.splice(i, 1); pintarArchivos(); });
  }
  $('#e-archivo').addEventListener('change', () => {
    const a = $('#e-archivo').files[0]; if (!a) return;
    if (!/\.pdf$/i.test(a.name) || !a.size || a.size > MAX_PRINCIPAL) { $('#e-archivo').value = ''; return mensaje('El documento principal debe ser un PDF no vacío de hasta 50 MB.', 'error'); }
    st.principal = a; mensaje('', 'info'); pintarArchivos();
  });
  $('#e-anexos').addEventListener('change', () => {
    const nuevos = [...$('#e-anexos').files]; $('#e-anexos').value = '';
    if (nuevos.some((a) => !/\.(pdf|doc|docx|jpg|jpeg)$/i.test(a.name) || !a.size || a.size > MAX_ANEXO)) return mensaje('Los anexos deben ser PDF, Word o JPG no vacíos de hasta 20 MB por archivo.', 'error');
    st.anexos.push(...nuevos); mensaje('', 'info'); pintarArchivos();
  });
  $('#e-asunto').addEventListener('input', (e) => { $('#e-caracteres').textContent = `${900 - e.target.value.length} caracteres restantes`; });

  /* ---------- Envío ---------- */
  // Sin servidor: guarda datos y archivos juntos en el navegador (la bandeja que lee Secretaría en este navegador).
  function guardarLocal(documento) {
    return new Promise((resolver, rechazar) => {
      const apertura = indexedDB.open('mesaPartesSolicitudes', 1);
      apertura.onupgradeneeded = () => apertura.result.createObjectStore('solicitudes', { keyPath: 'codigo' });
      apertura.onerror = () => rechazar(apertura.error);
      apertura.onsuccess = () => {
        const db = apertura.result; const t = db.transaction('solicitudes', 'readwrite');
        t.objectStore('solicitudes').add(documento);
        t.oncomplete = () => { db.close(); resolver(); };
        t.onabort = t.onerror = () => { db.close(); rechazar(t.error); };
      };
    });
  }
  function limpiarFormulario() {
    $('#f-envio').reset(); st.principal = null; st.anexos = []; $('#e-archivo').value = ''; $('#e-anexos').value = '';
    pintarArchivos(); $('#e-caracteres').textContent = '900 caracteres restantes';
  }
  $('#e-limpiar').addEventListener('click', () => { limpiarFormulario(); mensaje('', 'info'); });
  $('#f-envio').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const tipo = $('#e-tipo').value, numero = $('#e-numero').value.trim(), folios = $('#e-folios').value.trim(), asunto = $('#e-asunto').value.trim();
    if (!tipo) { mensaje('Seleccione el tipo de documento.', 'error'); return $('#e-tipo').focus(); }
    if (!numero) { mensaje('Ingrese el número de documento.', 'error'); return $('#e-numero').focus(); }
    if (!(Number(folios) >= 1)) { mensaje('Ingrese el número de folios (mínimo 1).', 'error'); return $('#e-folios').focus(); }
    if (asunto.length < 3) { mensaje('Ingrese el asunto del documento.', 'error'); return $('#e-asunto').focus(); }
    if (!st.principal) { mensaje('Seleccione el documento principal en formato PDF.', 'error'); return $('#e-archivo').focus(); }
    const boton = $('#e-enviar'), etiqueta = $('span', boton); boton.disabled = true; etiqueta.textContent = 'Enviando…';
    try {
      const datos = { ...REMITENTE, dni: '', telefono: '', correo: CORREO, tipo, 'numero-documento': numero, folios, asunto, origen: ORIGEN };
      let codigo;
      if (enServidor()) codigo = await window.DBSync.enviarSolicitud(datos, st.principal, st.anexos);
      else {
        codigo = `LOCAL-${new Date().getFullYear()}-${crypto.randomUUID()}`;
        await guardarLocal({ ...datos, codigo, remitente: `${REMITENTE.nombres} ${REMITENTE['apellido-paterno']} ${REMITENTE['apellido-materno']}`, fecha: new Date().toISOString(), estado: 'Pendiente de envío', archivo: st.principal, anexos: st.anexos });
      }
      limpiarFormulario();
      mensaje(`Documento enviado a la Secretaría. Código de envío: ${codigo}.`, 'exito'); aviso('Documento enviado a la Secretaría.');
      await cargarEnvios();
    } catch (e) {
      mensaje(enServidor() ? (e.message || 'No se pudo enviar el documento. Inténtelo nuevamente; sus datos siguen en el formulario.') : 'No se pudo guardar el documento. Verifique el espacio disponible y los permisos del navegador.', 'error');
    } finally { boton.disabled = false; etiqueta.textContent = 'Enviar a Secretaría'; }
  });

  /* ---------- Seguimiento ---------- */
  async function cargarEnvios() {
    try { st.envios = (await D.listarPortal()).filter((s) => s.origen === ORIGEN); } catch (_) { /* conserva lo anterior */ }
    pintarEnvios();
  }
  const etapa = (e) => (e === 'Pendiente de envío' ? 'pendiente' : e === 'Observado' ? 'observado' : 'recibido');
  const textoEstado = (s) => (s.estado === 'Pendiente de envío' ? 'Enviado a Secretaría' : s.estado);
  const claseEstado = (s) => (s.estado === 'Pendiente de envío' ? 'pending' : ESTADO_CLASE[String(s.estado).split(' · ')[0]] || 'assigned');
  function pintarEnvios() {
    const t = st.envios; const n = (k) => t.filter((s) => etapa(s.estado) === k).length;
    const k = { total: t.length, pendientes: n('pendiente'), recibidos: n('recibido'), observados: n('observado') };
    Object.entries(k).forEach(([clave, v]) => $$(`[data-k="${clave}"]`).forEach((el) => { el.textContent = v; }));
    const b = $('#badge-envios'); b.textContent = k.observados; b.hidden = !k.observados;
    const q = $('#s-q').value.trim().toLowerCase();
    const lista = t.filter((s) => !q || [s.codigo, s.asunto, s.tipo, s['numero-documento'], s.estado].some((x) => String(x || '').toLowerCase().includes(q)));
    $('#s-tb').innerHTML = lista.length ? lista.map((s) => `<tr>
      <td><strong>${E(String(s.codigo).replace(/^(LOCAL-\d{4}-[0-9a-f]{6}).*$/i, '$1…'))}</strong>${s.expediente ? `<small>${E(s.expediente)}</small>` : ''}</td>
      <td><strong>${E(s.tipo || 'Documento')}${s['numero-documento'] ? ` · ${E(s['numero-documento'])}` : ''}</strong><small>${E(s.asunto || 'Sin asunto')}</small></td>
      <td><span class="archivos-col"><i data-lucide="paperclip"></i>${1 + (s.anexos || []).length} archivo(s)</span></td>
      <td><strong>${E(D.fmtFecha(s.fecha))}</strong><small>${E(D.fmtRelativo(s.fecha))}</small></td>
      <td><span class="status ${claseEstado(s)}">${E(textoEstado(s))}</span>${s.estado === 'Observado' && s.observacion ? `<small class="motivo">Motivo: ${E(s.observacion)}</small>` : ''}${s.area ? `<small>Área: ${E(s.area)}</small>` : ''}</td></tr>`).join('')
      : `<tr><td class="vacio" colspan="5">${t.length ? 'No hay envíos que coincidan con la búsqueda.' : 'Aún no has enviado documentos a Secretaría.'}</td></tr>`;
    refrescar($('#s-tb'));
  }
  $('#s-q').addEventListener('input', pintarEnvios);
  $('#s-actualizar').addEventListener('click', () => { cargarEnvios().then(() => aviso('Lista actualizada.')); });

  /* ---------- Navegación ---------- */
  function ir(v) {
    if (!VISTAS.includes(v)) v = 'enviar';
    st.vista = v;
    $$('.vista').forEach((x) => { x.hidden = x.id !== 'vista-' + v; });
    $$('.admin-nav a').forEach((a) => a.classList.toggle('active', a.dataset.vista === v));
    const [eyebrow, h1, p, miga] = TEXTOS[v];
    $('#titulo-eyebrow').textContent = eyebrow; $('#titulo-h1').textContent = h1; $('#titulo-p').textContent = p; $('#migas').textContent = miga;
    $('#barra-lateral').classList.remove('open'); window.scrollTo({ top: 0 });
    if (v === 'seguimiento') cargarEnvios();
  }
  function reloj() {
    const f = new Date();
    $('#meta-fecha').textContent = f.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
    $('#meta-hora').textContent = f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  $('#toggle-menu').addEventListener('click', () => $('#barra-lateral').classList.toggle('open'));
  document.addEventListener('click', (e) => { if (!e.target.closest('#barra-lateral, #toggle-menu')) $('#barra-lateral').classList.remove('open'); });
  $('#btn-salir').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });
  window.addEventListener('hashchange', () => ir(location.hash.slice(1)));
  ['mesa:cambio', 'storage'].forEach((ev) => window.addEventListener(ev, () => { if (st.vista === 'seguimiento') cargarEnvios(); }));
  setInterval(() => { if (!document.hidden) cargarEnvios(); }, 6000);
  setInterval(reloj, 30000);

  /* ---------- Arranque ---------- */
  reloj(); pintarArchivos(); refrescar();
  ir(location.hash.slice(1)); cargarEnvios();
  if (!enServidor()) mensaje('Modo local: el documento llegará a la bandeja de la Secretaría solo si ella abre el sistema en este mismo navegador. Para enviarlo a otros equipos, inicie el servidor (npm start → http://localhost:3001).', 'info');
})();
