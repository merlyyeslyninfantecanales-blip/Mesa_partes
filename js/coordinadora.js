/* Panel de Coordinación Académica.
   Usa la misma capa de datos que Secretaría (MesaDatos): lo que Secretaría deriva a
   "Coordinación Académica" aparece aquí, y lo que Coordinación envía llega al área destino. */
(function () {
  'use strict';
  const D = window.MesaDatos;
  const MI = 'Coordinación Académica';
  const E = D.escapar;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ico = (n) => `<i data-lucide="${n}"></i>`;
  const refrescar = (r) => window.actualizarIconos && window.actualizarIconos(r || document);

  const COLUMNAS = [
    { id: 'porRevisar', titulo: 'Por revisar', ayuda: 'Recién llegados', estados: ['Pendiente', 'Asignado'], destino: 'Asignado', clase: '' },
    { id: 'revision', titulo: 'En revisión', ayuda: 'Se está evaluando', estados: ['En revisión'], destino: 'En revisión', clase: '' },
    { id: 'observado', titulo: 'Observados', ayuda: 'Falta subsanar algo', estados: ['Observado'], destino: 'Observado', clase: 'c-obs' },
    { id: 'atendido', titulo: 'Listos para enviar', ayuda: 'Atendidos en Coordinación', estados: ['Atendido'], destino: 'Atendido', clase: 'c-ok' }
  ];
  const DESTINOS = [
    { area: 'Dirección General', icono: 'landmark', nota: 'Aprobación y firma' },
    { area: 'Secretaría Académica', icono: 'folder-open', nota: 'Registro y entrega' },
    { area: 'Administración', icono: 'briefcase', nota: 'Trámites y pagos' }
  ];

  const estado = { vista: 'tablero', seleccion: new Set(), destino: '', abierto: null, arrastre: null };

  /* ---------- Datos ---------- */
  const todos = () => D.listar();
  const mios = () => todos().filter((d) => d.area === MI && d.estado !== 'Archivado');
  const enviados = () => todos().filter((d) => d.area !== MI && (d.movimientos || []).some((m) => m.accion === 'Derivación' && m.de === MI));
  const ultimoEnvio = (d) => [...(d.movimientos || [])].reverse().find((m) => m.accion === 'Derivación' && m.de === MI);
  function como(fn) { // Los movimientos quedan firmados por Coordinación.
    const previo = D.config().responsable;
    D.guardarConfig({ responsable: MI });
    try { return fn(); } finally { D.guardarConfig({ responsable: previo }); }
  }
  const vencido = (d) => d.plazo && new Date(d.plazo) < new Date() && !['Atendido', 'Archivado'].includes(d.estado);
  const diasPlazo = (d) => Math.ceil((new Date(d.plazo) - new Date()) / 86400000);
  const claseEstado = (e) => ({ Atendido: 'ok', Observado: 'alta' }[e] || '');

  function toast(texto, error) {
    const t = document.createElement('div'); t.className = 'co-toast' + (error ? ' error' : '');
    t.innerHTML = `${ico(error ? 'circle-alert' : 'circle-check')}<span>${E(texto)}</span>`;
    const caja = $('#toasts'); caja.append(t); while (caja.children.length > 3) caja.firstChild.remove();
    refrescar(t); setTimeout(() => t.remove(), 3600);
  }

  /* ---------- Navegación ---------- */
  function ir(vista) {
    if (!['tablero', 'enviar', 'seguimiento', 'historial', 'reportes'].includes(vista)) vista = 'tablero';
    estado.vista = vista;
    $$('.co-vista').forEach((s) => { s.hidden = s.id !== 'vista-' + vista; });
    $$('.co-tabs a').forEach((a) => a.classList.toggle('activo', a.dataset.vista === vista));
    pintar();
  }
  function pintar() {
    ({ tablero: pintarTablero, enviar: pintarEnviar, seguimiento: pintarSeguimiento, historial: pintarHistorial, reportes: pintarReportes })[estado.vista]();
    if (estado.abierto) pintarCajon(estado.abierto, true);
    refrescar();
  }

  /* ---------- Tablero ---------- */
  function filtrarTablero(lista) {
    const q = $('#t-buscar').value.trim().toLowerCase(), tipo = $('#t-tipo').value, pr = $('#t-prioridad').value;
    return lista.filter((d) => (!tipo || d.tipo === tipo) && (!pr || d.prioridad === pr) &&
      (!q || [d.codigo, d.remitente, d.asunto, d.dni].join(' ').toLowerCase().includes(q)));
  }
  function botonesTarjeta(d) {
    const b = (accion, txt, icono, cls = '') => `<button type="button" class="co-btn mini ${cls}" data-accion="${accion}" data-cod="${E(d.codigo)}">${ico(icono)}${txt}</button>`;
    const e = d.estado;
    let h = '';
    if (e === 'Pendiente' || e === 'Asignado') h += b('revisar', 'Revisar', 'search-check', 'verde');
    if (e === 'En revisión') h += b('atender', 'Atender', 'check', 'verde') + b('observar', 'Observar', 'triangle-alert', 'ambar');
    if (e === 'Observado') h += b('revisar', 'Reanudar', 'rotate-ccw', 'verde');
    if (e === 'Atendido') h += b('archivar', 'Archivar', 'archive');
    h += b('derivar', 'Derivar', 'send');
    return h;
  }
  function tarjeta(d) {
    const chips = [`<span class="co-chip ${d.prioridad === 'Alta' ? 'alta' : ''}">${E(d.prioridad || 'Media')}</span>`, `<span class="co-chip">${E(d.tipo || '')}</span>`];
    if (d.plazo) {
      if (vencido(d)) chips.push('<span class="co-chip vencido">Plazo vencido</span>');
      else if (!['Atendido'].includes(d.estado)) { const n = diasPlazo(d); chips.push(`<span class="co-chip vence">Vence en ${n} día${n === 1 ? '' : 's'}</span>`); }
    }
    if ((d.adjuntos || []).length) chips.push(`<span class="co-chip">${d.adjuntos.length} adjunto(s)</span>`);
    return `<article class="co-tarjeta p-${E(d.prioridad || 'Media')}" draggable="true" data-cod="${E(d.codigo)}">
      <header><span>${E(d.codigo)}</span><span>${E(D.fmtFecha(d.fecha))}</span></header>
      <h3><a href="#" data-accion="detalle" data-cod="${E(d.codigo)}">${E(d.asunto)}</a></h3>
      <p>${E(d.remitente)}</p>
      <div class="co-chips">${chips.join('')}</div>
      <footer>${botonesTarjeta(d)}</footer></article>`;
  }
  function pintarTablero() {
    const sel = $('#t-tipo');
    if (sel.options.length === 1) D.TIPOS.forEach((t) => sel.add(new Option(t, t)));
    const lista = mios();
    const venc = lista.filter(vencido).length, alta = lista.filter((d) => d.prioridad === 'Alta' && d.estado !== 'Atendido').length;
    $('#kpis').innerHTML = [
      ['inbox', 'En Coordinación', lista.length, ''], ['search-check', 'Por revisar', lista.filter((d) => ['Pendiente', 'Asignado'].includes(d.estado)).length, ''],
      ['flame', 'Prioridad alta', alta, alta ? 'alerta' : ''], ['alarm-clock', 'Plazo vencido', venc, venc ? 'alerta' : ''],
      ['send', 'Enviados a otras áreas', enviados().length, 'ok']
    ].map(([i, t, n, c]) => `<div class="co-kpi ${c}"><div class="ico">${ico(i)}</div><div><b>${n}</b><span>${t}</span></div></div>`).join('');
    const vis = filtrarTablero(lista);
    $('#tablero').innerHTML = COLUMNAS.map((c) => {
      const items = vis.filter((d) => c.estados.includes(d.estado));
      return `<section class="co-col ${c.clase}" data-col="${c.id}"><div class="co-col-cab"><div>${c.titulo}<em>${c.ayuda}</em></div><small>${items.length}</small></div>
        ${items.length ? items.map(tarjeta).join('') : '<div class="co-vacio">Sin expedientes</div>'}</section>`;
    }).join('');
  }

  /* ---------- Diálogos ---------- */
  function cerrarDlg(dlg) { if (dlg.open) dlg.close(); }
  document.addEventListener('click', (e) => { const c = e.target.closest('[data-cerrar]'); if (c) cerrarDlg(c.closest('dialog')); });

  function abrirDerivar(codigos, destinoSugerido) {
    const lista = codigos.map(D.obtener).filter(Boolean);
    if (!lista.length) return toast('Seleccione al menos un expediente.', true);
    $('#d-titulo').textContent = lista.length === 1 ? 'Derivar expediente' : `Derivar ${lista.length} expedientes`;
    $('#d-sub').textContent = lista.length === 1 ? `${lista[0].codigo} · ${lista[0].asunto}` : lista.map((d) => d.codigo).join(', ');
    const sel = $('#d-area'); sel.innerHTML = '';
    D.AREAS.filter((a) => a !== MI).forEach((a) => sel.add(new Option(a, a)));
    if (destinoSugerido) sel.value = destinoSugerido;
    $('#d-prioridad').value = ''; $('#d-plazo').value = '5'; $('#d-indic').value = '';
    $('#dlg-derivar').dataset.codigos = JSON.stringify(codigos);
    $('#dlg-derivar').showModal();
  }
  $('#f-derivar').addEventListener('submit', (e) => {
    e.preventDefault();
    const dlg = $('#dlg-derivar'); const codigos = JSON.parse(dlg.dataset.codigos || '[]');
    const area = $('#d-area').value;
    if (!area) return;
    como(() => D.derivar(codigos, { area, prioridad: $('#d-prioridad').value, indicaciones: $('#d-indic').value.trim(), plazoDias: $('#d-plazo').value }));
    codigos.forEach((c) => estado.seleccion.delete(c));
    dlg.close(); toast(`${codigos.length} expediente(s) enviado(s) a ${area}.`);
  });

  function pedirTexto({ titulo, sub = '', etiqueta = 'Comentario', obligatorio = false, boton = 'Aceptar' }) {
    return new Promise((resolver) => {
      const dlg = $('#dlg-texto'); const f = $('#f-texto');
      $('#x-titulo').textContent = titulo; $('#x-sub').textContent = sub; $('#x-etiqueta').textContent = etiqueta; $('#x-ok').textContent = boton; $('#x-texto').value = '';
      let ok = false;
      const alEnviar = (ev) => { ev.preventDefault(); const v = $('#x-texto').value.trim(); if (obligatorio && !v) { $('#x-texto').focus(); return; } ok = true; dlg.close(); resolver(v); };
      const alCerrar = () => { f.removeEventListener('submit', alEnviar); dlg.removeEventListener('close', alCerrar); if (!ok) resolver(null); };
      f.addEventListener('submit', alEnviar); dlg.addEventListener('close', alCerrar); dlg.showModal();
    });
  }

  /* ---------- Acciones ---------- */
  async function accion(nombre, codigo) {
    const d = D.obtener(codigo); if (!d) return;
    if (nombre === 'detalle') return abrirCajon(codigo);
    if (nombre === 'derivar') return abrirDerivar([codigo]);
    if (nombre === 'revisar') { como(() => D.cambiarEstado([codigo], 'En revisión', 'Coordinación inició la revisión.')); return toast(`${codigo} pasó a revisión.`); }
    if (nombre === 'atender') {
      const t = await pedirTexto({ titulo: 'Marcar como atendido', sub: `${d.codigo} · ${d.asunto}`, etiqueta: 'Resultado de la revisión (opcional)', boton: 'Marcar atendido' });
      if (t === null) return; como(() => D.cambiarEstado([codigo], 'Atendido', t)); return toast(`${codigo} atendido. Ya puede enviarlo.`);
    }
    if (nombre === 'observar') {
      const t = await pedirTexto({ titulo: 'Observar expediente', sub: `${d.codigo} · ${d.asunto}`, etiqueta: '¿Qué falta o qué debe corregirse?', obligatorio: true, boton: 'Registrar observación' });
      if (t === null) return; como(() => D.cambiarEstado([codigo], 'Observado', t)); return toast(`${codigo} observado.`);
    }
    if (nombre === 'archivar') { como(() => D.archivar([codigo], 'Archivado por Coordinación.')); return toast(`${codigo} archivado.`); }
    if (nombre === 'nota') {
      const t = await pedirTexto({ titulo: 'Agregar nota', sub: d.codigo, etiqueta: 'Nota interna', obligatorio: true, boton: 'Guardar nota' });
      if (t) { como(() => D.agregarNota(codigo, t)); toast('Nota agregada.'); }
    }
    if (nombre === 'recordar') {
      como(() => D.agregarNota(codigo, `Coordinación solicitó atención urgente a ${d.area}.`)); toast(`Recordatorio registrado para ${d.area}.`);
    }
    if (nombre === 'reclamar') {
      const t = await pedirTexto({ titulo: 'Solicitar devolución', sub: `${d.codigo} está en ${d.area}`, etiqueta: 'Motivo', obligatorio: true, boton: 'Traer a Coordinación' });
      if (t === null) return; como(() => D.derivar([codigo], { area: MI, indicaciones: `Devuelto a Coordinación. Motivo: ${t}` })); toast(`${codigo} volvió a Coordinación.`);
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]'); if (!b) return;
    e.preventDefault(); accion(b.dataset.accion, b.dataset.cod);
  });

  /* Arrastrar y soltar en el tablero */
  document.addEventListener('dragstart', (e) => { const t = e.target.closest('.co-tarjeta'); if (!t) return; estado.arrastre = t.dataset.cod; t.classList.add('arrastrando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.dataset.cod); });
  document.addEventListener('dragend', () => { estado.arrastre = null; $$('.co-tarjeta.arrastrando').forEach((t) => t.classList.remove('arrastrando')); $$('.co-col.sobre').forEach((c) => c.classList.remove('sobre')); });
  document.addEventListener('dragover', (e) => { const c = e.target.closest('.co-col'); if (c && estado.arrastre) { e.preventDefault(); $$('.co-col.sobre').forEach((x) => x !== c && x.classList.remove('sobre')); c.classList.add('sobre'); } });
  document.addEventListener('drop', async (e) => {
    const c = e.target.closest('.co-col'); if (!c || !estado.arrastre) return;
    e.preventDefault(); c.classList.remove('sobre');
    const codigo = estado.arrastre; estado.arrastre = null;
    const col = COLUMNAS.find((x) => x.id === c.dataset.col); const d = D.obtener(codigo);
    if (!col || !d || col.estados.includes(d.estado)) return;
    if (col.id === 'observado') return accion('observar', codigo);
    como(() => D.cambiarEstado([codigo], col.destino, 'Movido en el tablero de Coordinación.')); toast(`${codigo} → ${col.titulo}.`);
  });

  /* ---------- Enviar documentos ---------- */
  function pintarEnviar() {
    const lista = mios();
    [...estado.seleccion].forEach((c) => { if (!lista.some((d) => d.codigo === c)) estado.seleccion.delete(c); });
    $('#e-lista').innerHTML = lista.length ? lista.map((d) => `<label class="co-item ${estado.seleccion.has(d.codigo) ? 'marcado' : ''}">
      <input type="checkbox" data-sel="${E(d.codigo)}" ${estado.seleccion.has(d.codigo) ? 'checked' : ''}>
      <span><strong>${E(d.codigo)} · ${E(d.asunto)}</strong><small>${E(d.remitente)} · ${E(d.estado)} · Prioridad ${E(d.prioridad || 'Media')}</small></span></label>`).join('')
      : '<div class="co-vacio">No hay expedientes en Coordinación para enviar.</div>';
    $('#e-todos').checked = lista.length > 0 && lista.every((d) => estado.seleccion.has(d.codigo));
    $('#e-destinos').innerHTML = DESTINOS.map((x) => `<button type="button" class="co-destino ${estado.destino === x.area ? 'sel' : ''}" data-destino="${E(x.area)}">${ico(x.icono)}<strong>${E(x.area)}</strong><small>${E(x.nota)}</small></button>`).join('');
    const n = estado.seleccion.size; const r = $('#e-resumen');
    r.className = 'co-resumen' + (n && estado.destino ? ' ok' : '');
    r.textContent = n && estado.destino ? `Se enviarán ${n} expediente(s) a ${estado.destino}.` : n ? 'Ahora elija el destino.' : 'Seleccione expedientes y un destino.';
  }
  $('#e-lista').addEventListener('change', (e) => { const c = e.target.dataset.sel; if (!c) return; e.target.checked ? estado.seleccion.add(c) : estado.seleccion.delete(c); pintarEnviar(); refrescar(); });
  $('#e-todos').addEventListener('change', (e) => { mios().forEach((d) => e.target.checked ? estado.seleccion.add(d.codigo) : estado.seleccion.delete(d.codigo)); pintarEnviar(); refrescar(); });
  $('#e-destinos').addEventListener('click', (e) => { const b = e.target.closest('[data-destino]'); if (!b) return; estado.destino = b.dataset.destino; pintarEnviar(); refrescar(); });
  $('#e-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!estado.seleccion.size) return toast('Marque al menos un expediente.', true);
    if (!estado.destino) return toast('Elija el área de destino.', true);
    const codigos = [...estado.seleccion];
    como(() => D.derivar(codigos, { area: estado.destino, prioridad: $('#e-prioridad').value, indicaciones: $('#e-indic').value.trim(), plazoDias: $('#e-plazo').value }));
    toast(`${codigos.length} expediente(s) enviado(s) a ${estado.destino}.`);
    estado.seleccion.clear(); $('#e-indic').value = ''; pintarEnviar(); refrescar();
  });
  $('#btn-enviar-rapido').addEventListener('click', () => {
    if (estado.vista === 'tablero' && estado.seleccion.size) return abrirDerivar([...estado.seleccion]);
    location.hash = '#enviar';
  });

  /* ---------- Seguimiento ---------- */
  function pintarSeguimiento() {
    const sa = $('#s-area'), se = $('#s-estado');
    if (sa.options.length === 1) D.AREAS.filter((a) => a !== MI).forEach((a) => sa.add(new Option(a, a)));
    if (se.options.length === 1) D.ESTADOS.forEach((a) => se.add(new Option(a, a)));
    const lista = enviadosFiltrados();
    $('#s-cuerpo').innerHTML = lista.length ? lista.map((d) => {
      const env = ultimoEnvio(d);
      return `<tr><td><a href="#" data-accion="detalle" data-cod="${E(d.codigo)}"><strong>${E(d.codigo)}</strong></a></td><td>${E(d.asunto)}<br><small>${E(d.remitente)}</small></td>
        <td>${E(d.area)}</td><td>${E(D.fmtFecha(env && env.fecha))}</td><td>${d.plazo ? (vencido(d) ? '<span class="co-chip vencido">Vencido</span>' : E(D.fmtFecha(d.plazo))) : '—'}</td>
        <td><span class="co-chip ${claseEstado(d.estado)}">${E(d.estado)}</span></td>
        <td style="white-space:nowrap"><button class="co-btn mini ambar" data-accion="recordar" data-cod="${E(d.codigo)}">${ico('bell-ring')}Recordar</button> <button class="co-btn mini" data-accion="reclamar" data-cod="${E(d.codigo)}">${ico('undo-2')}Traer de vuelta</button></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="co-vacio-tabla">Aún no hay expedientes enviados. Use el botón “Enviar / Derivar”.</td></tr>';
  }
  const enviadosFiltrados = () => enviados().filter((d) => (!$('#s-area').value || d.area === $('#s-area').value) && (!$('#s-estado').value || d.estado === $('#s-estado').value));
  ['#s-area', '#s-estado'].forEach((s) => $(s).addEventListener('change', () => { pintarSeguimiento(); refrescar(); }));
  $('#s-csv').addEventListener('click', () => csv(enviadosFiltrados(), 'enviados-coordinacion'));

  function csv(lista, nombre) {
    if (!lista.length) return toast('No hay datos para exportar.', true);
    const cab = ['Código', 'Remitente', 'Tipo', 'Asunto', 'Prioridad', 'Área', 'Estado', 'Fecha', 'Plazo'];
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = lista.map((d) => [d.codigo, d.remitente, d.tipo, d.asunto, d.prioridad, d.area, d.estado, D.fmtFecha(d.fecha), d.plazo ? D.fmtFecha(d.plazo) : ''].map(celda).join(','));
    const blob = new Blob(['﻿' + [cab.join(','), ...filas].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${nombre}.csv`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Archivo CSV generado.');
  }

  /* ---------- Historial ---------- */
  function movimientos() {
    const out = [];
    todos().forEach((d) => (d.movimientos || []).forEach((m) => {
      if (m.responsable === MI || m.a === MI || m.de === MI) out.push({ ...m, codigo: d.codigo, asunto: d.asunto });
    }));
    return out.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }
  const ICONOS = { Derivación: 'send', 'Cambio de estado': 'refresh-cw', Nota: 'sticky-note', Registro: 'file-plus', Archivado: 'archive', Restaurado: 'archive-restore', Edición: 'pencil', Adjunto: 'paperclip' };
  function pintarHistorial() {
    const sel = $('#h-accion'); const todas = movimientos();
    if (sel.options.length === 1) [...new Set(todas.map((m) => m.accion))].forEach((a) => sel.add(new Option(a, a)));
    const lista = todas.filter((m) => !sel.value || m.accion === sel.value).slice(0, 150);
    $('#h-feed').innerHTML = lista.length ? lista.map((m) => `<li><span class="ico">${ico(ICONOS[m.accion] || 'circle')}</span>
      <div><b>${E(m.accion)}</b> · <a href="#" data-accion="detalle" data-cod="${E(m.codigo)}">${E(m.codigo)}</a><p>${E(m.asunto)}</p><p>${E(m.detalle)}</p></div><time>${E(D.fmtFecha(m.fecha))}<br>${E(D.fmtRelativo(m.fecha))}</time></li>`).join('')
      : '<li><div class="co-vacio-tabla" style="grid-column:1/-1">Sin movimientos.</div></li>';
  }
  $('#h-accion').addEventListener('change', () => { pintarHistorial(); refrescar(); });

  /* ---------- Reportes ---------- */
  function barras(mapa, total) {
    const filas = Object.entries(mapa); if (!filas.length) return '<p class="co-sub">Sin datos.</p>';
    const max = Math.max(...filas.map(([, n]) => n), 1);
    return filas.map(([k, n]) => `<div class="co-barra"><span>${E(k)}</span><div><i style="width:${Math.round(n / max * 100)}%"></i></div><b>${n}</b></div>`).join('');
  }
  const contar = (lista, f) => lista.reduce((m, d) => { const k = f(d) || '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
  function pintarReportes() {
    const m = mios(), env = enviados(), todosMios = todos().filter((d) => d.area === MI);
    $('#reportes').innerHTML = `
      <div class="co-panel"><h2>Resumen</h2><p class="co-big">${m.length}</p><p class="co-sub">expedientes activos en Coordinación</p>
        <p class="co-sub">${env.length} enviados a otras áreas · ${todosMios.filter((d) => d.estado === 'Atendido').length} atendidos · ${m.filter(vencido).length} con plazo vencido</p></div>
      <div class="co-panel"><h2>Por estado</h2>${barras(contar(todosMios, (d) => d.estado))}</div>
      <div class="co-panel"><h2>Por tipo de documento</h2>${barras(contar(m, (d) => d.tipo))}</div>
      <div class="co-panel"><h2>Por prioridad</h2>${barras(contar(m, (d) => d.prioridad || 'Media'))}</div>
      <div class="co-panel"><h2>Enviados por destino</h2>${barras(contar(env, (d) => d.area))}</div>`;
  }
  $('#r-csv').addEventListener('click', () => csv(todos().filter((d) => d.area === MI), 'coordinacion'));
  $('#r-imprimir').addEventListener('click', () => window.print());

  /* ---------- Cajón de detalle ---------- */
  function abrirCajon(codigo) { estado.abierto = codigo; pintarCajon(codigo); $('#cajon').hidden = false; $('#velo').hidden = false; }
  function cerrarCajon() { estado.abierto = null; $('#cajon').hidden = true; $('#velo').hidden = true; }
  function pintarCajon(codigo, silencioso) {
    const d = D.obtener(codigo); if (!d) return cerrarCajon();
    const mio = d.area === MI && d.estado !== 'Archivado';
    const dato = (t, v, cls = '') => `<div class="${cls}"><dt>${t}</dt><dd>${v || '—'}</dd></div>`;
    $('#cajon').innerHTML = `
      <div class="co-cajon-cab"><div><h2>${E(d.codigo)}</h2><p>${E(d.asunto)}</p></div><button class="co-x" data-cerrar-cajon aria-label="Cerrar">${ico('x')}</button></div>
      <div class="co-cajon-cuerpo">
        <dl class="co-datos">${dato('Remitente', E(d.remitente))}${dato('DNI', E(d.dni))}${dato('Tipo', E(d.tipo))}${dato('Canal', E(d.canal))}
          ${dato('Estado', `<span class="co-chip ${claseEstado(d.estado)}">${E(d.estado)}</span>`)}${dato('Área actual', E(d.area))}
          ${dato('Prioridad', E(d.prioridad))}${dato('Plazo', d.plazo ? E(D.fmtFecha(d.plazo)) : '')}${dato('Correo', E(d.correo))}${dato('Teléfono', E(d.telefono))}</dl>
        ${(d.adjuntos || []).length ? `<h3>Adjuntos</h3>${d.adjuntos.map((a) => `<div class="co-adj"><span>${E(a.nombre)} <small>(${E(D.fmtTam(a.tam))})</small></span><button class="co-btn mini" data-ver="${E(a.id)}">${ico('eye')}Abrir</button></div>`).join('')}` : ''}
        <h3>Recorrido del expediente</h3>
        <ol class="co-linea">${[...(d.movimientos || [])].reverse().map((m) => `<li><b>${E(m.accion)}</b><p>${E(m.detalle)}</p><small>${E(D.fmtFecha(m.fecha))} · ${E(m.responsable)}</small></li>`).join('')}</ol>
      </div>
      <div class="co-cajon-pie">
        ${mio ? botonesTarjeta(d) : `<button class="co-btn mini" data-accion="reclamar" data-cod="${E(d.codigo)}">${ico('undo-2')}Traer a Coordinación</button>`}
        <button class="co-btn mini" data-accion="nota" data-cod="${E(d.codigo)}">${ico('sticky-note')}Agregar nota</button>
      </div>`;
    refrescar($('#cajon'));
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-cerrar-cajon]') || e.target.id === 'velo') return cerrarCajon();
    const v = e.target.closest('[data-ver]'); if (!v) return;
    try {
      const reg = await D.obtenerArchivo(v.dataset.ver);
      if (!reg || !reg.blob) return toast('El archivo no está disponible en este equipo.', true);
      window.open(URL.createObjectURL(reg.blob), '_blank');
    } catch (err) { toast('No se pudo abrir el archivo.', true); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && estado.abierto) cerrarCajon(); });

  /* ---------- Arranque ---------- */
  ['#t-buscar', '#t-tipo', '#t-prioridad'].forEach((s) => $(s).addEventListener('input', () => { pintarTablero(); refrescar(); }));
  $('#btn-salir').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });
  window.addEventListener('hashchange', () => ir(location.hash.slice(1)));
  window.addEventListener('mesa:cambio', () => { if (document.readyState !== 'loading') pintar(); });
  window.addEventListener('storage', () => pintar());
  document.addEventListener('DOMContentLoaded', () => ir(location.hash.slice(1)));
  if (document.readyState !== 'loading') ir(location.hash.slice(1));
})();
