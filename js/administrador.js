/* Panel del Administrador (usa la capa de datos compartida MesaDatos).
   Centro de control, envío de documentos a otras áreas, documentos, usuarios, roles, bitácora, reportes y configuración. */
(function () {
  'use strict';
  const D = window.MesaDatos;
  const E = D.escapar;
  const AREA = 'Administración';
  const PEND = ['Pendiente', 'Asignado', 'En revisión'];
  const VISTAS = ['panel', 'enviar', 'documentos', 'usuarios', 'roles', 'bitacora', 'reportes', 'configuracion'];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ico = (n) => `<i data-lucide="${n}"></i>`;
  const refrescar = (r) => window.actualizarIconos && window.actualizarIconos(r || document);
  const st = { vista: 'panel', marc: new Set(), detalle: null, tab: 'activos', rolFiltro: '', env: { sel: new Set(), area: '' }, bitN: 25 };

  /* ---------- Utilidades ---------- */
  const todos = () => D.listar();
  const vencido = (d) => d.plazo && new Date(d.plazo) < new Date() && !['Atendido', 'Archivado'].includes(d.estado);
  const fmtPlazo = (d) => (d.plazo ? new Date(d.plazo).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '—');
  const slug = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
  const badge = (e) => `<span class="estado ad-est ${slug(e)}">${E(e)}</span>`;
  function como(fn) { // Los movimientos quedan firmados por Administración.
    const previo = D.config().responsable;
    D.guardarConfig({ responsable: AREA });
    try { return fn(); } finally { D.guardarConfig({ responsable: previo }); }
  }
  function toast(t, error) {
    const x = document.createElement('div'); x.className = 'ad-toast' + (error ? ' error' : '');
    x.innerHTML = `${ico(error ? 'circle-alert' : 'circle-check')}<span>${E(t)}</span>`;
    const c = $('#toasts'); c.append(x); while (c.children.length > 3) c.firstChild.remove();
    refrescar(x); setTimeout(() => x.remove(), 3600);
  }
  function confirmar(titulo, texto, boton = 'Confirmar') {
    return new Promise((res) => {
      const dlg = $('#dlg-confirmar'); let ok = false;
      $('#cf-tit').textContent = titulo; $('#cf-txt').textContent = texto; $('#cf-ok').textContent = boton;
      $('#cf-ok').onclick = () => { ok = true; dlg.close(); };
      dlg.addEventListener('close', () => res(ok), { once: true });
      dlg.showModal();
    });
  }
  function descargar(nombre, contenido, tipo) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    a.download = nombre; document.body.append(a); a.click(); a.remove();
  }
  const csvCelda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const llenar = (sel, items, primera) => { sel.innerHTML = ''; if (primera !== undefined) sel.add(new Option(primera, '')); items.forEach((i) => sel.add(Array.isArray(i) ? new Option(i[1], i[0]) : new Option(i, i))); };
  const leerJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (_) { return d; } };
  const guardarJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { toast('No se pudo guardar en este navegador.', true); } };

  /* ---------- Ajustes y bitácora ---------- */
  const KC = 'mesaPartes.admin.v1', KB = 'mesaPartes.bitacora.v1', KU = 'mesaPartes.usuarios.v1';
  const AJ_BASE = { institucion: 'Instituto Contralmirante Manuel Villar Olivera', siglas: 'IESTP CMVO', plazo: 5, minClave: 4, ultimoRespaldo: '' };
  const ajustes = () => ({ ...AJ_BASE, ...leerJSON(KC, {}) });
  const guardarAjustes = (c) => guardarJSON(KC, { ...ajustes(), ...c });
  const yo = () => (sessionStorage.getItem('usuarioMesaPartes') || '').toLowerCase();
  function bitacora(tipo, accion, detalle) {
    const l = leerJSON(KB, []); l.push({ fecha: new Date().toISOString(), tipo, usuario: yo() || AREA, accion, detalle });
    guardarJSON(KB, l.slice(-400));
  }

  /* ---------- Usuarios (almacén local) ---------- */
  const ROLES = {
    'Secretaría Académica': { pagina: 'secretaria.html', icono: 'clipboard-list', desc: 'Recibe y registra los documentos, los asigna y deriva, lleva el archivo y los reportes.' },
    'Secretaría': { pagina: 'secretaria.html', icono: 'inbox', desc: 'Apoyo en la recepción y el registro de documentos.' },
    'Coordinación': { pagina: 'coordinadora.html', icono: 'kanban', desc: 'Gestiona el tablero de expedientes de su área y envía documentos a otras áreas.' },
    'Dirección': { pagina: 'direccion.html', icono: 'file-signature', desc: 'Aprueba, observa o responde expedientes y los deriva con providencia.' },
    'Biblioteca': { pagina: 'bibliotecaria.html', icono: 'library-big', desc: 'Gestiona el catálogo, los préstamos, las multas y las visitas; atiende trámites como la constancia de no adeudo.' },
    'Administración': { pagina: 'administrador.html', icono: 'shield-check', desc: 'Control total: usuarios, documentos, envíos, bitácora, reportes, respaldo y configuración.' }
  };
  const NOMBRES_BASE = { '00000001': 'Secretaría Académica', '00000002': 'Coordinación Académica', '00240130': 'Dirección General', '00000004': 'Administrador del sistema', '00000005': 'Secretaría', '17528716': 'Bibliotecaria' };
  const guardarUsuarios = (l) => guardarJSON(KU, l);
  function usuarios() {
    let l = leerJSON(KU, null);
    if (!Array.isArray(l)) {
      l = (window.cuentasTemporalesGestores || []).map((c) => ({ usuario: c.usuario, nombre: NOMBRES_BASE[c.usuario] || c.rol, rol: c.rol, dependencia: c.dependencia, pagina: c.pagina, clave: c.clave, activo: true, creado: new Date().toISOString() }));
      guardarUsuarios(l);
    }
    return l;
  }
  const iniciales = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'A';
  const adminsActivos = (l) => l.filter((u) => u.activo && u.rol === 'Administración').length;

  /* ---------- Navegación ---------- */
  const TEXTOS = {
    panel: ['Panel de administrador', 'Control general de usuarios, documentos y configuración.'],
    enviar: ['Enviar documentos', 'Seleccione expedientes y envíelos a otra área con prioridad, plazo e indicaciones.'],
    documentos: ['Documentos', 'Consulte y gestione cualquier expediente de la institución.'],
    usuarios: ['Usuarios', 'Cree cuentas, cambie roles y claves, active o desactive accesos.'],
    roles: ['Roles y permisos', 'Qué hace cada rol dentro del sistema.'],
    bitacora: ['Bitácora', 'Auditoría de documentos, usuarios, accesos y cambios del sistema.'],
    reportes: ['Reportes', 'Estado de los expedientes por área, estado, canal y prioridad.'],
    configuracion: ['Configuración', 'Institución, reglas, cuenta, respaldo y mantenimiento.']
  };
  function ir(v) {
    if (!VISTAS.includes(v)) v = 'panel';
    st.vista = v; st.marc.clear(); st.bitN = 25;
    $$('.ad-vista').forEach((s) => { s.hidden = s.id !== 'vista-' + v; });
    $$('.menu a').forEach((a) => a.classList.toggle('activo', a.dataset.vista === v));
    $('#titulo-h1').textContent = TEXTOS[v][0]; $('#titulo-p').textContent = TEXTOS[v][1];
    $$('[data-en]').forEach((b) => { b.hidden = !b.dataset.en.split(' ').includes(v); });
    window.scrollTo({ top: 0 });
    pintar();
  }
  function pintar() {
    const aj = ajustes();
    $('#cab-institucion').textContent = aj.institucion; $('#marca-siglas').textContent = aj.siglas;
    $('#cab-fecha').textContent = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    const n = todos().filter((d) => d.area === AREA && PEND.includes(d.estado)).length;
    const b = $('#badge-doc'); b.textContent = n; b.hidden = !n;
    ({ panel: pintarPanel, enviar: pintarEnviar, documentos: pintarDocumentos, usuarios: pintarUsuarios, roles: pintarRoles, bitacora: pintarBitacora, reportes: pintarReportes, configuracion: pintarConfig })[st.vista]();
    if ($('#dlg-detalle').open) pintarDetalle();
    refrescar();
  }

  /* ---------- Panel de control ---------- */
  const stat = (titulo, valor, nota, cls = '') => `<article class="estadistica ${cls}"><small>${E(titulo)}</small><strong>${valor}</strong><span>${E(nota)}</span></article>`;
  function pintarPanel() {
    const l = todos(); const act = l.filter((d) => d.estado !== 'Archivado'); const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const us = usuarios(); const mios = act.filter((d) => d.area === AREA && PEND.includes(d.estado));
    const yoU = us.find((u) => u.usuario === yo());
    $('#p-saludo').textContent = `Bienvenido, ${yoU ? yoU.nombre : 'administrador'}`;
    $('#p-resumen').textContent = `${act.filter((d) => PEND.includes(d.estado)).length} expedientes esperan atención en la institución · ${mios.length} en su bandeja · ${us.filter((u) => u.activo).length} usuarios activos.`;
    $('#p-stats').innerHTML =
      stat('Documentos hoy', l.filter((d) => new Date(d.fecha) >= hoy).length, 'Registrados') + stat('Pendientes', act.filter((d) => PEND.includes(d.estado)).length, 'Por atender') +
      stat('Usuarios', us.filter((u) => u.activo).length, 'Activos') + stat('Atendidos', l.filter((d) => d.estado === 'Atendido').length, 'Expedientes cerrados') +
      stat('Plazo vencido', act.filter(vencido).length, 'Requieren seguimiento', 'alerta') + stat('Observados', act.filter((d) => d.estado === 'Observado').length, 'Con observaciones') +
      stat('En mi bandeja', mios.length, 'Área Administración') + stat('Archivados', l.length - act.length, 'En el archivo');
    // Alertas
    const al = []; const venc = act.filter(vencido).length; const sinAsignar = act.filter((d) => d.estado === 'Pendiente').length; const inact = us.filter((u) => !u.activo).length;
    const ult = ajustes().ultimoRespaldo; const dias = ult ? Math.floor((Date.now() - new Date(ult)) / 864e5) : null;
    if (venc) al.push(['rojo', 'alarm-clock', `${venc} documento(s) con plazo vencido`, 'Revisar', 'documentos', 'vencidos']);
    if (sinAsignar) al.push(['ambar', 'inbox', `${sinAsignar} documento(s) pendientes sin atender`, 'Enviar', 'documentos', 'pendientes']);
    if (act.some((d) => d.estado === 'Observado')) al.push(['ambar', 'triangle-alert', `${act.filter((d) => d.estado === 'Observado').length} documento(s) observados`, 'Ver', 'documentos', 'observados']);
    if (inact) al.push(['azul', 'user-x', `${inact} usuario(s) inactivo(s)`, 'Ver usuarios', 'usuarios', '']);
    if (dias === null || dias >= 7) al.push(['azul', 'database-backup', dias === null ? 'Aún no se descargó ningún respaldo' : `Último respaldo hace ${dias} días`, 'Respaldar', 'configuracion', '']);
    $('#p-alertas').innerHTML = al.length ? al.map(([c, i, t, b, go, tab]) => `<li class="${c}"><span>${ico(i)}</span><p>${E(t)}</p><button type="button" class="boton boton-secundario mini" data-go="${go}" data-tab="${tab}">${E(b)}</button></li>`).join('') : `<li class="ok"><span>${ico('shield-check')}</span><p>Todo en orden. No hay alertas pendientes.</p></li>`;
    // Carga por área
    const max = Math.max(1, ...D.AREAS.map((a) => act.filter((d) => d.area === a).length));
    $('#p-areas').innerHTML = D.AREAS.map((a) => { const n = act.filter((d) => d.area === a).length; const p = act.filter((d) => d.area === a && PEND.includes(d.estado)).length; return `<button type="button" class="ad-area" data-enviar-a="${E(a)}"><b>${E(a)}</b><strong>${n}</strong><small>${p} por atender</small><i style="width:${Math.round(n / max * 100)}%"></i></button>`; }).join('');
    $('#p-bandeja').innerHTML = mios.length ? mios.slice(0, 5).map((d) => `<li><div><b>${E(d.codigo)}</b><span>${E(d.asunto)}</span><small>${E(d.remitente)} · ${E(D.fmtFecha(d.fecha))}</small></div>${badge(d.estado)}<button type="button" class="boton boton-secundario mini" data-acc="ver" data-cod="${E(d.codigo)}">Abrir</button></li>`).join('') : '<li class="ad-vacio">No tiene documentos pendientes en su bandeja.</li>';
    $('#p-actividad').innerHTML = eventos().slice(0, 7).map((m) => `<li><span class="ad-sello">${ico(ICON[m.tipo] || 'activity')}</span><div><b>${E(m.accion)}</b> <small>· ${E(m.tipo)}</small><p>${E(m.detalle)}</p><small>${E(m.quien || '')} · ${E(D.fmtRelativo(m.fecha))}</small></div></li>`).join('') || '<li class="ad-vacio">Sin movimientos.</li>';
  }
  const ICON = { Documentos: 'file-text', Usuarios: 'user-cog', Accesos: 'log-in', Sistema: 'settings' };

  /* ---------- Enviar documentos ---------- */
  function abrirEnviar(cods, area) {
    st.env.sel = new Set(cods || []); st.env.area = area || '';
    $('#e-q').value = ''; $('#e-filtro').value = 'activos'; $('#e-prior').value = ''; $('#e-ind').value = ''; $('#e-plazo').value = String(ajustes().plazo);
    if (location.hash !== '#enviar') location.hash = '#enviar'; else pintar();
  }
  function listaEnviar() {
    const q = $('#e-q').value.trim().toLowerCase(); const f = $('#e-filtro').value;
    return todos().filter((d) => d.estado !== 'Archivado' && (f === 'activos' || (f === 'bandeja' ? d.area === AREA : PEND.includes(d.estado))) && (!q || [d.codigo, d.remitente, d.asunto].join(' ').toLowerCase().includes(q)));
  }
  function pintarEnviar() {
    if (!st.plazoInit) { $('#e-plazo').value = String(ajustes().plazo); st.plazoInit = true; }
    const l = listaEnviar();
    $('#e-lista').innerHTML = l.map((d) => `<label class="${st.env.sel.has(d.codigo) ? 'sel' : ''}"><input type="checkbox" data-esel="${E(d.codigo)}" ${st.env.sel.has(d.codigo) ? 'checked' : ''}><span><strong>${E(d.codigo)} · ${E(d.asunto)}</strong><small>${E(d.remitente)} · ahora en ${E(d.area || '—')} · ${E(d.estado)}</small></span></label>`).join('') || '<div class="ad-vacio">No hay documentos para mostrar.</div>';
    const act = todos().filter((d) => d.estado !== 'Archivado');
    $('#e-areas').innerHTML = D.AREAS.map((a) => `<button type="button" class="ad-area-op ${st.env.area === a ? 'sel' : ''}" data-earea="${E(a)}">${ico('building-2')}<b>${E(a)}</b><small>${act.filter((d) => d.area === a).length} activos</small></button>`).join('');
    const n = st.env.sel.size; $('#e-n').textContent = n;
    $('#e-resumen').textContent = n && st.env.area ? `Se enviarán ${n} documento(s) a ${st.env.area}.` : (n ? 'Elija el área de destino.' : 'Marque los documentos que desea enviar.');
    const mv = []; todos().forEach((d) => (d.movimientos || []).filter((m) => m.accion === 'Derivación').forEach((m) => mv.push({ ...m, d })));
    mv.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    $('#e-recientes').innerHTML = mv.slice(0, 8).map((m) => `<tr><td>${E(D.fmtFecha(m.fecha))}</td><td><strong>${E(m.d.codigo)}</strong></td><td>${E(m.d.asunto)}</td><td>${E(m.detalle)}</td><td>${E(m.responsable || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="ad-vacio">Aún no hay envíos.</td></tr>';
  }
  $('#e-q').addEventListener('input', pintarEnviar); $('#e-filtro').addEventListener('change', pintarEnviar);
  $('#f-enviar').addEventListener('submit', (e) => {
    e.preventDefault();
    let cods = [...st.env.sel].filter((c) => D.obtener(c));
    if (!cods.length) return toast('Marque al menos un documento.', true);
    const area = st.env.area; if (!area) return toast('Elija el área de destino.', true);
    const ya = cods.filter((c) => D.obtener(c).area === area); cods = cods.filter((c) => !ya.includes(c));
    if (!cods.length) return toast(`Los documentos ya están en ${area}.`, true);
    como(() => D.derivar(cods, { area, prioridad: $('#e-prior').value, indicaciones: $('#e-ind').value.trim(), plazoDias: $('#e-plazo').value }));
    st.env.sel.clear(); $('#e-ind').value = ''; toast(`${cods.length} documento(s) enviado(s) a ${area}.${ya.length ? ` ${ya.length} ya estaba(n) allí.` : ''}`);
  });
  $('#e-registrar').addEventListener('click', abrirRegistrar);

  /* ---------- Registrar documento ---------- */
  function abrirRegistrar() {
    $('#f-registrar').reset(); $('#rg-codigo').textContent = D.siguienteCodigo();
    llenar($('#rg-tipo'), D.TIPOS); llenar($('#rg-canal'), D.CANALES);
    llenar($('#rg-area'), D.AREAS.map((a) => [a, a === AREA ? `${a} (mi bandeja)` : a])); $('#rg-area').value = st.env.area || AREA;
    refrescar($('#dlg-registrar')); $('#dlg-registrar').showModal();
  }
  $('#f-registrar').addEventListener('submit', (e) => {
    e.preventDefault();
    const exp = como(() => D.crear({
      remitente: $('#rg-remitente').value.trim(), dni: $('#rg-dni').value.trim(), correo: $('#rg-correo').value.trim(), tipo: $('#rg-tipo').value,
      canal: $('#rg-canal').value, asunto: $('#rg-asunto').value.trim(), folios: Number($('#rg-folios').value) || 1,
      prioridad: $('#rg-prior').value, area: $('#rg-area').value, notas: $('#rg-notas').value.trim()
    }));
    $('#dlg-registrar').close(); toast(`Documento ${exp.codigo} registrado y enviado a ${exp.area}.`);
  });

  /* ---------- Documentos ---------- */
  const TABS = [['activos', 'Todos'], ['bandeja', 'Mi bandeja'], ['pendientes', 'Pendientes'], ['observados', 'Observados'], ['vencidos', 'Plazo vencido'], ['atendidos', 'Atendidos'], ['archivados', 'Archivados']];
  function filtrarDocs(tab) {
    const l = todos();
    return l.filter((d) => ({
      activos: d.estado !== 'Archivado', bandeja: d.estado !== 'Archivado' && d.area === AREA, pendientes: PEND.includes(d.estado), observados: d.estado === 'Observado',
      vencidos: vencido(d), atendidos: d.estado === 'Atendido', archivados: d.estado === 'Archivado'
    })[tab]);
  }
  function pintarDocumentos() {
    if (!$('#d-area').options.length) llenar($('#d-area'), D.AREAS, 'Todas las áreas');
    $('#d-tabs').innerHTML = TABS.map(([id, t]) => `<button type="button" role="tab" data-tab-set="${id}" class="${st.tab === id ? 'activo' : ''}">${E(t)}<small>${filtrarDocs(id).length}</small></button>`).join('');
    const q = $('#d-q').value.trim().toLowerCase(), ar = $('#d-area').value, pr = $('#d-prior').value;
    const l = filtrarDocs(st.tab).filter((d) => (!ar || d.area === ar) && (!pr || d.prioridad === pr) && (!q || [d.codigo, d.remitente, d.asunto, d.dni, d.tipo].join(' ').toLowerCase().includes(q)));
    $('#d-tb').innerHTML = l.length ? l.map((d) => `<tr class="${st.marc.has(d.codigo) ? 'sel' : ''}">
      <td class="c"><input type="checkbox" data-marca="${E(d.codigo)}" ${st.marc.has(d.codigo) ? 'checked' : ''} aria-label="Seleccionar ${E(d.codigo)}"></td>
      <td><strong>${E(d.codigo)}</strong><small>${E(D.fmtFecha(d.fecha))}</small></td><td><strong>${E(d.remitente)}</strong><small>${E(d.asunto)}</small></td>
      <td>${E(d.tipo)}</td><td>${E(d.area || '—')}</td><td><span class="ad-prior ${slug(d.prioridad)}"><i></i>${E(d.prioridad)}</span></td>
      <td>${badge(d.estado)}${vencido(d) ? ' <span class="estado ad-est observado">Vencido</span>' : ''}</td><td>${E(fmtPlazo(d))}</td>
      <td class="ad-acc"><button type="button" class="boton boton-secundario mini" data-acc="ver" data-cod="${E(d.codigo)}">Ver</button><button type="button" class="boton mini" data-acc="enviar" data-cod="${E(d.codigo)}">${ico('send')}Enviar</button></td></tr>`).join('') : '<tr><td colspan="9" class="ad-vacio">No hay documentos con esos filtros.</td></tr>';
    const n = st.marc.size; $('#d-lote').hidden = !n; $('span', $('#d-lote')).textContent = `${n} marcado(s)`;
    $('#d-todos').checked = l.length > 0 && l.every((d) => st.marc.has(d.codigo)); $('#d-todos').dataset.vis = JSON.stringify(l.map((d) => d.codigo));
  }
  ['d-q', 'd-area', 'd-prior'].forEach((id) => $('#' + id).addEventListener(id === 'd-q' ? 'input' : 'change', pintarDocumentos));

  /* ---------- Detalle ---------- */
  function abrirDetalle(cod) { st.detalle = cod; pintarDetalle(); const dlg = $('#dlg-detalle'); if (!dlg.open) dlg.showModal(); }
  function pintarDetalle() {
    const d = st.detalle && D.obtener(st.detalle); if (!d) { $('#dlg-detalle').close(); return; }
    const arch = d.estado === 'Archivado';
    const dato = (t, v) => `<div><dt>${E(t)}</dt><dd>${E(v || '—')}</dd></div>`;
    $('#dd-cont').innerHTML = `
      <header class="ad-dd-cab"><div><small>${E(d.codigo)} · ${E(D.fmtFechaLarga(d.fecha))}</small><h2>${E(d.asunto)}</h2>
        <div class="ad-etiquetas">${badge(d.estado)}<span class="ad-tag">Prioridad ${E(d.prioridad)}</span><span class="ad-tag">${E(d.area || 'Sin área')}</span>${vencido(d) ? '<span class="estado ad-est observado">Plazo vencido</span>' : ''}</div></div>
        <button type="button" class="boton boton-secundario mini" data-cerrar aria-label="Cerrar">${ico('x')}</button></header>
      <div class="ad-dd-acc">
        <button type="button" class="boton" data-acc="enviar" data-cod="${E(d.codigo)}">${ico('send')}Enviar a otra área</button>
        ${arch ? `<button type="button" class="boton boton-secundario" data-acc="restaurar" data-cod="${E(d.codigo)}">${ico('archive-restore')}Restaurar</button>` : `<button type="button" class="boton boton-secundario" data-acc="archivar" data-cod="${E(d.codigo)}">${ico('archive')}Archivar</button>`}
      </div>
      <div class="ad-dd-cuerpo">
        <dl class="ad-datos">${dato('Remitente', d.remitente)}${dato('DNI / RUC', d.dni)}${dato('Tipo', d.tipo)}${dato('Canal', d.canal)}${dato('Folios', d.folios)}${dato('Plazo', d.plazo ? new Date(d.plazo).toLocaleDateString('es-PE') : '')}${dato('Correo', d.correo)}${dato('Teléfono', d.telefono)}</dl>
        ${(d.adjuntos || []).length ? `<section><h3>Adjuntos</h3>${d.adjuntos.map((a) => `<div class="ad-adj"><span>${ico('paperclip')} ${E(a.nombre)} <small>${E(D.fmtTam(a.tam))}</small></span><button type="button" class="boton boton-secundario mini" data-ver="${E(a.id)}">Ver</button></div>`).join('')}</section>` : ''}
        ${arch ? '' : `<section><h3>Cambiar estado</h3><div class="ad-fila"><select id="dd-estado">${D.ESTADOS.filter((e) => e !== 'Archivado').map((e) => `<option ${e === d.estado ? 'selected' : ''}>${E(e)}</option>`).join('')}</select><input id="dd-coment" placeholder="Comentario (opcional)"><button type="button" class="boton boton-secundario" data-acc="estado" data-cod="${E(d.codigo)}">Aplicar</button></div></section>`}
        <section><h3>Agregar nota</h3><div class="ad-fila dos"><input id="dd-nota" placeholder="Escriba una nota para el recorrido del expediente"><button type="button" class="boton boton-secundario" data-acc="nota" data-cod="${E(d.codigo)}">Agregar</button></div></section>
        <section><h3>Recorrido del expediente</h3><ul class="ad-linea">${[...(d.movimientos || [])].reverse().map((m) => `<li><b>${E(m.accion)}</b><p>${E(m.detalle)}</p><small>${E(D.fmtFechaLarga(m.fecha))} · ${E(m.responsable || '')}</small></li>`).join('')}</ul></section>
      </div>`;
    refrescar($('#dd-cont'));
  }

  /* ---------- Acciones globales ---------- */
  document.addEventListener('click', async (e) => {
    const cerrar = e.target.closest('[data-cerrar]'); if (cerrar) { const dlg = cerrar.closest('dialog'); if (dlg) dlg.close(); return; }
    const a = e.target.closest('[data-acc]');
    if (a) {
      const c = a.dataset.cod, k = a.dataset.acc;
      if (k === 'ver') return abrirDetalle(c);
      if (k === 'enviar') { if ($('#dlg-detalle').open) $('#dlg-detalle').close(); return abrirEnviar([c]); }
      if (k === 'archivar') { como(() => D.archivar([c], 'Archivado por Administración.')); return toast(`${c} archivado.`); }
      if (k === 'restaurar') { como(() => D.restaurar([c])); return toast(`${c} restaurado.`); }
      if (k === 'estado') { como(() => D.cambiarEstado([c], $('#dd-estado').value, $('#dd-coment').value.trim())); return toast('Estado actualizado.'); }
      if (k === 'nota') { const t = $('#dd-nota').value.trim(); if (!t) return $('#dd-nota').focus(); como(() => D.agregarNota(c, t)); return toast('Nota agregada.'); }
    }
    const v = e.target.closest('[data-ver]');
    if (v) { try { const r = await D.obtenerArchivo(v.dataset.ver); if (!r || !r.blob) return toast('El archivo no está disponible en este equipo.', true); window.open(URL.createObjectURL(r.blob), '_blank'); } catch (_) { toast('No se pudo abrir el archivo.', true); } return; }
    const tg = e.target.closest('[data-tab-go]'); if (tg) { st.tab = tg.dataset.tabGo; return; }
    const go = e.target.closest('[data-go]');
    if (go) { if (go.dataset.tab) st.tab = go.dataset.tab; if (location.hash === '#' + go.dataset.go) pintar(); else location.hash = '#' + go.dataset.go; return; }
    const ea = e.target.closest('[data-enviar-a]'); if (ea) return abrirEnviar([], ea.dataset.enviarA);
    const ar = e.target.closest('[data-earea]'); if (ar) { st.env.area = ar.dataset.earea; return pintarEnviar(); }
    const ts = e.target.closest('[data-tab-set]'); if (ts) { st.tab = ts.dataset.tabSet; st.marc.clear(); return pintar(); }
    const lo = e.target.closest('[data-lote]');
    if (lo) {
      const cods = [...st.marc]; if (!cods.length) return;
      if (lo.dataset.lote === 'enviar') return abrirEnviar(cods);
      if (lo.dataset.lote === 'atender') { como(() => D.cambiarEstado(cods, 'Atendido', 'Atendido por Administración.')); st.marc.clear(); return toast(`${cods.length} expediente(s) marcado(s) como atendidos.`); }
      if (lo.dataset.lote === 'archivar') { if (!await confirmar('Archivar expedientes', `Se archivarán ${cods.length} expediente(s).`, 'Archivar')) return; como(() => D.archivar(cods, 'Archivado por Administración.')); st.marc.clear(); return toast(`${cods.length} expediente(s) archivado(s).`); }
    }
    const ua = e.target.closest('[data-ua]'); if (ua) return accionUsuario(ua.dataset.ua, ua.dataset.u);
  });
  document.addEventListener('change', (e) => {
    const es = e.target.closest('[data-esel]'); if (es) { es.checked ? st.env.sel.add(es.dataset.esel) : st.env.sel.delete(es.dataset.esel); return pintarEnviar(); }
    const m = e.target.closest('[data-marca]'); if (m) { m.checked ? st.marc.add(m.dataset.marca) : st.marc.delete(m.dataset.marca); return pintar(); }
    if (e.target.id === 'd-todos') { JSON.parse(e.target.dataset.vis || '[]').forEach((c) => (e.target.checked ? st.marc.add(c) : st.marc.delete(c))); pintar(); }
  });
  $('#btn-enviar').addEventListener('click', () => abrirEnviar(st.vista === 'documentos' ? [...st.marc] : []));
  $('#btn-registrar').addEventListener('click', abrirRegistrar);

  /* ---------- Usuarios ---------- */
  const fmtAcceso = (u) => (u.ultimoAcceso ? D.fmtFecha(u.ultimoAcceso) : 'Nunca');
  function pintarUsuarios() {
    const us = usuarios();
    $('#u-stats').innerHTML = stat('Usuarios', us.length, 'Registrados') + stat('Activos', us.filter((u) => u.activo).length, 'Con acceso') + stat('Inactivos', us.filter((u) => !u.activo).length, 'Sin acceso') + stat('Administradores', adminsActivos(us), 'Activos');
    const sr = $('#u-rol'); if (!sr.options.length) llenar(sr, Object.keys(ROLES), 'Todos los roles');
    if (st.rolFiltro) { sr.value = st.rolFiltro; st.rolFiltro = ''; }
    const q = $('#u-q').value.trim().toLowerCase(), r = sr.value, es = $('#u-estado').value;
    const l = us.filter((u) => (!r || u.rol === r) && (es === '' || String(Number(u.activo)) === es) && (!q || `${u.nombre} ${u.usuario}`.toLowerCase().includes(q)));
    $('#u-cont').textContent = l.length;
    $('#u-tb').innerHTML = l.map((u) => `<tr><td><strong>${E(u.usuario)}</strong>${u.usuario === yo() ? '<small>Sesión actual</small>' : ''}</td><td>${E(u.nombre)}</td><td>${E(u.rol)}</td><td>${E(fmtAcceso(u))}</td>
      <td><span class="estado ${u.activo ? 'atendido' : 'ad-est archivado'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td class="ad-acc"><button type="button" class="boton boton-secundario mini" data-ua="editar" data-u="${E(u.usuario)}">${ico('pencil')}Editar</button><button type="button" class="boton boton-secundario mini" data-ua="clave" data-u="${E(u.usuario)}">${ico('key-round')}Restablecer clave</button><button type="button" class="boton boton-secundario mini" data-ua="estado" data-u="${E(u.usuario)}">${u.activo ? 'Desactivar' : 'Activar'}</button><button type="button" class="boton boton-secundario mini ad-rojo" data-ua="eliminar" data-u="${E(u.usuario)}" aria-label="Eliminar ${E(u.usuario)}">${ico('trash-2')}</button></td></tr>`).join('') || '<tr><td colspan="6" class="ad-vacio">No hay usuarios con esos filtros.</td></tr>';
  }
  ['u-q', 'u-rol', 'u-estado'].forEach((id) => $('#' + id).addEventListener(id === 'u-q' ? 'input' : 'change', pintarUsuarios));
  function abrirUsuario(usuario) {
    const dlg = $('#dlg-usuario'); const u = usuario ? usuarios().find((x) => x.usuario === usuario) : null; const min = ajustes().minClave;
    $('#f-usuario').reset(); llenar($('#us-rol'), Object.keys(ROLES)); dlg.dataset.edit = u ? u.usuario : '';
    $('#us-tit').textContent = u ? 'Editar usuario' : 'Nuevo usuario'; $('#us-sub').textContent = u ? `Cuenta ${u.usuario}.` : `Complete los datos. La clave debe tener al menos ${min} caracteres.`;
    $('#us-clave').required = !u; $('#us-clave-nota').textContent = u ? '(vacío = no cambiar)' : '*';
    if (u) { $('#us-nombre').value = u.nombre; $('#us-usuario').value = u.usuario; $('#us-rol').value = u.rol; $('#us-activo').value = u.activo ? '1' : '0'; }
    refrescar(dlg); dlg.showModal();
  }
  $('#btn-nuevo-usuario').addEventListener('click', () => abrirUsuario(''));
  $('#f-usuario').addEventListener('submit', (e) => {
    e.preventDefault(); const dlg = $('#dlg-usuario'); const edit = dlg.dataset.edit; const l = usuarios(); const min = ajustes().minClave;
    const usuario = $('#us-usuario').value.trim().toLowerCase(); const rol = $('#us-rol').value; const activo = $('#us-activo').value === '1'; const clave = $('#us-clave').value; const nombre = $('#us-nombre').value.trim();
    if (!/^[a-z0-9._-]{4,20}$/.test(usuario)) return toast('El usuario debe tener de 4 a 20 letras, números, punto o guion.', true);
    if (l.some((x) => x.usuario === usuario && x.usuario !== edit)) return toast('Ya existe un usuario con ese DNI / nombre.', true);
    if ((!edit || clave) && clave.length < min) return toast(`La clave debe tener al menos ${min} caracteres.`, true);
    if (edit) {
      const u = l.find((x) => x.usuario === edit);
      if (u.rol === 'Administración' && u.activo && adminsActivos(l.filter((x) => x !== u).concat({ ...u, rol, activo })) < 1) return toast('Debe quedar al menos un administrador activo.', true);
      if (edit === yo() && !activo) return toast('No puede desactivar la cuenta con la que inició sesión.', true);
      Object.assign(u, { usuario, nombre, rol, dependencia: rol, pagina: ROLES[rol].pagina, activo }); if (clave) u.clave = clave;
      bitacora('Usuarios', 'Usuario editado', `${usuario} · ${rol}${clave ? ' · clave cambiada' : ''}`);
    } else {
      l.push({ usuario, nombre, rol, dependencia: rol, pagina: ROLES[rol].pagina, clave, activo, creado: new Date().toISOString() });
      bitacora('Usuarios', 'Usuario creado', `${usuario} · ${rol}`);
    }
    guardarUsuarios(l); dlg.close(); toast(edit ? 'Usuario actualizado.' : 'Usuario creado.'); pintar();
  });
  async function accionUsuario(k, usuario) {
    if (k === 'editar') return abrirUsuario(usuario);
    const l = usuarios(); const u = l.find((x) => x.usuario === usuario); if (!u) return;
    const quedan = l.filter((x) => x !== u);
    if (k === 'clave') {
      if (!await confirmar('Restablecer clave', `La clave de ${u.usuario} volverá a ser su propio DNI / usuario (${u.usuario}).`, 'Restablecer')) return;
      u.clave = u.usuario; guardarUsuarios(l); bitacora('Usuarios', 'Clave restablecida', u.usuario); return toast('Clave restablecida.');
    }
    if (k === 'estado') {
      if (u.activo && usuario === yo()) return toast('No puede desactivar la cuenta con la que inició sesión.', true);
      if (u.activo && u.rol === 'Administración' && adminsActivos(quedan) < 1) return toast('Debe quedar al menos un administrador activo.', true);
      u.activo = !u.activo; guardarUsuarios(l); bitacora('Usuarios', u.activo ? 'Usuario activado' : 'Usuario desactivado', u.usuario); toast(`Usuario ${u.activo ? 'activado' : 'desactivado'}.`); return pintar();
    }
    if (k === 'eliminar') {
      if (usuario === yo()) return toast('No puede eliminar la cuenta con la que inició sesión.', true);
      if (u.activo && u.rol === 'Administración' && adminsActivos(quedan) < 1) return toast('Debe quedar al menos un administrador activo.', true);
      if (!await confirmar('Eliminar usuario', `Se eliminará la cuenta ${u.usuario} (${u.nombre}). Esta acción no se puede deshacer.`, 'Eliminar')) return;
      guardarUsuarios(quedan); bitacora('Usuarios', 'Usuario eliminado', u.usuario); toast('Usuario eliminado.'); pintar();
    }
  }

  /* ---------- Roles ---------- */
  // Orden de columnas: Secretaría Académica, Secretaría, Coordinación, Dirección, Biblioteca, Administración.
  const MATRIZ = [
    ['Registrar documentos nuevos', [1, 1, 0, 0, 0, 1]], ['Enviar documentos a otras áreas', [1, 1, 1, 1, 1, 1]], ['Cambiar estado y atender expedientes', [1, 1, 1, 1, 1, 1]],
    ['Aprobar, observar y responder (providencia)', [0, 0, 0, 1, 0, 0]], ['Archivar y restaurar expedientes', [1, 1, 0, 1, 0, 1]], ['Ver reportes', [1, 1, 1, 1, 1, 1]],
    ['Catálogo, préstamos, multas y constancias de biblioteca', [0, 0, 0, 0, 1, 0]], ['Gestionar usuarios y roles', [0, 0, 0, 0, 0, 1]], ['Ver la bitácora de auditoría', [0, 0, 0, 0, 0, 1]], ['Respaldo y configuración del sistema', [1, 1, 0, 0, 0, 1]]
  ];
  function pintarRoles() {
    const us = usuarios(); const nombres = Object.keys(ROLES);
    $('#ro-tarjetas').innerHTML = nombres.map((r) => { const n = us.filter((u) => u.rol === r && u.activo).length; return `<article class="tarjeta ad-rol"><span>${ico(ROLES[r].icono)}</span><h3>${E(r)}</h3><p>${E(ROLES[r].desc)}</p><footer><b>${n}</b> usuario(s) activo(s) <button type="button" class="ad-link" data-rol-ir="${E(r)}">Ver</button></footer></article>`; }).join('');
    $('#ro-matriz').innerHTML = `<thead><tr><th>Función</th>${nombres.map((r) => `<th class="c">${E(r)}</th>`).join('')}</tr></thead><tbody>${MATRIZ.map(([f, v]) => `<tr><td>${E(f)}</td>${v.map((x) => `<td class="c">${x ? '<span class="ad-si">' + ico('check') + '</span>' : '<span class="ad-no">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }
  $('#ro-tarjetas').addEventListener('click', (e) => { const b = e.target.closest('[data-rol-ir]'); if (!b) return; st.rolFiltro = b.dataset.rolIr; location.hash = '#usuarios'; });

  /* ---------- Bitácora ---------- */
  function eventos() {
    const ev = [];
    todos().forEach((d) => (d.movimientos || []).forEach((m) => ev.push({ fecha: m.fecha, tipo: 'Documentos', quien: m.responsable || '', accion: m.accion, detalle: `${d.codigo} · ${m.detalle}` })));
    leerJSON(KB, []).forEach((b) => ev.push({ fecha: b.fecha, tipo: b.tipo, quien: b.usuario, accion: b.accion, detalle: b.detalle }));
    return ev.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }
  const bitFiltrada = () => { const q = $('#bi-q').value.trim().toLowerCase(), t = $('#bi-tipo').value; return eventos().filter((x) => (!t || x.tipo === t) && (!q || `${x.accion} ${x.detalle} ${x.quien}`.toLowerCase().includes(q))); };
  function pintarBitacora() {
    const l = bitFiltrada(); $('#bi-cont').textContent = l.length;
    $('#bi-tb').innerHTML = l.slice(0, st.bitN).map((x) => `<tr><td>${E(D.fmtFechaLarga(x.fecha))}</td><td><span class="ad-tag">${E(x.tipo)}</span></td><td>${E(x.quien || '—')}</td><td><strong>${E(x.accion)}</strong></td><td>${E(x.detalle)}</td></tr>`).join('') || '<tr><td colspan="5" class="ad-vacio">Sin eventos.</td></tr>';
    $('#bi-mas').hidden = l.length <= st.bitN;
  }
  ['bi-q', 'bi-tipo'].forEach((id) => $('#' + id).addEventListener(id === 'bi-q' ? 'input' : 'change', () => { st.bitN = 25; pintarBitacora(); }));
  $('#bi-mas').addEventListener('click', () => { st.bitN += 25; pintarBitacora(); });
  $('#bi-csv').addEventListener('click', () => {
    const filas = bitFiltrada().map((x) => [D.fmtFechaLarga(x.fecha), x.tipo, x.quien, x.accion, x.detalle].map(csvCelda).join(','));
    descargar('bitacora.csv', '﻿' + ['Fecha,Tipo,Responsable,Acción,Detalle', ...filas].join('\r\n'), 'text/csv;charset=utf-8'); toast('Bitácora exportada.');
  });

  /* ---------- Reportes ---------- */
  const cuenta = (l, f) => { const m = new Map(); l.forEach((d) => { const k = f(d) || '—'; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  function barras(titulo, datos) {
    const max = Math.max(1, ...datos.map((x) => x[1]));
    return `<article class="tarjeta ad-rp"><h3>${E(titulo)}</h3>${datos.map(([k, n]) => `<div class="ad-barra"><span>${E(k)}</span><div><i style="width:${Math.round((n / max) * 100)}%"></i></div><b>${n}</b></div>`).join('') || '<p class="ad-vacio">Sin datos.</p>'}</article>`;
  }
  function pintarReportes() {
    const l = todos(); const act = l.filter((d) => d.estado !== 'Archivado'); const venc = act.filter(vencido);
    $('#rp-stats').innerHTML = stat('Expedientes activos', act.length, `${l.length - act.length} archivados`) + stat('Esperan atención', act.filter((d) => PEND.includes(d.estado)).length, 'Pendiente, asignado o en revisión') + stat('Plazo vencido', venc.length, 'Requieren seguimiento', 'alerta') + stat('Atendidos', l.filter((d) => d.estado === 'Atendido').length, 'Expedientes cerrados');
    $('#rp-cont').innerHTML = barras('Documentos por área', cuenta(act, (d) => d.area)) + barras('Documentos por estado', cuenta(l, (d) => d.estado)) + barras('Por canal de ingreso', cuenta(l, (d) => d.canal)) +
      barras('Por tipo de documento', cuenta(l, (d) => d.tipo)) + barras('Por prioridad', cuenta(act, (d) => d.prioridad)) +
      `<article class="tarjeta ad-rp"><h3>Plazos vencidos</h3>${venc.map((d) => `<div class="ad-venc-fila"><a href="#documentos" data-acc="ver" data-cod="${E(d.codigo)}">${E(d.codigo)}</a><span>${E(d.asunto)}</span><small>${E(d.area)} · venció ${E(fmtPlazo(d))}</small></div>`).join('') || '<p class="ad-vacio">No hay documentos con plazo vencido.</p>'}</article>`;
  }
  $('#rp-imp').addEventListener('click', () => window.print());
  $('#rp-csv').addEventListener('click', () => {
    const filas = todos().map((d) => [d.codigo, d.remitente, d.dni, d.tipo, d.asunto, d.canal, d.prioridad, d.area, d.estado, D.fmtFechaLarga(d.fecha)].map(csvCelda).join(','));
    descargar('expedientes.csv', '﻿' + ['Código,Remitente,DNI,Tipo,Asunto,Canal,Prioridad,Área,Estado,Fecha', ...filas].join('\r\n'), 'text/csv;charset=utf-8'); toast('Archivo CSV generado.');
  });

  /* ---------- Configuración ---------- */
  function pintarConfig() {
    const aj = ajustes(); const y = new Date().getFullYear(); const anio = String(D.config().anio);
    if (document.activeElement && document.activeElement.closest('#vista-configuracion form')) return;
    $('#c-inst').value = aj.institucion; $('#c-siglas').value = aj.siglas;
    llenar($('#c-anio'), [...new Set([y - 1, y, y + 1, Number(anio)])].sort().map(String)); $('#c-anio').value = anio;
    $('#c-plazo').value = String(aj.plazo); $('#c-minclave').value = String(aj.minClave);
    $('#c-ultimo').textContent = aj.ultimoRespaldo ? `Último respaldo: ${D.fmtFechaLarga(aj.ultimoRespaldo)}.` : 'Todavía no se descargó ningún respaldo en este navegador.';
  }
  $('#f-inst').addEventListener('submit', (e) => { e.preventDefault(); guardarAjustes({ institucion: $('#c-inst').value.trim(), siglas: $('#c-siglas').value.trim() }); bitacora('Sistema', 'Datos de la institución', $('#c-inst').value.trim()); toast('Datos guardados.'); pintar(); });
  $('#f-reglas').addEventListener('submit', (e) => {
    e.preventDefault(); guardarAjustes({ plazo: Number($('#c-plazo').value), minClave: Number($('#c-minclave').value) }); D.guardarConfig({ anio: Number($('#c-anio').value) });
    bitacora('Sistema', 'Reglas del sistema', `Año ${$('#c-anio').value} · plazo ${$('#c-plazo').value} día(s) · clave mínima ${$('#c-minclave').value}`); toast('Reglas guardadas.');
  });
  $('#f-clave').addEventListener('submit', (e) => {
    e.preventDefault(); const a = $('#c-clave1').value, b = $('#c-clave2').value; const min = ajustes().minClave;
    const l = usuarios(); const u = l.find((x) => x.usuario === yo());
    if (!u) return toast('Inicie sesión desde el acceso de gestores para cambiar su clave.', true);
    if (a.length < min) return toast(`La clave debe tener al menos ${min} caracteres.`, true);
    if (a !== b) return toast('Las claves no coinciden.', true);
    u.clave = a; guardarUsuarios(l); bitacora('Usuarios', 'Cambio de clave propia', u.usuario); e.target.reset(); toast('Clave actualizada.');
  });
  $('#c-respaldo').addEventListener('click', () => {
    descargar(`respaldo-mesa-partes-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...D.respaldo(), usuarios: usuarios(), ajustes: ajustes() }, null, 2), 'application/json');
    guardarAjustes({ ultimoRespaldo: new Date().toISOString() }); bitacora('Sistema', 'Respaldo descargado', 'Expedientes, usuarios y ajustes'); toast('Respaldo descargado.'); pintar();
  });
  $('#c-restaurar').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const o = JSON.parse(await f.text()); if (!o || !Array.isArray(o.expedientes)) throw new Error('inválido');
      if (!await confirmar('Restaurar respaldo', 'Se reemplazarán los expedientes (y usuarios, si el archivo los incluye) por los del archivo.', 'Restaurar')) return;
      D.restaurarRespaldo(o); if (Array.isArray(o.usuarios)) guardarUsuarios(o.usuarios); bitacora('Sistema', 'Respaldo restaurado', f.name); toast('Respaldo restaurado.');
    } catch (_) { toast('El archivo de respaldo no es válido.', true); }
  });
  $('#c-demo').addEventListener('click', async () => { if (await confirmar('Restablecer datos de ejemplo', 'Se reemplazarán todos los expedientes por los datos de ejemplo.', 'Restablecer')) { D.restablecerDemo(); bitacora('Sistema', 'Datos de ejemplo restablecidos', ''); toast('Datos de ejemplo restablecidos.'); } });
  $('#c-vaciar').addEventListener('click', async () => { if (await confirmar('Vaciar expedientes', 'Se eliminarán TODOS los expedientes de este navegador. Descargue un respaldo antes si lo necesita.', 'Vaciar')) { D.vaciar(); bitacora('Sistema', 'Expedientes vaciados', ''); toast('Expedientes eliminados.'); } });
  $('#c-limpiar-bit').addEventListener('click', async () => { if (await confirmar('Limpiar bitácora', 'Se borrarán los registros de usuarios, accesos y sistema. El recorrido de cada expediente no se borra.', 'Limpiar')) { guardarJSON(KB, []); toast('Bitácora limpiada.'); pintar(); } });

  /* ---------- Arranque ---------- */
  $('#btn-salir').addEventListener('click', () => { bitacora('Accesos', 'Cierre de sesión', yo()); sessionStorage.clear(); window.location.href = 'login.html'; });
  window.addEventListener('hashchange', () => ir(location.hash.slice(1)));
  window.addEventListener('mesa:cambio', () => pintar());
  window.addEventListener('storage', () => pintar());
  const yoU = usuarios().find((u) => u.usuario === yo());
  if (yoU) { $('#perfil-nombre').textContent = yoU.nombre; $('#perfil-iniciales').textContent = iniciales(yoU.nombre); }
  ir(location.hash.slice(1));
})();
