/* Panel de Dirección General (usa la capa de datos compartida MesaDatos). */
(function () {
  'use strict';
  const D = window.MesaDatos;
  const DIR = 'Dirección General';
  const E = D.escapar;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ico = (n) => `<i data-lucide="${n}"></i>`;
  const refrescar = (r) => window.actualizarIconos && window.actualizarIconos(r || document);

  const st = { vista: 'despacho', pestana: 'decidir', area: '', sel: null, marcados: new Set() };
  const PENDIENTES = ['Pendiente', 'Asignado', 'En revisión'];

  const todos = () => D.listar().filter((d) => d.estado !== 'Archivado');
  const enDir = () => todos().filter((d) => d.area === DIR);
  function como(fn) {
    const previo = D.config().responsable;
    D.guardarConfig({ responsable: DIR });
    try { return fn(); } finally { D.guardarConfig({ responsable: previo }); }
  }
  const vencido = (d) => d.plazo && new Date(d.plazo) < new Date() && !['Atendido', 'Archivado'].includes(d.estado);
  const clsEstado = (e) => ({ Atendido: 'ok', Observado: 'alta', 'En revisión': 'ambar' }[e] || '');

  function toast(t, error) {
    const x = document.createElement('div'); x.className = 'di-toast' + (error ? ' error' : '');
    x.innerHTML = `${ico(error ? 'circle-alert' : 'circle-check')}<span>${E(t)}</span>`;
    const c = $('#toasts'); c.append(x); while (c.children.length > 3) c.firstChild.remove();
    refrescar(x); setTimeout(() => x.remove(), 3600);
  }

  /* ---------- Navegación ---------- */
  function ir(v) {
    if (!['despacho', 'areas', 'resoluciones', 'reportes'].includes(v)) v = 'despacho';
    st.vista = v;
    $$('.di-vista').forEach((s) => { s.hidden = s.id !== 'vista-' + v; });
    $$('.admin-nav a').forEach((a) => a.classList.toggle('active', a.dataset.vista === v));
    const T = {
      despacho: ['Despacho', 'CENTRO DE DECISIONES', 'Despacho de Dirección General', 'Revise, apruebe, observe o derive los expedientes desde una sola vista.'],
      areas: ['Áreas', 'CARGA DE TRABAJO', 'Áreas de la institución', 'Expedientes activos de cada área.'],
      resoluciones: ['Resoluciones', 'REGISTRO DE DECISIONES', 'Resoluciones y decisiones', 'Historial de aprobaciones, providencias y observaciones.'],
      reportes: ['Reportes', 'INDICADORES', 'Reportes de Dirección', 'Resumen del estado de los expedientes.'],
    }[v];
    $('#migas').textContent = T[0]; $('#titulo-eyebrow').textContent = T[1]; $('#titulo-h1').textContent = T[2]; $('#titulo-p').textContent = T[3];
    $('#barra-lateral').classList.remove('open'); window.scrollTo({ top: 0 });
    pintar();
  }
  function pintar() {
    const por = enDir().filter((d) => PENDIENTES.includes(d.estado)).length;
    const b = $('#badge-despacho'); b.textContent = por; b.hidden = !por; $('#notif-punto').hidden = !por;
    $('#di-fecha').textContent = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    ({ despacho: pintarDespacho, areas: pintarAreas, resoluciones: pintarResoluciones, reportes: pintarReportes })[st.vista]();
    refrescar();
  }

  /* ---------- Despacho ---------- */
  function listaActual() {
    let l;
    if (st.pestana === 'decidir') l = enDir().filter((d) => PENDIENTES.includes(d.estado));
    else if (st.pestana === 'observados') l = enDir().filter((d) => d.estado === 'Observado');
    else if (st.pestana === 'resueltos') l = enDir().filter((d) => d.estado === 'Atendido');
    else if (st.pestana === 'area') l = todos().filter((d) => d.area === st.area);
    else l = todos();
    const q = $('#d-buscar').value.trim().toLowerCase();
    if (q) l = l.filter((d) => [d.codigo, d.remitente, d.asunto, d.area].join(' ').toLowerCase().includes(q));
    const peso = { Alta: 0, Media: 1, Baja: 2 };
    return l.sort((a, b) => (peso[a.prioridad] ?? 1) - (peso[b.prioridad] ?? 1) || new Date(b.fecha) - new Date(a.fecha));
  }
  function pintarDespacho() {
    const cuentas = {
      decidir: enDir().filter((d) => PENDIENTES.includes(d.estado)).length, observados: enDir().filter((d) => d.estado === 'Observado').length,
      resueltos: enDir().filter((d) => d.estado === 'Atendido').length, todos: todos().length
    };
    const tabs = [['decidir', 'Por decidir'], ['observados', 'Observados'], ['resueltos', 'Aprobados'], ['todos', 'Toda la institución']];
    if (st.area) tabs.push(['area', st.area]);
    $('#d-pestanas').innerHTML = tabs.map(([id, t]) => `<button type="button" role="tab" data-tab="${id}" class="${st.pestana === id ? 'activo' : ''}">${E(t)}${cuentas[id] !== undefined ? `<small>${cuentas[id]}</small>` : ''}</button>`).join('');
    const lista = listaActual();
    [...st.marcados].forEach((c) => { if (!lista.some((d) => d.codigo === c)) st.marcados.delete(c); });
    if (!lista.some((d) => d.codigo === st.sel)) st.sel = lista[0] ? lista[0].codigo : null;
    $('#d-lista').innerHTML = lista.length ? lista.map((d) => `<li class="di-item ${d.codigo === st.sel ? 'sel' : ''}" data-cod="${E(d.codigo)}">
      <input type="checkbox" data-marca="${E(d.codigo)}" ${st.marcados.has(d.codigo) ? 'checked' : ''} aria-label="Marcar ${E(d.codigo)}">
      <div><header><span>${E(d.codigo)}</span><span>${E(D.fmtFecha(d.fecha))}</span></header><b>${E(d.asunto)}</b>
      <small><span class="di-punto ${E(d.prioridad || 'Media')}"></span>${E(d.remitente)}${d.area !== DIR ? ' · ' + E(d.area) : ''}</small></div></li>`).join('')
      : '<li class="di-vacio">No hay expedientes en esta bandeja.</li>';
    const n = st.marcados.size; $('#d-lote').hidden = !n; $('#d-lote-n').textContent = `${n} marcado(s)`;
    pintarLectura();
  }
  function pintarLectura() {
    const cont = $('#d-lectura'); const d = st.sel && D.obtener(st.sel);
    if (!d) { cont.innerHTML = `<div class="di-lec-vacia"><div>${ico('inbox')}<p>No hay un expediente seleccionado.</p></div></div>`; return; }
    const mio = d.area === DIR;
    const b = (a, t, i, c = '') => `<button type="button" class="di-btn ${c}" data-acc="${a}" data-cod="${E(d.codigo)}">${ico(i)}${t}</button>`;
    let acc = '';
    if (mio && d.estado !== 'Atendido') acc += b('aprobar', 'Aprobar', 'check', 'verde');
    if (mio && d.estado !== 'Observado' && d.estado !== 'Atendido') acc += b('rechazar', 'Rechazar / Observar', 'x', 'rojo');
    acc += b('derivar', 'Derivar con providencia', 'send');
    acc += b('responder', 'Responder', 'reply');
    if (mio && d.estado === 'Atendido') acc += b('archivar', 'Archivar', 'archive');
    if (!mio) acc += b('traer', 'Traer a Dirección', 'undo-2');
    const venc = vencido(d) ? '<span class="di-et rojo">Plazo vencido</span>' : '';
    const dato = (t, v) => `<div><dt>${t}</dt><dd>${v || '—'}</dd></div>`;
    cont.innerHTML = `<div class="di-lec-cab"><small>${E(d.codigo)} · ${E(D.fmtFechaLarga ? D.fmtFechaLarga(d.fecha) : D.fmtFecha(d.fecha))}</small><h2>${E(d.asunto)}</h2>
      <div class="di-etiquetas"><span class="di-et ${clsEstado(d.estado)}">${E(d.estado)}</span><span class="di-et ${d.prioridad === 'Alta' ? 'alta' : ''}">Prioridad ${E(d.prioridad || 'Media')}</span><span class="di-et">${E(d.area)}</span>${venc}</div></div>
      <div class="di-acciones">${acc}</div>
      <div class="di-lec-cuerpo"><dl class="di-datos">${dato('Remitente', E(d.remitente))}${dato('DNI', E(d.dni))}${dato('Tipo de documento', E(d.tipo))}${dato('Canal', E(d.canal))}${dato('Folios', E(d.folios))}${dato('Plazo', d.plazo ? E(D.fmtFecha(d.plazo)) : '')}${dato('Correo', E(d.correo))}${dato('Teléfono', E(d.telefono))}</dl>
      ${(d.adjuntos || []).length ? `<div><h3>Documentos adjuntos</h3>${d.adjuntos.map((a) => `<div class="di-adj"><span>${E(a.nombre)} <small>(${E(D.fmtTam(a.tam))})</small></span><button type="button" class="di-btn mini" data-ver="${E(a.id)}">${ico('eye')}Abrir</button></div>`).join('')}</div>` : ''}
      <div><h3>Recorrido del expediente</h3><ol class="di-linea">${[...(d.movimientos || [])].reverse().map((m) => `<li><b>${E(m.accion)}</b><p>${E(m.detalle)}</p><small>${E(D.fmtFecha(m.fecha))} · ${E(m.responsable)}</small></li>`).join('')}</ol></div></div>`;
  }

  $('#d-pestanas').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (!t) return; st.pestana = t.dataset.tab; st.marcados.clear(); pintar(); });
  $('#d-buscar').addEventListener('input', () => { pintarDespacho(); refrescar(); });
  $('#d-lista').addEventListener('click', (e) => {
    const m = e.target.closest('[data-marca]');
    if (m) { m.checked ? st.marcados.add(m.dataset.marca) : st.marcados.delete(m.dataset.marca); const n = st.marcados.size; $('#d-lote').hidden = !n; $('#d-lote-n').textContent = `${n} marcado(s)`; return; }
    const li = e.target.closest('.di-item'); if (!li) return;
    st.sel = li.dataset.cod; pintarDespacho(); refrescar();
    if (window.innerWidth < 1000) $('#d-lectura').scrollIntoView({ behavior: 'smooth' });
  });
  $('#d-lote').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lote]'); if (!b) return; const cods = [...st.marcados];
    if (b.dataset.lote === 'aprobar') aprobar(cods); else derivar(cods);
  });

  /* ---------- Diálogos ---------- */
  document.addEventListener('click', (e) => { const c = e.target.closest('[data-cerrar]'); if (c) c.closest('dialog').close(); });

  function decision({ titulo, sub, etiqueta, obligatorio, boton, despues }) {
    return new Promise((res) => {
      const dlg = $('#dlg-decision'), f = $('#f-decision');
      $('#dc-tit').textContent = titulo; $('#dc-sub').textContent = sub || ''; $('#dc-etq').textContent = etiqueta; $('#dc-ok').textContent = boton; $('#dc-texto').value = '';
      $('#dc-despues-wrap').hidden = !despues;
      const s = $('#dc-despues'); s.innerHTML = ''; s.add(new Option('No enviar a otra área todavía', ''));
      D.AREAS.filter((a) => a !== DIR).forEach((a) => s.add(new Option(a, a)));
      let ok = false;
      const enviar = (ev) => { ev.preventDefault(); const t = $('#dc-texto').value.trim(); if (obligatorio && !t) { $('#dc-texto').focus(); return; } ok = true; dlg.close(); res({ texto: t, despues: s.value }); };
      const cerrar = () => { f.removeEventListener('submit', enviar); dlg.removeEventListener('close', cerrar); if (!ok) res(null); };
      f.addEventListener('submit', enviar); dlg.addEventListener('close', cerrar); dlg.showModal();
    });
  }

  async function aprobar(cods) {
    const l = cods.map(D.obtener).filter(Boolean); if (!l.length) return toast('Marque al menos un expediente.', true);
    const r = await decision({ titulo: l.length === 1 ? 'Aprobar expediente' : `Aprobar ${l.length} expedientes`, sub: l.length === 1 ? `${l[0].codigo} · ${l[0].asunto}` : l.map((d) => d.codigo).join(', '), etiqueta: 'Resolución o comentario (opcional)', boton: 'Aprobar', despues: true });
    if (!r) return;
    como(() => { D.cambiarEstado(cods, 'Atendido', `Aprobado por Dirección.${r.texto ? ' ' + r.texto : ''}`); if (r.despues) D.derivar(cods, { area: r.despues, indicaciones: `Expediente aprobado por Dirección. ${r.texto}`.trim(), plazoDias: 5 }); });
    cods.forEach((c) => st.marcados.delete(c));
    toast(`${l.length} expediente(s) aprobado(s)${r.despues ? ' y enviado(s) a ' + r.despues : ''}.`);
  }
  async function rechazar(cod) {
    const d = D.obtener(cod);
    const r = await decision({ titulo: 'Rechazar / observar', sub: `${d.codigo} · ${d.asunto}`, etiqueta: 'Motivo (obligatorio)', obligatorio: true, boton: 'Registrar' });
    if (!r) return; como(() => D.cambiarEstado([cod], 'Observado', `Rechazado u observado por Dirección: ${r.texto}`)); toast(`${cod} observado.`);
  }
  async function responder(cod) {
    const d = D.obtener(cod);
    const r = await decision({ titulo: 'Responder', sub: `${d.codigo} · ${d.remitente}`, etiqueta: 'Respuesta de Dirección', obligatorio: true, boton: 'Guardar respuesta' });
    if (!r) return; como(() => D.agregarNota(cod, `Respuesta de Dirección: ${r.texto}`)); toast('Respuesta registrada en el expediente.');
  }

  /* Derivar (con o sin expedientes preseleccionados) */
  function derivar(cods) {
    const dlg = $('#dlg-derivar'); const elegir = !cods || !cods.length;
    $('#dv-elegir').hidden = !elegir;
    const sel = $('#dv-area'); sel.innerHTML = ''; D.AREAS.filter((a) => a !== DIR).forEach((a) => sel.add(new Option(a, a)));
    $('#dv-prior').value = ''; $('#dv-plazo').value = '5'; $('#dv-ind').value = '';
    dlg.dataset.fijos = JSON.stringify(elegir ? [] : cods); dlg.dataset.modo = elegir ? 'elegir' : 'fijo';
    if (elegir) { $('#dv-lista').innerHTML = ''; $('#dv-buscar').value = ''; $('#dv-sub').textContent = 'Marque los expedientes que desea derivar.'; pintarElegir(); }
    else { const l = cods.map(D.obtener).filter(Boolean); $('#dv-sub').textContent = l.length === 1 ? `${l[0].codigo} · ${l[0].asunto}` : `${l.length} expedientes: ${l.map((d) => d.codigo).join(', ')}`; }
    dlg.showModal(); refrescar(dlg);
  }
  function pintarElegir() {
    const q = $('#dv-buscar').value.trim().toLowerCase(); const dlg = $('#dlg-derivar');
    const marc = new Set($$('#dv-lista input:checked').map((i) => i.value));
    const l = todos().filter((d) => !q || [d.codigo, d.asunto, d.remitente].join(' ').toLowerCase().includes(q));
    $('#dv-lista').innerHTML = l.map((d) => `<label><input type="checkbox" value="${E(d.codigo)}" ${marc.has(d.codigo) ? 'checked' : ''}><span><strong>${E(d.codigo)} · ${E(d.asunto)}</strong><small>${E(d.remitente)} · ahora en ${E(d.area)}</small></span></label>`).join('') || '<div class="di-vacio">Sin resultados.</div>';
  }
  $('#dv-buscar').addEventListener('input', pintarElegir);
  $('#f-derivar').addEventListener('submit', (e) => {
    e.preventDefault(); const dlg = $('#dlg-derivar');
    const cods = dlg.dataset.modo === 'elegir' ? $$('#dv-lista input:checked').map((i) => i.value) : JSON.parse(dlg.dataset.fijos || '[]');
    if (!cods.length) return toast('Marque al menos un expediente.', true);
    const area = $('#dv-area').value;
    como(() => D.derivar(cods, { area, prioridad: $('#dv-prior').value, indicaciones: $('#dv-ind').value.trim(), plazoDias: $('#dv-plazo').value }));
    cods.forEach((c) => st.marcados.delete(c)); dlg.close(); toast(`${cods.length} expediente(s) derivado(s) a ${area}.`);
  });
  $('#btn-derivar-global').addEventListener('click', () => derivar(st.vista === 'despacho' && st.marcados.size ? [...st.marcados] : null));

  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-acc]');
    if (a) {
      const c = a.dataset.cod, k = a.dataset.acc;
      if (k === 'aprobar') return aprobar([c]);
      if (k === 'rechazar') return rechazar(c);
      if (k === 'derivar') return derivar([c]);
      if (k === 'responder') return responder(c);
      if (k === 'archivar') { como(() => D.archivar([c], 'Archivado por Dirección.')); return toast(`${c} archivado.`); }
      if (k === 'traer') { como(() => D.derivar([c], { area: DIR, indicaciones: 'Traído a Dirección para su decisión.' })); return toast(`${c} ahora está en Dirección.`); }
    }
    const v = e.target.closest('[data-ver]');
    if (v) {
      try { const r = await D.obtenerArchivo(v.dataset.ver); if (!r || !r.blob) return toast('El archivo no está disponible en este equipo.', true); window.open(URL.createObjectURL(r.blob), '_blank'); } catch (_) { toast('No se pudo abrir el archivo.', true); }
    }
    const ir2 = e.target.closest('[data-ir]');
    if (ir2) { e.preventDefault(); st.pestana = 'todos'; st.sel = ir2.dataset.ir; $('#d-buscar').value = ir2.dataset.ir; location.hash = '#despacho'; if (st.vista === 'despacho') pintar(); }
  });

  /* ---------- Áreas ---------- */
  function pintarAreas() {
    const l = todos();
    $('#a-tarjetas').innerHTML = D.AREAS.map((a) => {
      const x = l.filter((d) => d.area === a); const c = (e) => x.filter((d) => d.estado === e).length;
      const venc = x.filter(vencido).length;
      return `<button type="button" class="di-area ${a === DIR ? 'yo' : ''}" data-area="${E(a)}"><span class="di-et">${a === DIR ? 'Su despacho' : 'Área'}</span><h3>${E(a)}</h3><div class="n">${x.length}</div><p>expedientes activos</p>
        <div class="di-mini"><span class="di-et">${c('Asignado') + c('Pendiente')} nuevos</span><span class="di-et ambar">${c('En revisión')} en revisión</span><span class="di-et alta">${c('Observado')} observados</span><span class="di-et ok">${c('Atendido')} atendidos</span>${venc ? `<span class="di-et rojo">${venc} vencidos</span>` : ''}</div></button>`;
    }).join('');
  }
  $('#a-tarjetas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-area]'); if (!b) return;
    st.area = b.dataset.area; st.pestana = 'area'; st.sel = null; st.marcados.clear(); $('#d-buscar').value = ''; location.hash = '#despacho';
  });

  /* ---------- Resoluciones ---------- */
  function tipoMov(m) {
    if (m.accion === 'Derivación') return 'Providencia';
    if (m.accion === 'Archivado') return 'Archivo';
    if (m.accion === 'Nota') return 'Nota';
    if (/Aprobado por Dirección/.test(m.detalle)) return 'Aprobación';
    if (/Observado/.test(m.detalle)) return 'Observación';
    return m.accion;
  }
  const ICO = { Aprobación: 'badge-check', Providencia: 'send', Observación: 'triangle-alert', Nota: 'reply', Archivo: 'archive' };
  function pintarResoluciones() {
    const f = $('#r-tipo').value; const out = [];
    D.listar().forEach((d) => (d.movimientos || []).forEach((m) => { if (m.responsable === DIR) out.push({ ...m, codigo: d.codigo, asunto: d.asunto, tipo: tipoMov(m) }); }));
    const l = out.filter((m) => !f || m.tipo === f).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 150);
    $('#r-lista').innerHTML = l.length ? l.map((m) => `<li><span class="di-sello">${ico(ICO[m.tipo] || 'file-text')}</span><div><b>${E(m.tipo)}</b> · <a data-ir="${E(m.codigo)}">${E(m.codigo)}</a><p>${E(m.asunto)}</p><p>${E(m.detalle)}</p></div><time>${E(D.fmtFecha(m.fecha))}<br>${E(D.fmtRelativo(m.fecha))}</time></li>`).join('')
      : '<li style="display:block;text-align:center;color:#8c8266">Todavía no hay decisiones registradas por Dirección.</li>';
  }
  $('#r-tipo').addEventListener('change', () => { pintarResoluciones(); refrescar(); });

  /* ---------- Reportes ---------- */
  const contar = (l, f) => l.reduce((m, d) => { const k = f(d) || '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const barras = (m) => { const e = Object.entries(m); if (!e.length) return '<p class="di-sub">Sin datos.</p>'; const mx = Math.max(...e.map(([, n]) => n), 1); return e.map(([k, n]) => `<div class="di-barra"><span>${E(k)}</span><div><i style="width:${Math.round(n / mx * 100)}%"></i></div><b>${n}</b></div>`).join(''); };
  function decisiones() { const o = []; D.listar().forEach((d) => (d.movimientos || []).forEach((m) => { if (m.responsable === DIR) o.push(tipoMov(m)); })); return o; }
  function pintarReportes() {
    const l = todos(); const dec = decisiones();
    $('#rp-cont').innerHTML = `<div class="di-card"><h3>Visión general</h3><p class="di-big">${l.length}</p><p class="di-sub">expedientes activos en la institución · ${enDir().filter((d) => PENDIENTES.includes(d.estado)).length} esperan decisión · ${l.filter(vencido).length} con plazo vencido</p></div>
      <div class="di-card"><h3>Decisiones de Dirección</h3>${barras(contar(dec, (x) => x))}</div>
      <div class="di-card"><h3>Expedientes por área</h3>${barras(contar(l, (d) => d.area))}</div>
      <div class="di-card"><h3>Por estado</h3>${barras(contar(l, (d) => d.estado))}</div>
      <div class="di-card"><h3>Por prioridad</h3>${barras(contar(l, (d) => d.prioridad || 'Media'))}</div>`;
  }
  $('#rp-imp').addEventListener('click', () => window.print());
  $('#rp-csv').addEventListener('click', () => {
    const l = todos(); if (!l.length) return toast('No hay datos.', true);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = l.map((d) => [d.codigo, d.remitente, d.tipo, d.asunto, d.prioridad, d.area, d.estado, D.fmtFecha(d.fecha)].map(q).join(','));
    const blob = new Blob(['﻿' + ['Código,Remitente,Tipo,Asunto,Prioridad,Área,Estado,Fecha', ...filas].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'direccion-expedientes.csv'; document.body.append(a); a.click(); a.remove(); toast('Archivo CSV generado.');
  });

  /* ---------- Arranque ---------- */
  $('#btn-salir').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });
  $('#toggle-menu').addEventListener('click', () => $('#barra-lateral').classList.toggle('open'));
  document.addEventListener('click', (e) => { if (!e.target.closest('#barra-lateral, #toggle-menu')) $('#barra-lateral').classList.remove('open'); });
  $('#btn-buscar-global').addEventListener('click', () => { if (location.hash !== '#despacho') location.hash = '#despacho'; setTimeout(() => $('#d-buscar').focus(), 0); });
  $('#btn-notif').addEventListener('click', () => { st.pestana = 'decidir'; st.sel = null; st.marcados.clear(); if (location.hash !== '#despacho') location.hash = '#despacho'; else pintar(); });
  window.addEventListener('hashchange', () => ir(location.hash.slice(1)));
  window.addEventListener('mesa:cambio', () => pintar());
  window.addEventListener('storage', () => pintar());
  ir(location.hash.slice(1));
})();
