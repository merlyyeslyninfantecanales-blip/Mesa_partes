/* Panel de Secretaría · Mesa de Partes
   Funciones: recepción del portal, registro de documentos, derivación a áreas, cambio de estado, detalle con historial,
   adjuntos, cargo de recepción, notificación por correo, archivo, reportes y configuración.
   Los datos viven en MesaDatos (js/mesa-datos.js). */
(() => {
  'use strict';
  const D = window.MesaDatos;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = D.escapar;
  const iconos = (raiz) => window.actualizarIconos?.(raiz || document);
  const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const ESTADO_CLASE = { 'Pendiente': 'pending', 'Asignado': 'assigned', 'En revisión': 'review', 'Observado': 'observed', 'Atendido': 'done', 'Archivado': 'archived' };
  const PRIORIDAD_CLASE = { Alta: 'high', Media: 'medium', Baja: 'low' };
  const PRIORIDAD_VALOR = { Alta: 3, Media: 2, Baja: 1 };
  const iconoArea = (area = '') => (area.includes('Académica') && area.includes('Secretar') ? 'graduation-cap' : area.includes('Coordinación') ? 'network' : area.includes('Dirección') ? 'landmark' : 'briefcase');
  const claseEstado = (e) => ESTADO_CLASE[e] || 'pending';
  const badgeEstado = (e) => `<span class="status ${claseEstado(e)}">${esc(e)}</span>`;
  const badgePrioridad = (p) => `<span class="priority ${PRIORIDAD_CLASE[p] || 'medium'}"><i></i>${esc(p || 'Media')}</span>`;

  /* ================= Utilidades de interfaz ================= */
  function aviso(texto, tipo = 'ok') {
    const t = document.createElement('div'); t.className = `toast ${tipo}`; t.setAttribute('role', 'status'); t.textContent = texto;
    const caja = $('#toasts'); while (caja.children.length >= 3) caja.firstChild.remove();
    caja.append(t); setTimeout(() => t.classList.add('salir'), 3800); setTimeout(() => t.remove(), 4300);
  }
  function abrirDlg(dlg) { if (!dlg.open) dlg.showModal(); iconos(dlg); }
  $$('dialog').forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }));
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-cerrar]'); if (b) b.closest('dialog')?.close(); });

  function confirmar({ titulo, texto, ok = 'Confirmar', peligro = false }) {
    return new Promise((resolver) => {
      const dlg = $('#dlg-confirmar'); const form = $('#form-confirmar'); let aceptado = false;
      $('#confirmar-titulo').textContent = titulo; $('#confirmar-texto').textContent = texto;
      const btn = $('#confirmar-ok'); btn.textContent = ok; btn.classList.toggle('peligro', peligro);
      const alEnviar = (e) => { e.preventDefault(); aceptado = true; dlg.close(); };
      const alCerrar = () => { form.removeEventListener('submit', alEnviar); dlg.removeEventListener('close', alCerrar); resolver(aceptado); };
      form.addEventListener('submit', alEnviar); dlg.addEventListener('close', alCerrar); abrirDlg(dlg);
    });
  }
  function preguntarTexto({ titulo, info = '', etiqueta, placeholder = '', requerido = true, ok = 'Aceptar', tipo = 'textarea' }) {
    return new Promise((resolver) => {
      const dlg = $('#dlg-texto'); const form = $('#form-texto'); const campo = $('#texto-campo'); let valor = null;
      $('#texto-titulo').textContent = titulo; $('#texto-info').textContent = info; $('#texto-label').textContent = etiqueta;
      campo.placeholder = placeholder; campo.value = ''; campo.rows = tipo === 'linea' ? 1 : 4; $('#texto-error').hidden = true; $('#texto-ok').textContent = ok;
      const alEnviar = (e) => {
        e.preventDefault(); const texto = campo.value.trim();
        if (requerido && !texto) { const er = $('#texto-error'); er.textContent = 'Este campo es obligatorio.'; er.hidden = false; campo.focus(); return; }
        valor = texto; dlg.close();
      };
      const alCerrar = () => { form.removeEventListener('submit', alEnviar); dlg.removeEventListener('close', alCerrar); resolver(valor); };
      form.addEventListener('submit', alEnviar); dlg.addEventListener('close', alCerrar); abrirDlg(dlg); campo.focus();
    });
  }

  function descargarTexto(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function csv(lista) {
    const cab = ['Expediente', 'Fecha de ingreso', 'Remitente', 'DNI/RUC', 'Tipo', 'N.º documento', 'Asunto', 'Folios', 'Canal', 'Área', 'Prioridad', 'Estado', 'Correo', 'Teléfono'];
    const filas = lista.map((d) => [d.codigo, D.fmtFechaLarga(d.fecha), d.remitente, d.dni, d.tipo, d.numeroDocumento, d.asunto, d.folios, d.canal, d.area, d.prioridad, d.estado, d.correo, d.telefono]);
    return '﻿' + [cab, ...filas].map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  }
  function exportarCSV(lista, nombre = 'expedientes') {
    if (!lista.length) { aviso('No hay expedientes para exportar con los filtros actuales.', 'warn'); return; }
    const f = new Date(); const sello = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}`;
    descargarTexto(`${nombre}-${sello}.csv`, csv(lista), 'text/csv;charset=utf-8'); aviso(`Se exportaron ${lista.length} expediente(s) a CSV.`);
  }

  async function abrirAdjunto(id, descargar = false) {
    const ventana = descargar ? null : window.open('about:blank', '_blank');
    try {
      const reg = await D.obtenerArchivo(id);
      if (!reg) { ventana?.close(); aviso('El archivo ya no está disponible en este navegador.', 'error'); return; }
      mostrarBlob(reg.blob, reg.nombre, ventana);
    } catch { ventana?.close(); aviso('No se pudo abrir el archivo.', 'error'); }
  }
  function mostrarBlob(blob, nombre, ventana) {
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.append(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  /* ================= Acciones sobre expedientes ================= */
  let derivarCb = null; let derivarCodigos = [];
  function abrirDerivar(codigos, opciones = {}) {
    const lista = codigos.map(D.obtener).filter(Boolean); const unico = lista.length === 1 ? lista[0] : null;
    derivarCodigos = codigos; derivarCb = opciones.onConfirmar || (async (datos) => {
      tablasLimpiarSeleccion(); D.derivar(codigos, datos);
      aviso(codigos.length > 1 ? `${codigos.length} expedientes derivados a ${datos.area}.` : `${codigos[0]} derivado a ${datos.area}.`);
    });
    $('#derivar-titulo').textContent = opciones.titulo || (lista.length > 1 ? `Derivar ${lista.length} expedientes` : 'Derivar expediente');
    $('#derivar-info').textContent = opciones.info || (unico ? `${unico.codigo} · ${unico.remitente} — ${unico.asunto}. Área actual: ${unico.area || 'Sin asignar'}.` : `${lista.length} expedientes seleccionados.`);
    const sel = $('#derivar-area'); sel.innerHTML = `<option value="" selected disabled>Seleccionar área de destino</option>${D.AREAS.map((a) => `<option>${esc(a)}</option>`).join('')}`;
    sel.value = opciones.area || '';
    const prio = unico?.prioridad || opciones.prioridad || 'Media'; $$('input[name="dprio"]').forEach((r) => { r.checked = r.value === prio; });
    $('#derivar-plazo').value = opciones.plazo ?? 3; $('#derivar-indic').value = opciones.indicaciones || ''; $('#derivar-error').hidden = true;
    $('#derivar-ok span').textContent = opciones.boton || 'Enviar documento'; $('#derivar-ok').disabled = false;
    abrirDlg($('#dlg-derivar'));
  }
  $('#form-derivar').addEventListener('submit', async (e) => {
    e.preventDefault(); const er = $('#derivar-error'); const area = $('#derivar-area').value;
    if (!area) { er.textContent = 'Selecciona el área de destino.'; er.hidden = false; $('#derivar-area').focus(); return; }
    const datos = { area, prioridad: $('input[name="dprio"]:checked')?.value || 'Media', plazoDias: Number($('#derivar-plazo').value) || 0, indicaciones: $('#derivar-indic').value.trim() };
    const ok = $('#derivar-ok'); ok.disabled = true;
    try { await derivarCb(datos); $('#dlg-derivar').close(); }
    catch (error) { er.textContent = 'No se pudo completar la operación. Inténtalo nuevamente.'; er.hidden = false; console.error(error); ok.disabled = false; }
  });

  let estadoCodigos = [];
  function abrirEstado(codigos) {
    estadoCodigos = codigos; const lista = codigos.map(D.obtener).filter(Boolean); const unico = lista.length === 1 ? lista[0] : null;
    $('#estado-info').textContent = unico ? `${unico.codigo} · Estado actual: ${unico.estado}.` : `${lista.length} expedientes seleccionados.`;
    const sel = $('#estado-nuevo'); sel.innerHTML = D.ESTADOS.map((s) => `<option>${esc(s)}</option>`).join(''); sel.value = unico ? ({ 'Pendiente': 'En revisión', 'Asignado': 'En revisión', 'En revisión': 'Atendido', 'Observado': 'En revisión', 'Atendido': 'Atendido', 'Archivado': 'Atendido' }[unico.estado] || 'En revisión') : 'En revisión';
    $('#estado-coment').value = ''; $('#estado-error').hidden = true; actualizarEtiquetaEstado(); abrirDlg($('#dlg-estado'));
  }
  const actualizarEtiquetaEstado = () => { $('#estado-coment-label').textContent = $('#estado-nuevo').value === 'Observado' ? 'Motivo de la observación *' : 'Comentario'; };
  $('#estado-nuevo').addEventListener('change', actualizarEtiquetaEstado);
  $('#form-estado').addEventListener('submit', (e) => {
    e.preventDefault(); const estado = $('#estado-nuevo').value; const coment = $('#estado-coment').value.trim(); const er = $('#estado-error');
    if (estado === 'Observado' && !coment) { er.textContent = 'Indica el motivo de la observación.'; er.hidden = false; $('#estado-coment').focus(); return; }
    tablasLimpiarSeleccion(); D.cambiarEstado(estadoCodigos, estado, coment); $('#dlg-estado').close();
    aviso(estadoCodigos.length > 1 ? `Estado actualizado en ${estadoCodigos.length} expedientes.` : `${estadoCodigos[0]} ahora está «${estado}».`);
  });

  async function archivarConfirmando(codigos) {
    const ok = await confirmar({ titulo: 'Archivar expediente(s)', texto: codigos.length > 1 ? `Se enviarán ${codigos.length} expedientes al archivo. Podrás restaurarlos cuando lo necesites.` : `El expediente ${codigos[0]} se enviará al archivo. Podrás restaurarlo cuando lo necesites.`, ok: 'Archivar' });
    if (!ok) return; tablasLimpiarSeleccion(); D.archivar(codigos); aviso(codigos.length > 1 ? `${codigos.length} expedientes archivados.` : `${codigos[0]} archivado.`);
  }

  async function enviarCorreo(codigo) {
    let exp = D.obtener(codigo); if (!exp) return;
    if (!exp.correo) {
      const correo = await preguntarTexto({ titulo: 'Correo del remitente', info: `${exp.remitente} no tiene correo registrado.`, etiqueta: 'Correo electrónico *', placeholder: 'correo@ejemplo.com', ok: 'Guardar y continuar', tipo: 'linea' });
      if (!correo) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { aviso('El correo ingresado no es válido.', 'error'); return; }
      D.actualizar(codigo, { correo }, `Se registró el correo del remitente: ${correo}.`); exp = D.obtener(codigo);
    }
    const cfg = D.config();
    const asunto = `Mesa de Partes IESTP CMVO · Expediente ${exp.codigo}`;
    const cuerpo = `Estimado(a) ${exp.remitente}:\n\nSu documento «${exp.asunto}» fue recibido con el N.º de expediente ${exp.codigo} y se encuentra en estado ${exp.estado}${exp.area ? ` (área: ${exp.area})` : ''}.\n\nPuede consultar el avance de su trámite en la Mesa de Partes Digital con ese número.\n\nAtentamente,\n${cfg.responsable}\nI.E.S.T.P. Contralmirante Manuel Villar Olivera`;
    D.agregarNota(codigo, `Se preparó un correo de notificación para ${exp.correo}.`);
    window.location.href = `mailto:${exp.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    aviso('Se abrió tu programa de correo con el mensaje listo para enviar.');
  }

  function imprimirCargo(codigo) {
    const exp = D.obtener(codigo); if (!exp) return; const cfg = D.config();
    const logo = new URL('../img/logo-villar-transparente.png', window.location.href).href;
    const fila = (k, v) => `<tr><th>${esc(k)}</th><td>${esc(v || '—')}</td></tr>`;
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cargo ${esc(exp.codigo)}</title><style>
      @page{size:A4;margin:18mm} body{font-family:Arial,Helvetica,sans-serif;color:#1d2b33;margin:0}
      header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #246b8a;padding-bottom:12px} header img{width:70px;height:70px;object-fit:contain}
      h1{font-size:15px;margin:0;color:#246b8a;letter-spacing:.03em} header p{margin:3px 0 0;font-size:11px;color:#55636b}
      h2{text-align:center;font-size:17px;margin:22px 0 4px} .cod{text-align:center;font-size:24px;font-weight:700;color:#246b8a;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:13px} th{width:34%;text-align:left;background:#f2faff;color:#246b8a} th,td{border:1px solid #cfe3ee;padding:8px 10px;vertical-align:top}
      .firmas{display:flex;justify-content:space-around;margin-top:90px;font-size:12px;text-align:center} .firmas div{width:40%;border-top:1px solid #333;padding-top:6px}
      footer{margin-top:40px;font-size:11px;color:#667780;text-align:center}
    </style></head><body>
      <header><img src="${logo}" alt=""><div><h1>I.E.S.T.P. «CONTRALMIRANTE MANUEL VILLAR OLIVERA»</h1><p>Mesa de Partes · Zorritos, Tumbes</p></div></header>
      <h2>CARGO DE RECEPCIÓN DE DOCUMENTO</h2><div class="cod">${esc(exp.codigo)}</div>
      <table>${fila('Fecha y hora de recepción', D.fmtFechaLarga(exp.fecha))}${fila('Remitente', exp.remitente)}${fila('DNI / RUC', exp.dni)}${fila('Tipo de documento', exp.tipo)}${fila('N.º del documento', exp.numeroDocumento)}${fila('Asunto', exp.asunto)}${fila('Folios', exp.folios)}${fila('Canal de ingreso', exp.canal)}${fila('Área asignada', exp.area || 'Por asignar')}${fila('Estado', exp.estado)}${fila('Archivos adjuntos', (exp.adjuntos || []).map((a) => a.nombre).join(', ') || 'Ninguno')}</table>
      <div class="firmas"><div>Recibido por<br>${esc(cfg.responsable)}</div><div>Firma del interesado</div></div>
      <footer>Conserve este cargo. Puede consultar su trámite con el número de expediente en la Mesa de Partes Digital.</footer>
    </body></html>`;
    const marco = document.createElement('iframe'); marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.append(marco);
    marco.srcdoc = html;
    marco.onload = () => { setTimeout(() => { marco.contentWindow.focus(); marco.contentWindow.print(); setTimeout(() => marco.remove(), 2000); }, 250); };
    D.agregarNota(codigo, 'Se generó el cargo de recepción para impresión.');
  }

  function ejecutarAccion(accion, codigos) {
    const uno = codigos[0];
    switch (accion) {
      case 'ver': return abrirDetalle(uno);
      case 'derivar': return abrirDerivar(codigos);
      case 'estado': return abrirEstado(codigos);
      case 'atender': D.cambiarEstado(codigos, 'Atendido', 'Atendido por Secretaría.'); aviso(`${uno} marcado como atendido.`); return;
      case 'archivar': return archivarConfirmando(codigos);
      case 'restaurar': tablasLimpiarSeleccion(); D.restaurar(codigos); aviso(codigos.length > 1 ? `${codigos.length} expedientes restaurados.` : `${uno} restaurado del archivo.`); return;
      case 'cargo': return imprimirCargo(uno);
      case 'correo': return enviarCorreo(uno);
      default: return undefined;
    }
  }
  const accionPrincipal = (e) => ({
    'Pendiente': { acc: 'derivar', txt: 'Derivar', ico: 'send' }, 'Observado': { acc: 'derivar', txt: 'Derivar', ico: 'send' },
    'Asignado': { acc: 'atender', txt: 'Atender', ico: 'check' }, 'En revisión': { acc: 'atender', txt: 'Atender', ico: 'check' },
    'Atendido': { acc: 'archivar', txt: 'Archivar', ico: 'archive' }, 'Archivado': { acc: 'restaurar', txt: 'Restaurar', ico: 'rotate-ccw' }
  }[e.estado]);

  /* ================= Menú contextual de fila ================= */
  const menuFila = $('#menu-fila'); let menuAbiertoEn = 0;
  function abrirMenuFila(boton, codigo) {
    const exp = D.obtener(codigo); if (!exp) return; const archivado = exp.estado === 'Archivado';
    const it = (acc, ico, txt, extra = '') => `<button type="button" role="menuitem" data-m="${acc}" class="${extra}"><i data-lucide="${ico}"></i>${txt}</button>`;
    menuFila.innerHTML = it('ver', 'eye', 'Ver detalle') + (archivado ? '' : it('derivar', 'send', 'Derivar a un área') + it('estado', 'flag', 'Cambiar estado')) + it('cargo', 'printer', 'Imprimir cargo') + it('correo', 'mail', 'Enviar correo al remitente') + (archivado ? it('restaurar', 'rotate-ccw', 'Restaurar del archivo') : it('archivar', 'archive', 'Archivar'));
    menuFila.dataset.codigo = codigo; menuFila.hidden = false; menuAbiertoEn = Date.now(); iconos(menuFila);
    const r = boton.getBoundingClientRect(); const ancho = menuFila.offsetWidth; const alto = menuFila.offsetHeight;
    menuFila.style.left = `${Math.max(8, Math.min(window.innerWidth - ancho - 8, r.right - ancho))}px`;
    menuFila.style.top = `${r.bottom + alto + 8 > window.innerHeight ? Math.max(8, r.top - alto - 4) : r.bottom + 4}px`;
  }
  menuFila.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; const codigo = menuFila.dataset.codigo; menuFila.hidden = true; ejecutarAccion(b.dataset.m, [codigo]); });

  /* ================= Tabla de expedientes (bandeja, asignados, archivo) ================= */
  const COLUMNAS_CLAVE = 'mesaPartes.columnasOcultas';
  const leerColumnas = () => { try { return JSON.parse(localStorage.getItem(COLUMNAS_CLAVE)) || []; } catch { return []; } };
  const tablas = {};

  function crearTabla(contenedor, cfg) {
    const raiz = $('#tpl-tabla').content.firstElementChild.cloneNode(true); contenedor.append(raiz);
    const q = (s) => $(s, raiz);
    const st = { pagina: 1, porPagina: 8, orden: { campo: 'fecha', dir: 'desc' }, sel: new Set(), q: '', estado: '', area: '', prioridad: '', canal: '', desde: '', hasta: '' };
    q('[data-t="titulo"]').textContent = cfg.titulo; q('[data-t="desc"]').textContent = cfg.desc;
    const llenar = (campo, primera, valores) => { q(`[data-f="${campo}"]`).innerHTML = `<option value="">${primera}</option>${valores.map((v) => `<option>${esc(v)}</option>`).join('')}`; };
    llenar('estado', 'Todos los estados', cfg.estados || []); llenar('area', 'Todas las áreas', D.AREAS); llenar('prioridad', 'Todas', D.PRIORIDADES); llenar('canal', 'Todos', D.CANALES);
    if (cfg.sinEstado) q('[data-f="estado"]').hidden = true;
    const ocultas = leerColumnas();
    ['area', 'prio', 'estado', 'ingreso'].forEach((c) => { const oculta = ocultas.includes(c); raiz.classList.toggle(`ocultar-${c}`, oculta); q(`[data-col="${c}"]`).checked = !oculta; });

    const base = () => D.listar().filter(cfg.base);
    function filtrados() {
      let lista = base(); const txt = st.q.trim().toLowerCase();
      if (txt) lista = lista.filter((d) => [d.codigo, d.remitente, d.asunto, d.tipo, d.area, d.canal, d.dni, d.numeroDocumento, d.estado].join(' ').toLowerCase().includes(txt));
      ['estado', 'area', 'prioridad', 'canal'].forEach((c) => { if (st[c]) lista = lista.filter((d) => d[c] === st[c]); });
      if (st.desde) lista = lista.filter((d) => new Date(d.fecha) >= new Date(`${st.desde}T00:00:00`));
      if (st.hasta) lista = lista.filter((d) => new Date(d.fecha) <= new Date(`${st.hasta}T23:59:59`));
      const { campo, dir } = st.orden; const signo = dir === 'asc' ? 1 : -1;
      return lista.sort((a, b) => {
        if (campo === 'prioridad') return signo * ((PRIORIDAD_VALOR[a.prioridad] || 0) - (PRIORIDAD_VALOR[b.prioridad] || 0)) || new Date(b.fecha) - new Date(a.fecha);
        if (campo === 'codigo') return signo * a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
        return signo * (new Date(a.fecha) - new Date(b.fecha));
      });
    }
    const filaHTML = (d) => {
      const p = accionPrincipal(d); const adj = (d.adjuntos || []).length;
      return `<tr data-codigo="${esc(d.codigo)}" class="${st.sel.has(d.codigo) ? 'seleccionada' : ''}">
        <td><input type="checkbox" data-sel aria-label="Seleccionar expediente ${esc(d.codigo)}" ${st.sel.has(d.codigo) ? 'checked' : ''}></td>
        <td><button type="button" class="enlace-exp" data-ver>${esc(d.codigo)}</button><small>${esc(d.canal || 'Registro interno')}${adj ? ` · <i class="clip" data-lucide="paperclip"></i>${adj}` : ''}</small></td>
        <td><strong>${esc(d.remitente)}</strong><small>${esc(d.tipo)} · ${esc(d.asunto || 'Sin asunto')}</small></td>
        <td class="c-area">${d.area ? `<span class="department"><i data-lucide="${iconoArea(d.area)}"></i>${esc(d.area)}</span>` : '<span class="sin-area">Sin asignar</span>'}</td>
        <td class="c-prio">${badgePrioridad(d.prioridad)}</td>
        <td class="c-estado">${badgeEstado(d.estado)}</td>
        <td class="c-ingreso"><strong>${esc(D.fmtFecha(d.fecha))}</strong><small>${esc(D.fmtRelativo(d.fecha))}</small></td>
        <td class="td-acciones"><div class="acciones-fila"><button type="button" class="btn-fila" data-accion="${p.acc}" title="${p.txt}"><i data-lucide="${p.ico}"></i><span>${p.txt}</span></button><button type="button" class="row-action" data-menu aria-label="Más acciones para ${esc(d.codigo)}" aria-haspopup="menu"><i data-lucide="ellipsis"></i></button></div></td></tr>`;
    };
    function listaPaginas(total, actual) {
      if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
      const set = new Set([1, total, actual - 1, actual, actual + 1].filter((n) => n >= 1 && n <= total)); const orden = [...set].sort((a, b) => a - b); const res = [];
      orden.forEach((n, i) => { if (i && n - orden[i - 1] > 1) res.push('…'); res.push(n); }); return res;
    }
    function render() {
      const todos = filtrados(); const total = todos.length; const paginas = Math.max(1, Math.ceil(total / st.porPagina)); st.pagina = Math.min(st.pagina, paginas);
      const ini = (st.pagina - 1) * st.porPagina; const visibles = todos.slice(ini, ini + st.porPagina);
      const vigentes = new Set(base().map((d) => d.codigo)); [...st.sel].forEach((c) => { if (!vigentes.has(c)) st.sel.delete(c); });
      q('[data-t="cuerpo"]').innerHTML = visibles.length ? visibles.map(filaHTML).join('') : `<tr class="vacio"><td colspan="8"><i data-lucide="inbox"></i><span>${base().length ? 'Ningún expediente coincide con los filtros.' : cfg.vacio}</span></td></tr>`;
      q('[data-t="info"]').innerHTML = total ? `Mostrando <strong>${ini + 1}–${ini + visibles.length}</strong> de <strong>${total}</strong> documentos` : 'Sin resultados';
      q('[data-t="paginas"]').innerHTML = `<button type="button" data-pag="${st.pagina - 1}" ${st.pagina === 1 ? 'disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>${listaPaginas(paginas, st.pagina).map((n) => (n === '…' ? '<span>…</span>' : `<button type="button" data-pag="${n}" class="${n === st.pagina ? 'page-active' : ''}" ${n === st.pagina ? 'aria-current="page"' : ''}>${n}</button>`)).join('')}<button type="button" data-pag="${st.pagina + 1}" ${st.pagina === paginas ? 'disabled' : ''} aria-label="Página siguiente"><i data-lucide="chevron-right"></i></button>`;
      const todosSel = visibles.length > 0 && visibles.every((d) => st.sel.has(d.codigo)); const alguno = visibles.some((d) => st.sel.has(d.codigo));
      const cab = q('[data-a="sel-todos"]'); cab.checked = todosSel; cab.indeterminate = alguno && !todosSel;
      const n = st.sel.size; q('[data-t="bulk"]').hidden = n === 0; q('[data-t="bulk-n"]').textContent = n;
      q('[data-t="bulk-botones"]').innerHTML = cfg.vista === 'archivo'
        ? `<button type="button" data-b="restaurar"><i data-lucide="rotate-ccw"></i>Restaurar</button><button type="button" data-b="exportar"><i data-lucide="download"></i>Exportar selección</button><button type="button" data-b="limpiar">Quitar selección</button>`
        : `<button type="button" data-b="derivar"><i data-lucide="send"></i>Derivar</button><button type="button" data-b="estado"><i data-lucide="flag"></i>Cambiar estado</button><button type="button" data-b="archivar"><i data-lucide="archive"></i>Archivar</button><button type="button" data-b="exportar"><i data-lucide="download"></i>Exportar selección</button><button type="button" data-b="limpiar">Quitar selección</button>`;
      $$('[data-orden]', raiz).forEach((b) => { const activo = st.orden.campo === b.dataset.orden; b.closest('th').setAttribute('aria-sort', activo ? (st.orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'); b.classList.toggle('activo', activo); });
      iconos(raiz);
    }

    raiz.addEventListener('click', (e) => {
      const t = e.target;
      const pag = t.closest('[data-pag]'); if (pag && !pag.disabled) { st.pagina = Number(pag.dataset.pag); render(); return; }
      const ord = t.closest('[data-orden]'); if (ord) { const c = ord.dataset.orden; st.orden = st.orden.campo === c ? { campo: c, dir: st.orden.dir === 'asc' ? 'desc' : 'asc' } : { campo: c, dir: c === 'codigo' ? 'asc' : 'desc' }; render(); return; }
      const acc = t.closest('[data-a]');
      if (acc) {
        const a = acc.dataset.a;
        if (a === 'exportar') exportarCSV(filtrados(), cfg.vista === 'archivo' ? 'archivo' : 'expedientes');
        if (a === 'columnas') { const p = q('[data-p="columnas"]'); const abrir = p.hidden; cerrarPopovers(); p.hidden = !abrir; acc.setAttribute('aria-expanded', String(abrir)); }
        if (a === 'mas-filtros') { const x = q('[data-t="extra"]'); x.hidden = !x.hidden; acc.setAttribute('aria-expanded', String(!x.hidden)); acc.classList.toggle('activo', !x.hidden); }
        if (a === 'limpiar-filtros') { ['q', 'estado', 'area', 'prioridad', 'canal', 'desde', 'hasta'].forEach((c) => { st[c] = ''; q(`[data-f="${c}"]`).value = ''; }); st.pagina = 1; render(); }
        return;
      }
      const b = t.closest('[data-b]');
      if (b) {
        const codigos = [...st.sel]; const k = b.dataset.b;
        if (k === 'limpiar') { st.sel.clear(); render(); } else if (k === 'exportar') exportarCSV(D.listar().filter((d) => st.sel.has(d.codigo)), 'seleccion'); else ejecutarAccion(k, codigos);
        return;
      }
      const fila = t.closest('tr[data-codigo]'); if (!fila) return; const codigo = fila.dataset.codigo;
      if (t.closest('[data-ver]')) { abrirDetalle(codigo); return; }
      const ac = t.closest('[data-accion]'); if (ac) { ejecutarAccion(ac.dataset.accion, [codigo]); return; }
      const mn = t.closest('[data-menu]'); if (mn) { e.stopPropagation(); const mismo = !menuFila.hidden && menuFila.dataset.codigo === codigo; cerrarPopovers(); if (!mismo) abrirMenuFila(mn, codigo); }
    });
    raiz.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-sel]')) { const c = t.closest('tr').dataset.codigo; if (t.checked) st.sel.add(c); else st.sel.delete(c); render(); return; }
      if (t.matches('[data-a="sel-todos"]')) { $$('tbody tr[data-codigo]', raiz).forEach((tr) => { if (t.checked) st.sel.add(tr.dataset.codigo); else st.sel.delete(tr.dataset.codigo); }); render(); return; }
      if (t.matches('[data-col]')) {
        const oculta = !t.checked; const actuales = new Set(leerColumnas()); if (oculta) actuales.add(t.dataset.col); else actuales.delete(t.dataset.col);
        localStorage.setItem(COLUMNAS_CLAVE, JSON.stringify([...actuales])); Object.values(tablas).forEach((tb) => tb.aplicarColumnas()); return;
      }
      // Si el valor no cambió (p. ej. el buscador ya se aplicó con «input»), no se vuelve a dibujar: evita perder el clic en un botón de fila.
      if (t.matches('[data-f]') && st[t.dataset.f] !== t.value) { st[t.dataset.f] = t.value; st.pagina = 1; render(); }
    });
    raiz.addEventListener('input', (e) => { if (e.target.matches('[data-f="q"]')) { st.q = e.target.value; st.pagina = 1; render(); } });

    return {
      render, st, raiz, total: () => base().length, filtrados,
      limpiarSeleccion: () => { st.sel.clear(); },
      aplicarColumnas: () => { const oc = leerColumnas(); ['area', 'prio', 'estado', 'ingreso'].forEach((c) => { raiz.classList.toggle(`ocultar-${c}`, oc.includes(c)); q(`[data-col="${c}"]`).checked = !oc.includes(c); }); },
      enfocarBusqueda: () => { q('[data-f="q"]').focus(); }
    };
  }
  const tablasLimpiarSeleccion = () => Object.values(tablas).forEach((t) => t.limpiarSeleccion());

  tablas.bandeja = crearTabla($('#contenedor-bandeja'), { vista: 'bandeja', titulo: 'Documentos entrantes recientes', desc: 'Últimos expedientes recibidos por todos los canales.', base: (d) => d.estado !== 'Archivado', estados: ['Pendiente', 'Asignado', 'En revisión', 'Observado', 'Atendido'], vacio: 'Aún no hay expedientes registrados.' });
  tablas.asignados = crearTabla($('#contenedor-asignados'), { vista: 'asignados', titulo: 'Expedientes a cargo de mi área', desc: 'Pendientes de atención en tu dependencia.', base: (d) => d.area === D.config().area && !['Atendido', 'Archivado'].includes(d.estado), estados: ['Pendiente', 'Asignado', 'En revisión', 'Observado'], vacio: 'No tienes expedientes pendientes. ¡Buen trabajo!' });
  tablas.archivo = crearTabla($('#contenedor-archivo'), { vista: 'archivo', titulo: 'Expedientes archivados', desc: 'Historial documental concluido. Puedes restaurarlos si es necesario.', base: (d) => d.estado === 'Archivado', sinEstado: true, vacio: 'El archivo está vacío.' });

  /* ================= Menús emergentes ================= */
  function cerrarPopovers() {
    menuFila.hidden = true; $('#panel-notif').hidden = true; $('#btn-notif').setAttribute('aria-expanded', 'false');
    $$('[data-p="columnas"]').forEach((p) => { p.hidden = true; }); $$('[data-a="columnas"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.popover, .notification, [data-a="columnas"], [data-menu]')) cerrarPopovers(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarPopovers(); if ($('#detalle').classList.contains('abierto')) cerrarDetalle(); } });
  window.addEventListener('scroll', () => { if (Date.now() - menuAbiertoEn > 400) menuFila.hidden = true; }, true);
  window.addEventListener('resize', () => { menuFila.hidden = true; });

  /* ================= Detalle del expediente ================= */
  let detalleCodigo = null; const detalle = $('#detalle'); const velo = $('#velo');
  function abrirDetalle(codigo) { detalleCodigo = codigo; renderDetalle(); detalle.classList.add('abierto'); detalle.setAttribute('aria-hidden', 'false'); velo.hidden = false; detalle.focus(); }
  function cerrarDetalle() { detalleCodigo = null; detalle.classList.remove('abierto'); detalle.setAttribute('aria-hidden', 'true'); velo.hidden = true; }
  velo.addEventListener('click', cerrarDetalle);

  function renderDetalle() {
    const exp = detalleCodigo && D.obtener(detalleCodigo); if (!exp) { if (detalleCodigo) cerrarDetalle(); return; }
    const arch = exp.estado === 'Archivado'; const dato = (k, v) => `<div><dt>${esc(k)}</dt><dd>${esc(v || '—')}</dd></div>`;
    const adj = exp.adjuntos || [];
    const mov = [...(exp.movimientos || [])].reverse();
    const btn = (k, ico, txt, cls = '') => `<button type="button" class="${cls}" data-d="${k}"><i data-lucide="${ico}"></i>${txt}</button>`;
    $('#detalle-contenido').innerHTML = `
      <header class="drawer-cab"><div><small>Expediente</small><h2>${esc(exp.codigo)}</h2><div class="drawer-badges">${badgeEstado(exp.estado)}${badgePrioridad(exp.prioridad)}</div></div><button type="button" class="cerrar-dlg" data-d="cerrar" aria-label="Cerrar detalle"><i data-lucide="x"></i></button></header>
      <div class="drawer-acciones">${arch ? btn('restaurar', 'rotate-ccw', 'Restaurar', 'primario') : btn('derivar', 'send', 'Derivar', 'primario') + btn('estado', 'flag', 'Estado')}${btn('cargo', 'printer', 'Cargo')}${btn('correo', 'mail', 'Correo')}${arch ? '' : btn('archivar', 'archive', 'Archivar')}</div>
      <div class="drawer-cuerpo">
        <section><h4>Datos del documento</h4><dl class="datos-grid">${dato('Remitente', exp.remitente)}${dato('DNI / RUC', exp.dni)}${dato('Correo', exp.correo)}${dato('Teléfono', exp.telefono)}${dato('Tipo', exp.tipo)}${dato('N.º del documento', exp.numeroDocumento)}${dato('Folios', exp.folios)}${dato('Canal', exp.canal)}${dato('Área actual', exp.area || 'Sin asignar')}${dato('Ingreso', D.fmtFechaLarga(exp.fecha))}${exp.plazo ? dato('Plazo de atención', D.fmtFechaLarga(exp.plazo).slice(0, 10)) : ''}${exp.portalCodigo ? dato('Registro del portal', exp.portalCodigo) : ''}</dl></section>
        <section><h4>Asunto</h4><p class="asunto">${esc(exp.asunto || '—')}</p>${exp.notas ? `<p class="notas-int"><strong>Notas internas:</strong> ${esc(exp.notas)}</p>` : ''}</section>
        <section><h4>Adjuntos (${adj.length})</h4>
          ${adj.length ? `<ul class="lista-adjuntos">${adj.map((a) => `<li><i data-lucide="file-text"></i><div><strong>${esc(a.nombre)}</strong><small>${esc(D.fmtTam(a.tam))}</small></div><button type="button" data-d="ver-adj" data-id="${esc(a.id)}" aria-label="Ver ${esc(a.nombre)}"><i data-lucide="eye"></i></button><button type="button" data-d="desc-adj" data-id="${esc(a.id)}" aria-label="Descargar ${esc(a.nombre)}"><i data-lucide="download"></i></button></li>`).join('')}</ul>` : '<p class="vacio-sec">Este expediente no tiene archivos adjuntos.</p>'}
          <button type="button" class="button-secondary" data-d="adjuntar"><i data-lucide="paperclip"></i>Adjuntar archivo</button></section>
        <section><h4>Historial de movimientos</h4><ol class="timeline">${mov.map((m) => `<li><span class="punto"></span><div><strong>${esc(m.accion)}</strong><p>${esc(m.detalle)}</p><small>${esc(D.fmtFechaLarga(m.fecha))} · ${esc(m.responsable || '')}</small></div></li>`).join('')}</ol></section>
        <section><h4>Agregar nota al historial</h4><textarea id="nota-detalle" rows="2" placeholder="Escribe una observación o seguimiento..."></textarea><button type="button" class="button-primary" data-d="nota"><i data-lucide="save"></i>Guardar nota</button></section>
      </div>`;
    iconos($('#detalle-contenido'));
  }
  detalle.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-d]'); if (!b || !detalleCodigo) return; const k = b.dataset.d; const codigo = detalleCodigo;
    if (k === 'cerrar') return cerrarDetalle();
    if (k === 'ver-adj') return abrirAdjunto(b.dataset.id, false);
    if (k === 'desc-adj') return abrirAdjunto(b.dataset.id, true);
    if (k === 'adjuntar') return $('#adjuntar-detalle').click();
    if (k === 'nota') { const campo = $('#nota-detalle'); const texto = campo.value.trim(); if (!texto) { aviso('Escribe la nota antes de guardarla.', 'warn'); campo.focus(); return; } D.agregarNota(codigo, texto); aviso('Nota agregada al historial.'); return; }
    return ejecutarAccion(k, [codigo]);
  });
  $('#adjuntar-detalle').addEventListener('change', async (e) => {
    const archivos = Array.from(e.target.files); e.target.value = ''; if (!archivos.length || !detalleCodigo) return;
    const error = validarArchivos(archivos); if (error) { aviso(error, 'error'); return; }
    try { const metas = []; for (const a of archivos) metas.push(await D.guardarArchivo(a)); D.agregarAdjuntos(detalleCodigo, metas); aviso(`${metas.length} archivo(s) adjuntado(s).`); }
    catch { aviso('No se pudo guardar el archivo. Verifica el espacio del navegador.', 'error'); }
  });
  function validarArchivos(archivos) {
    for (const a of archivos) {
      if (!/\.(pdf|doc|docx|jpg|jpeg)$/i.test(a.name)) return `«${a.name}» no es un formato permitido (PDF, Word o JPG).`;
      if (!a.size) return `«${a.name}» está vacío.`;
      if (a.size > 20 * 1024 * 1024) return `«${a.name}» supera los 20 MB.`;
    }
    return '';
  }

  /* ================= Solicitudes del portal ================= */
  let portal = [];
  async function cargarPortal() {
    try { portal = (await D.listarPortal()).filter((s) => s.estado === 'Pendiente de envío'); } catch { portal = []; }
    renderPortal(); renderBadges(); renderNotificaciones();
  }
  function renderPortal() {
    $('#portal-contador').textContent = portal.length;
    $('#tabla-portal').innerHTML = portal.length ? portal.map((s, i) => `<tr data-i="${i}">
      <td><strong>${esc(String(s.codigo).replace(/^(LOCAL-\d{4}-[0-9a-f]{6}).*$/i, '$1…'))}</strong><small>${esc(s.origen === 'Biblioteca' ? 'Biblioteca' : 'Portal web')}</small></td>
      <td><strong>${esc(s.remitente)}</strong><small>${s.origen === 'Biblioteca' ? 'Área interna · Biblioteca' : `DNI ${esc(s.dni || '—')} · ${esc(s.correo || 'sin correo')}`}</small></td>
      <td><strong>${esc(s.tipo || 'Solicitud')}</strong><small>${esc(s.asunto || 'Sin asunto')}</small></td>
      <td><span class="department"><i data-lucide="paperclip"></i>${1 + (s.anexos || []).length} archivo(s)</span></td>
      <td><strong>${esc(D.fmtFecha(s.fecha))}</strong><small>${esc(D.fmtRelativo(s.fecha))}</small></td>
      <td class="td-acciones"><div class="acciones-fila"><button type="button" class="btn-fila" data-p="ver"><i data-lucide="eye"></i><span>Revisar</span></button><button type="button" class="btn-fila primario" data-p="recibir"><i data-lucide="check"></i><span>Recibir</span></button><button type="button" class="btn-fila" data-p="observar"><i data-lucide="corner-up-left"></i><span>Observar</span></button></div></td></tr>`).join('')
      : '<tr class="vacio"><td colspan="6"><i data-lucide="inbox"></i><span>No hay solicitudes pendientes del portal. Cuando un usuario envíe un documento aparecerá aquí.</span></td></tr>';
    iconos($('#tabla-portal'));
  }
  function recibirSolicitud(s) {
    abrirDerivar([], {
      titulo: 'Recibir y asignar solicitud', boton: 'Recibir y asignar', info: `${s.remitente} — ${s.tipo || 'Solicitud'}: ${s.asunto || 'Sin asunto'}. Se creará el expediente y se asignará al área elegida.`,
      onConfirmar: async (datos) => {
        const exp = await D.recibirPortal(s, datos); await cargarPortal();
        aviso(`Expediente ${exp.codigo} creado y asignado a ${datos.area}.`); abrirDetalle(exp.codigo);
      }
    });
  }
  async function observarSolicitud(s) {
    const motivo = await preguntarTexto({ titulo: 'Observar solicitud', info: `${s.remitente} — ${s.asunto || 'Sin asunto'}`, etiqueta: 'Motivo de la observación *', placeholder: 'Ej. Falta adjuntar copia del DNI o el documento no es legible.', ok: 'Devolver con observación' });
    if (!motivo) return; await D.observarPortal(s.codigo, motivo); await cargarPortal(); aviso('Solicitud devuelta con observación. El usuario verá el estado «Observado».');
  }
  async function abrirArchivoPortal(f, ver) {
    const ventana = ver ? window.open('about:blank', '_blank') : null;
    try {
      const blob = f instanceof Blob ? f : (await D.obtenerArchivo(f.id)).blob;
      mostrarBlob(blob, f.name, ventana);
    } catch { ventana?.close(); aviso('No se pudo abrir el archivo.', 'error'); }
  }
  function verSolicitud(s) {
    const dato = (k, v) => `<div><dt>${esc(k)}</dt><dd>${esc(v || '—')}</dd></div>`;
    const archivos = [{ f: s.archivo, etiqueta: 'Documento principal' }, ...(s.anexos || []).map((f, i) => ({ f, etiqueta: `Anexo ${i + 1}` }))].filter((x) => x.f);
    $('#portal-detalle').innerHTML = `<header class="dlg-cab"><h3>Solicitud del portal</h3><button type="button" class="cerrar-dlg" data-cerrar aria-label="Cerrar"><i data-lucide="x"></i></button></header>
      <div class="dlg-cuerpo"><dl class="datos-grid">${dato('Solicitante', s.remitente)}${dato('DNI', s.dni)}${dato('Teléfono', s.telefono)}${dato('Correo', s.correo)}${dato('Tipo', s.tipo)}${dato('N.º del documento', s['numero-documento'])}${dato('Folios', s.folios)}${dato('Enviado', D.fmtFechaLarga(s.fecha))}</dl>
      <h4>Asunto</h4><p class="asunto">${esc(s.asunto || '—')}</p>
      <h4>Archivos recibidos</h4><ul class="lista-adjuntos">${archivos.map((x, i) => `<li><i data-lucide="file-text"></i><div><strong>${esc(x.f.name)}</strong><small>${esc(x.etiqueta)} · ${esc(D.fmtTam(x.f.size))}</small></div><button type="button" data-pf="ver" data-i="${i}" aria-label="Ver ${esc(x.f.name)}"><i data-lucide="eye"></i></button><button type="button" data-pf="desc" data-i="${i}" aria-label="Descargar ${esc(x.f.name)}"><i data-lucide="download"></i></button></li>`).join('')}</ul></div>
      <footer><button type="button" class="button-secondary" data-pf="observar"><i data-lucide="corner-up-left"></i>Observar</button><button type="button" class="button-primary" data-pf="recibir"><i data-lucide="check"></i>Recibir y asignar</button></footer>`;
    const dlg = $('#dlg-portal'); dlg.onclick = (e) => {
      if (e.target === dlg) { dlg.close(); return; }
      const b = e.target.closest('[data-pf]'); if (!b) return; const k = b.dataset.pf; const x = archivos[Number(b.dataset.i)];
      if (k === 'ver' || k === 'desc') { abrirArchivoPortal(x.f, k === 'ver'); return; }
      dlg.close(); if (k === 'recibir') recibirSolicitud(s); if (k === 'observar') observarSolicitud(s);
    };
    abrirDlg(dlg);
  }
  $('#tabla-portal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return; const s = portal[Number(b.closest('tr').dataset.i)]; if (!s) return;
    if (b.dataset.p === 'ver') verSolicitud(s); if (b.dataset.p === 'recibir') recibirSolicitud(s); if (b.dataset.p === 'observar') observarSolicitud(s);
  });
  $('#portal-actualizar').addEventListener('click', async () => { await cargarPortal(); aviso(portal.length ? `${portal.length} solicitud(es) por recibir.` : 'No hay solicitudes nuevas en el portal.'); });
  window.addEventListener('focus', cargarPortal);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cargarPortal(); });

  /* ================= Registro de documento (ventanilla) ================= */
  const form = $('#formulario-admin'); const mensajeAdmin = $('#mensaje-admin'); let adjuntosForm = [];
  $('#tipo-admin').innerHTML = D.TIPOS.map((t) => `<option>${esc(t)}</option>`).join('');
  $('#canal-admin').innerHTML = D.CANALES.filter((c) => c !== 'Portal web').map((c) => `<option>${esc(c)}</option>`).join('');
  $('#area-admin').innerHTML = `<option value="" selected disabled>Seleccionar área de destino</option>${D.AREAS.map((a) => `<option>${esc(a)}</option>`).join('')}`;
  const refrescarCodigo = () => { $('#expediente').value = D.siguienteCodigo(); };
  function renderAdjuntosForm() {
    $('#lista-adjuntos-admin').innerHTML = adjuntosForm.map((a, i) => `<li><i data-lucide="file-text"></i><span>${esc(a.name)}</span><small>${esc(D.fmtTam(a.size))}</small><button type="button" data-quitar="${i}" aria-label="Quitar ${esc(a.name)}"><i data-lucide="x"></i></button></li>`).join('');
    iconos($('#lista-adjuntos-admin'));
  }
  const informar = (html, tipo) => { mensajeAdmin.innerHTML = html; mensajeAdmin.className = `mensaje ${tipo} visible`; };
  $('#adjuntos-admin').addEventListener('change', (e) => {
    const nuevos = Array.from(e.target.files); e.target.value = ''; const error = validarArchivos(nuevos); if (error) { informar(esc(error), 'error'); return; }
    adjuntosForm.push(...nuevos); mensajeAdmin.className = 'mensaje'; renderAdjuntosForm();
  });
  $('#lista-adjuntos-admin').addEventListener('click', (e) => { const b = e.target.closest('[data-quitar]'); if (!b) return; adjuntosForm.splice(Number(b.dataset.quitar), 1); renderAdjuntosForm(); });
  form.addEventListener('reset', () => { adjuntosForm = []; renderAdjuntosForm(); mensajeAdmin.className = 'mensaje'; setTimeout(refrescarCodigo, 0); });
  mensajeAdmin.addEventListener('click', (e) => { const b = e.target.closest('[data-cargo]'); if (b) imprimirCargo(b.dataset.cargo); const v = e.target.closest('[data-detalle]'); if (v) abrirDetalle(v.dataset.detalle); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(form); const val = (c) => String(f.get(c) || '').trim();
    if (!val('remitente')) return mostrarErrorCampo('#remitente-admin', 'Ingresa el nombre del remitente.');
    if (val('dni') && !/^(\d{8}|\d{11})$/.test(val('dni'))) return mostrarErrorCampo('#dni-admin', 'El DNI debe tener 8 dígitos o el RUC 11 dígitos.');
    if (val('correo') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('correo'))) return mostrarErrorCampo('#correo-admin', 'El correo no es válido.');
    if (!val('asunto')) return mostrarErrorCampo('#asunto-admin', 'Escribe el asunto del documento.');
    if (!val('area')) return mostrarErrorCampo('#area-admin', 'Selecciona el área a la que se asignará el expediente.');
    const boton = $('#enviar-form'); boton.disabled = true;
    try {
      const adjuntos = []; for (const a of adjuntosForm) adjuntos.push(await D.guardarArchivo(a));
      const exp = D.crear({ remitente: val('remitente'), dni: val('dni'), correo: val('correo'), telefono: val('telefono'), tipo: val('tipo'), numeroDocumento: val('numeroDocumento'), folios: Number(val('folios')) || 1, canal: val('canal'), area: val('area'), prioridad: String(f.get('prioridad') || 'Media'), asunto: val('asunto'), notas: val('notas'), adjuntos });
      form.reset();
      informar(`<strong>${esc(exp.codigo)}</strong> registrado y asignado correctamente a ${esc(exp.area)}. <button type="button" class="enlace-msg" data-cargo="${esc(exp.codigo)}">Imprimir cargo</button> · <button type="button" class="enlace-msg" data-detalle="${esc(exp.codigo)}">Ver detalle</button>`, 'exito');
      aviso(`${exp.codigo} registrado correctamente.`);
    } catch (error) { console.error(error); informar('No se pudo registrar el documento. Verifica el espacio disponible del navegador e inténtalo de nuevo.', 'error'); }
    finally { boton.disabled = false; }
  });
  function mostrarErrorCampo(selector, texto) { informar(esc(texto), 'error'); $(selector).focus(); mensajeAdmin.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  $('#toggle-form').addEventListener('click', (e) => {
    const boton = e.currentTarget; const contraido = form.classList.toggle('collapsed'); boton.setAttribute('aria-expanded', String(!contraido));
    boton.innerHTML = `<i data-lucide="chevron-${contraido ? 'down' : 'up'}"></i>${contraido ? 'Expandir' : 'Contraer'}`; iconos(boton);
  });

  /* ================= Métricas, insignias y notificaciones ================= */
  function renderMetricas() {
    const lista = D.listar(); const hoy = new Date(); const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
    const hoyN = lista.filter((d) => mismoDia(new Date(d.fecha), hoy)).length; const ayerN = lista.filter((d) => mismoDia(new Date(d.fecha), ayer)).length;
    $('#metric-ingresos').textContent = hoyN;
    $('#metric-ingresos-delta').textContent = ayerN ? `${hoyN >= ayerN ? '+' : ''}${Math.round(((hoyN - ayerN) / ayerN) * 100)}% vs. ayer` : (hoyN ? 'Sin ingresos ayer' : 'Sin ingresos hoy');
    const pend = lista.filter((d) => d.estado === 'Pendiente').length; $('#metric-pendientes').textContent = pend;
    $('#metric-pendientes-nota').textContent = portal.length ? `+${portal.length} del portal por recibir` : 'Requieren atención';
    const rev = lista.filter((d) => d.estado === 'En revisión'); $('#metric-revision').textContent = rev.length;
    $('#metric-revision-nota').textContent = `${rev.filter((d) => d.prioridad === 'Alta').length} de alta prioridad`;
    const aten = lista.filter((d) => d.estado === 'Atendido'); $('#metric-atendidos').textContent = aten.length;
    const hoyAt = lista.filter((d) => (d.movimientos || []).some((m) => /→ Atendido/.test(m.detalle) && mismoDia(new Date(m.fecha), hoy))).length;
    $('#metric-atendidos-nota').textContent = `${hoyAt} atendido(s) hoy`;
  }
  function renderBadges() {
    const lista = D.listar(); $('#badge-bandeja').textContent = lista.filter((d) => d.estado === 'Pendiente').length + portal.length; $('#badge-asignados').textContent = tablas.asignados.total();
  }
  const CLAVE_NOTIF = 'mesaPartes.notifVista';
  const vistoNotif = () => Number(localStorage.getItem(CLAVE_NOTIF) || 0);
  function itemsNotif() {
    const movs = []; D.listar().forEach((d) => (d.movimientos || []).forEach((m) => movs.push({ tipo: 'mov', fecha: m.fecha, codigo: d.codigo, titulo: `${m.accion} · ${d.codigo}`, texto: m.detalle })));
    portal.forEach((s) => movs.push({ tipo: 'portal', fecha: s.fecha, titulo: 'Nueva solicitud del portal', texto: `${s.remitente}: ${s.asunto || 'Sin asunto'}` }));
    return movs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 10);
  }
  function renderNotificaciones() {
    const items = itemsNotif(); const visto = vistoNotif(); const nuevas = items.filter((i) => new Date(i.fecha).getTime() > visto).length;
    $('#notif-punto').hidden = nuevas === 0; $('#btn-notif').setAttribute('aria-label', nuevas ? `Notificaciones (${nuevas} nuevas)` : 'Notificaciones');
    $('#lista-notif').innerHTML = items.length ? items.map((i, n) => `<li><button type="button" data-n="${n}" class="${new Date(i.fecha).getTime() > visto ? 'nueva' : ''}"><i data-lucide="${i.tipo === 'portal' ? 'globe' : 'bell-ring'}"></i><div><strong>${esc(i.titulo)}</strong><p>${esc(i.texto)}</p><small>${esc(D.fmtRelativo(i.fecha))}</small></div></button></li>`).join('') : '<li class="vacio-n">Sin notificaciones.</li>';
    $('#lista-notif')._items = items; iconos($('#lista-notif'));
  }
  $('#btn-notif').addEventListener('click', (e) => { e.stopPropagation(); const abrir = $('#panel-notif').hidden; cerrarPopovers(); $('#panel-notif').hidden = !abrir; $('#btn-notif').setAttribute('aria-expanded', String(abrir)); });
  $('#notif-leidas').addEventListener('click', () => { localStorage.setItem(CLAVE_NOTIF, String(Date.now())); renderNotificaciones(); });
  $('#lista-notif').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]'); if (!b) return; const item = $('#lista-notif')._items[Number(b.dataset.n)]; cerrarPopovers();
    if (item.tipo === 'mov') abrirDetalle(item.codigo); else { irA('bandeja'); $('#tarjeta-portal').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  /* ================= Reportes ================= */
  let movLimite = 15;
  function barras(contenedor, pares, total, clase = '') {
    const max = Math.max(1, ...pares.map((p) => p[1]));
    $(contenedor).innerHTML = pares.map(([nombre, n, cls]) => `<div class="barra-fila"><span>${esc(nombre)}</span><div class="barra-pista"><div class="barra-valor ${cls || clase}" style="width:${(n / max) * 100}%"></div></div><b>${n}</b><em>${total ? Math.round((n / total) * 100) : 0}%</em></div>`).join('');
  }
  function renderReportes() {
    const lista = D.listar(); const total = lista.length; const cuenta = (campo, valor) => lista.filter((d) => d[campo] === valor).length;
    const tramite = lista.filter((d) => ['Pendiente', 'Asignado', 'En revisión'].includes(d.estado)).length;
    $('#rep-resumen').innerHTML = [['blue', 'files', 'Total de expedientes', total, 'Registrados en el sistema'], ['amber', 'timer', 'En trámite', tramite, 'Pendientes, asignados o en revisión'], ['violet', 'triangle-alert', 'Observados', cuenta('estado', 'Observado'), 'Requieren subsanación'], ['green', 'circle-check-big', 'Concluidos', cuenta('estado', 'Atendido') + cuenta('estado', 'Archivado'), 'Atendidos y archivados']]
      .map(([c, i, t, n, nota]) => `<article><span class="metric-icon ${c}"><i data-lucide="${i}"></i></span><div><small>${t}</small><strong>${n}</strong><em>${nota}</em></div></article>`).join('');
    barras('#rep-estados', D.ESTADOS.map((e) => [e, cuenta('estado', e), `e-${claseEstado(e)}`]), total);
    barras('#rep-areas', D.AREAS.map((a) => [a, cuenta('area', a)]), total);
    barras('#rep-canales', D.CANALES.map((c) => [c, cuenta('canal', c)]), total);
    const activos = lista.filter((d) => d.estado !== 'Archivado' && d.estado !== 'Atendido'); const ca = activos.length;
    barras('#rep-prioridad', D.PRIORIDADES.slice().reverse().map((p) => [p, activos.filter((d) => d.prioridad === p).length, `p-${PRIORIDAD_CLASE[p]}`]), ca);
    const todos = []; lista.forEach((d) => (d.movimientos || []).forEach((m) => todos.push({ ...m, codigo: d.codigo }))); todos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const acciones = [...new Set(todos.map((m) => m.accion))].sort(); const sel = $('#rep-accion'); const actual = sel.value;
    sel.innerHTML = `<option value="">Todas las acciones</option>${acciones.map((a) => `<option>${esc(a)}</option>`).join('')}`; sel.value = acciones.includes(actual) ? actual : '';
    const txt = $('#rep-buscar').value.trim().toLowerCase();
    const filtrados = todos.filter((m) => (!sel.value || m.accion === sel.value) && (!txt || `${m.codigo} ${m.accion} ${m.detalle} ${m.responsable}`.toLowerCase().includes(txt)));
    $('#rep-movimientos').innerHTML = filtrados.slice(0, movLimite).map((m) => `<tr><td>${esc(D.fmtFechaLarga(m.fecha))}</td><td><button type="button" class="enlace-exp" data-ver-rep="${esc(m.codigo)}">${esc(m.codigo)}</button></td><td>${esc(m.accion)}</td><td>${esc(m.detalle)}</td><td>${esc(m.responsable || '')}</td></tr>`).join('') || '<tr class="vacio"><td colspan="5"><span>No hay movimientos que coincidan.</span></td></tr>';
    $('#rep-mov-info').textContent = `Mostrando ${Math.min(movLimite, filtrados.length)} de ${filtrados.length} movimientos`; $('#rep-mov-mas').hidden = filtrados.length <= movLimite;
    iconos($('#vista-reportes'));
  }
  $('#rep-buscar').addEventListener('input', () => { movLimite = 15; renderReportes(); });
  $('#rep-accion').addEventListener('change', () => { movLimite = 15; renderReportes(); });
  $('#rep-mov-mas').addEventListener('click', () => { movLimite += 15; renderReportes(); });
  $('#rep-movimientos').addEventListener('click', (e) => { const b = e.target.closest('[data-ver-rep]'); if (b) abrirDetalle(b.dataset.verRep); });
  $('#rep-csv').addEventListener('click', () => exportarCSV(D.listar(), 'reporte-expedientes'));
  $('#rep-imprimir').addEventListener('click', () => { document.body.classList.add('imprimiendo-reporte'); window.print(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-reporte'));

  /* ================= Configuración ================= */
  function renderConfig() {
    const c = D.config(); $('#cfg-responsable').value = c.responsable; $('#cfg-anio').value = c.anio; $('#cfg-proximo').value = D.siguienteCodigo();
    $('#cfg-area').innerHTML = D.AREAS.map((a) => `<option>${esc(a)}</option>`).join(''); $('#cfg-area').value = c.area;
  }
  $('#form-config').addEventListener('submit', (e) => {
    e.preventDefault(); const responsable = $('#cfg-responsable').value.trim(); const anio = Number($('#cfg-anio').value); const m = $('#mensaje-config');
    if (!responsable || !anio || anio < 2020 || anio > 2100) { m.textContent = 'Revisa el nombre del responsable y el año.'; m.className = 'mensaje error visible'; return; }
    D.guardarConfig({ responsable, anio, area: $('#cfg-area').value }); m.textContent = 'Configuración guardada correctamente.'; m.className = 'mensaje exito visible'; aviso('Configuración guardada.');
  });
  $('#cfg-exportar').addEventListener('click', () => { const f = new Date(); descargarTexto(`respaldo-mesa-partes-${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}.json`, JSON.stringify(D.respaldo(), null, 2), 'application/json'); aviso('Respaldo descargado.'); });
  $('#cfg-importar').addEventListener('change', async (e) => {
    const archivo = e.target.files[0]; e.target.value = ''; if (!archivo) return;
    try {
      const datos = JSON.parse(await archivo.text());
      if (!(await confirmar({ titulo: 'Restaurar respaldo', texto: `Se reemplazarán los expedientes actuales por los del respaldo (${datos.expedientes?.length ?? 0} expedientes).`, ok: 'Restaurar', peligro: true }))) return;
      D.restaurarRespaldo(datos); aviso('Respaldo restaurado correctamente.');
    } catch { aviso('El archivo no es un respaldo válido.', 'error'); }
  });
  $('#cfg-demo').addEventListener('click', async () => { if (await confirmar({ titulo: 'Restablecer datos de demostración', texto: 'Se reemplazarán todos los expedientes actuales por los datos de ejemplo.', ok: 'Restablecer', peligro: true })) { D.restablecerDemo(); aviso('Datos de demostración restablecidos.'); } });
  $('#cfg-vaciar').addEventListener('click', async () => { if (await confirmar({ titulo: 'Vaciar expedientes', texto: 'Se eliminarán todos los expedientes registrados. Esta acción no se puede deshacer; descarga un respaldo antes si lo necesitas.', ok: 'Vaciar todo', peligro: true })) { D.vaciar(); aviso('Se eliminaron todos los expedientes.', 'warn'); } });

  /* ================= Navegación ================= */
  const VISTAS = {
    bandeja: ['Bandeja de entrada', 'CENTRO DE OPERACIONES', 'Recepción documentaria', 'Registra, clasifica y asigna expedientes desde una sola vista.'],
    asignados: ['Asignados a mí', 'MI TRABAJO', 'Asignados a mí', 'Expedientes a cargo de tu área que requieren atención.'],
    archivo: ['Archivo', 'ARCHIVO CENTRAL', 'Archivo de expedientes', 'Expedientes concluidos y archivados. Consúltalos o restáuralos.'],
    reportes: ['Reportes', 'SEGUIMIENTO', 'Reportes y movimientos', 'Resumen del flujo documental y registro de todos los movimientos.'],
    configuracion: ['Configuración', 'AJUSTES', 'Configuración', 'Datos del responsable, numeración y respaldo de la información.']
  };
  let vistaActual = 'bandeja';
  function irA(vista) { if (window.location.hash !== `#${vista}`) window.location.hash = vista; else mostrarVista(); }
  function mostrarVista() {
    const hash = window.location.hash.replace('#', ''); vistaActual = VISTAS[hash] ? hash : 'bandeja'; const [migas, eyebrow, h1, p] = VISTAS[vistaActual];
    $$('.vista').forEach((s) => { s.hidden = s.id !== `vista-${vistaActual}`; });
    $$('.admin-nav a[data-vista]').forEach((a) => { a.classList.toggle('active', a.dataset.vista === vistaActual); if (a.dataset.vista === vistaActual) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#migas').textContent = migas; $('#titulo-eyebrow').textContent = eyebrow; $('#titulo-h1').textContent = h1; $('#titulo-p').textContent = p; document.title = `${migas} | Mesa de Partes`;
    $('#barra-lateral').classList.remove('open'); renderVista(); window.scrollTo({ top: 0 });
  }
  function renderVista() {
    if (vistaActual === 'bandeja') { renderMetricas(); tablas.bandeja.render(); }
    if (vistaActual === 'asignados') tablas.asignados.render();
    if (vistaActual === 'archivo') tablas.archivo.render();
    if (vistaActual === 'reportes') renderReportes();
    if (vistaActual === 'configuracion') renderConfig();
  }
  function renderTodo() { renderVista(); renderBadges(); renderNotificaciones(); refrescarCodigo(); if (detalleCodigo) renderDetalle(); }
  window.addEventListener('hashchange', mostrarVista);
  window.addEventListener('mesa:cambio', renderTodo);
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('mesaPartes.')) renderTodo(); });

  $('#btn-buscar-global').addEventListener('click', () => {
    const destino = ['asignados', 'archivo'].includes(vistaActual) ? vistaActual : 'bandeja'; if (vistaActual !== destino) irA(destino);
    setTimeout(() => { tablas[destino].raiz.scrollIntoView({ behavior: 'smooth', block: 'start' }); tablas[destino].enfocarBusqueda(); }, 60);
  });
  $('#toggle-menu').addEventListener('click', () => $('#barra-lateral').classList.toggle('open'));
  document.addEventListener('click', (e) => { if (!e.target.closest('#barra-lateral, #toggle-menu')) $('#barra-lateral').classList.remove('open'); });
  $('#abrir-ayuda').addEventListener('click', () => abrirDlg($('#dlg-ayuda')));
  $('.cerrar-sesion').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });

  function actualizarReloj() {
    const f = new Date(); $('#meta-fecha').textContent = f.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }); $('#meta-hora').textContent = f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function actualizarPerfil() {
    const c = D.config(); const iniciales = c.responsable.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'SA';
    ['#perfil-iniciales', '#usuario-iniciales'].forEach((s) => { $(s).textContent = iniciales; }); $('#perfil-nombre').textContent = c.responsable; $('#usuario-nombre').textContent = c.responsable; $('#form-usuario').textContent = c.responsable;
  }
  window.addEventListener('mesa:cambio', actualizarPerfil);

  /* ================= Inicio ================= */
  actualizarReloj(); setInterval(actualizarReloj, 20000); setInterval(() => { renderNotificaciones(); }, 60000);
  actualizarPerfil(); refrescarCodigo(); renderAdjuntosForm();
  mostrarVista(); renderBadges(); renderNotificaciones(); cargarPortal();
})();
