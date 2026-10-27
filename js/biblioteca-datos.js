/* Capa de datos de la Biblioteca (modo local, sin servidor): catálogo, lectores, préstamos, reservas, multas, visitas y constancias.
   Se guarda en localStorage. Cuando exista el backend (MySQL), basta reemplazar estas funciones por llamadas a la API. */
(function (raiz) {
  'use strict';
  const CLAVE = 'mesaPartes.biblioteca.v1';
  const DIA = 864e5;
  const CATEGORIAS = ['Computación y TI', 'Redes y Telecomunicaciones', 'Administración', 'Contabilidad', 'Matemática', 'Comunicación', 'Literatura', 'Referencia', 'Otros'];
  const TIPOS_LECTOR = ['Estudiante', 'Docente', 'Administrativo', 'Externo'];
  const MOTIVOS = ['Lectura en sala', 'Uso de computadoras', 'Consulta de material', 'Trabajo grupal', 'Devolución o préstamo'];
  const CONFIG_BASE = { diasPrestamo: 7, maxLibros: 3, multaDia: 0.5, maxRenovaciones: 1 };

  const id = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const finDia = (f) => { const x = new Date(f); x.setHours(23, 59, 59, 999); return x; };
  const hace = (dias, horas = 0) => new Date(Date.now() - dias * DIA - horas * 36e5);
  const pad = (n, l = 4) => String(n).padStart(l, '0');

  /* ---------- Semilla ---------- */
  function semilla() {
    const L = [
      ['Redes de computadoras', 'Andrew S. Tanenbaum', 'Pearson', 2012, 'Redes y Telecomunicaciones', 'A-01', 3],
      ['Fundamentos de bases de datos', 'Silberschatz, Korth, Sudarshan', 'McGraw-Hill', 2014, 'Computación y TI', 'A-02', 2],
      ['Ingeniería del software', 'Ian Sommerville', 'Pearson', 2011, 'Computación y TI', 'A-03', 3],
      ['Clean Code', 'Robert C. Martin', 'Prentice Hall', 2008, 'Computación y TI', 'A-04', 2],
      ['Sistemas operativos modernos', 'Andrew S. Tanenbaum', 'Pearson', 2009, 'Computación y TI', 'A-05', 2],
      ['Laravel: Up & Running', 'Matt Stauffer', "O'Reilly", 2019, 'Computación y TI', 'A-06', 1],
      ['Guía oficial CCNA 200-301', 'Wendell Odom', 'Cisco Press', 2019, 'Redes y Telecomunicaciones', 'A-07', 2],
      ['Administración: una perspectiva global', 'Koontz y Weihrich', 'McGraw-Hill', 2012, 'Administración', 'B-01', 3],
      ['Contabilidad general', 'Warren y Reeve', 'Cengage', 2013, 'Contabilidad', 'B-02', 2],
      ['Matemática básica', 'Armando Venero', 'Gemar', 2015, 'Matemática', 'C-01', 4],
      ['Taller de redacción', 'Daniel Cassany', 'Anagrama', 2006, 'Comunicación', 'C-02', 2],
      ['Cien años de soledad', 'Gabriel García Márquez', 'Alfaguara', 2007, 'Literatura', 'D-01', 2],
      ['Tungsteno', 'César Vallejo', 'Peisa', 2010, 'Literatura', 'D-02', 2],
      ['Diccionario de la lengua española', 'Real Academia Española', 'Espasa', 2014, 'Referencia', 'R-01', 1]
    ].map(([titulo, autor, editorial, anio, categoria, ubicacion, ejemplares], i) => ({ id: id(), codigo: `LIB-${pad(i + 1)}`, titulo, autor, editorial, anio, isbn: '', categoria, ubicacion, ejemplares, descripcion: '', activo: true, creado: hace(90).toISOString() }));
    const lec = [
      ['70123456', 'Kevin Atoche Rojas', 'Estudiante', 'Arquitectura de Plataformas y Servicios de TI', 'V', '987654321', 'kevin.atoche@example.com'],
      ['71234501', 'María Torres Peña', 'Estudiante', 'Arquitectura de Plataformas y Servicios de TI', 'III', '', 'maria.torres@example.com'],
      ['45678912', 'Carlos Mendoza Ruiz', 'Estudiante', 'Administración', 'IV', '', ''],
      ['72345610', 'Lucía Fernández Salazar', 'Estudiante', 'Contabilidad', 'II', '', ''],
      ['47891234', 'Diego Salazar Neira', 'Docente', 'Computación e Informática', '', '', ''],
      ['46781233', 'Rosa Quispe Carrillo', 'Externo', '', '', '', '']
    ].map(([dni, nombre, tipo, programa, ciclo, telefono, correo]) => ({ id: id(), dni, nombre, tipo, programa, ciclo, telefono, correo, estado: 'Activo', creado: hace(60).toISOString() }));
    const lib = (t) => L.find((x) => x.titulo.startsWith(t)).id; const lc = (d) => lec.find((x) => x.dni === d).id;
    let n = 0;
    const pr = (titulo, dni, tipo, diasAtras, dias, devAtras) => {
      const f = hace(diasAtras); const vence = finDia(new Date(f.getTime() + dias * DIA));
      const p = { id: id(), codigo: `PR-${pad(++n)}`, libroId: lib(titulo), lectorId: lc(dni), tipo, fecha: f.toISOString(), vence: vence.toISOString(), renovaciones: 0, fechaDevolucion: null, multa: 0, multaPagada: true, obs: '' };
      if (devAtras !== undefined) {
        const dv = hace(devAtras); p.fechaDevolucion = dv.toISOString(); p.estadoEjemplar = 'Bueno';
        p.diasRetraso = Math.max(0, Math.ceil((dv - vence) / DIA)); p.multa = p.diasRetraso * CONFIG_BASE.multaDia; p.multaPagada = p.multa === 0;
      }
      return p;
    };
    const prestamos = [
      pr('Redes de computadoras', '70123456', 'Domicilio', 10, 7),
      pr('Ingeniería del software', '71234501', 'Domicilio', 2, 7),
      pr('Clean Code', '45678912', 'Domicilio', 4, 7),
      pr('Laravel', '45678912', 'Domicilio', 1, 7),
      pr('Matemática básica', '72345610', 'Domicilio', 20, 7, 14),
      pr('Fundamentos de bases', '47891234', 'Domicilio', 15, 7, 5),
      pr('Cien años', '46781233', 'Sala', 1, 0, 1)
    ];
    prestamos[6].fechaDevolucion = new Date(new Date(prestamos[6].fecha).getTime() + 2 * 36e5).toISOString(); prestamos[6].estadoEjemplar = 'Bueno';
    return {
      libros: L, lectores: lec, prestamos,
      reservas: [{ id: id(), codigo: 'RS-0001', libroId: lib('Laravel'), lectorId: lc('71234501'), fecha: hace(0, 5).toISOString(), estado: 'Pendiente' }],
      visitas: [
        { id: id(), lectorId: lc('72345610'), dni: '72345610', nombre: 'Lucía Fernández Salazar', motivo: 'Lectura en sala', ingreso: hace(0, 3).toISOString(), salida: hace(0, 2).toISOString() },
        { id: id(), lectorId: lc('70123456'), dni: '70123456', nombre: 'Kevin Atoche Rojas', motivo: 'Uso de computadoras', ingreso: hace(0, 1).toISOString(), salida: null }
      ],
      constancias: [], config: { ...CONFIG_BASE }, contadores: { libro: L.length, prestamo: n, reserva: 1, constancia: 0 }
    };
  }

  /* ---------- Almacén ---------- */
  function leer() {
    let d; try { d = JSON.parse(localStorage.getItem(CLAVE)); } catch (_) { d = null; }
    if (!d || !Array.isArray(d.libros)) { d = semilla(); escribir(d, false); }
    return d;
  }
  function escribir(d, avisar = true) { localStorage.setItem(CLAVE, JSON.stringify(d)); if (avisar) raiz.dispatchEvent(new CustomEvent('biblio:cambio')); }
  const config = () => ({ ...CONFIG_BASE, ...leer().config });
  const guardarConfig = (c) => { const d = leer(); d.config = { ...config(), ...c }; escribir(d); };

  /* ---------- Consultas ---------- */
  const libros = () => leer().libros; const lectores = () => leer().lectores; const prestamos = () => leer().prestamos; const reservas = () => leer().reservas; const visitas = () => leer().visitas; const constancias = () => leer().constancias;
  const libro = (i) => leer().libros.find((x) => x.id === i) || null;
  const lector = (i) => leer().lectores.find((x) => x.id === i) || null;
  const lectorPorDni = (dni) => leer().lectores.find((x) => x.dni === String(dni).trim()) || null;
  const abierto = (p) => !p.fechaDevolucion;
  const estadoPrestamo = (p) => (p.fechaDevolucion ? 'Devuelto' : new Date(p.vence) < new Date() ? 'Vencido' : 'Vigente');
  const retraso = (p, fin = new Date()) => Math.max(0, Math.ceil((fin - new Date(p.vence)) / DIA));
  const multaPrestamo = (p) => (p.fechaDevolucion ? p.multa || 0 : retraso(p) * config().multaDia);
  const disponibles = (l) => Math.max(0, l.ejemplares - leer().prestamos.filter((p) => p.libroId === l.id && abierto(p)).length);
  function deuda(lectorId) {
    const ps = leer().prestamos.filter((p) => p.lectorId === lectorId);
    const vencidos = ps.filter((p) => estadoPrestamo(p) === 'Vencido');
    const multas = ps.filter((p) => p.fechaDevolucion && p.multa > 0 && !p.multaPagada);
    const total = multas.reduce((s, p) => s + p.multa, 0) + vencidos.reduce((s, p) => s + multaPrestamo(p), 0);
    return { vencidos, multas, vigentes: ps.filter((p) => abierto(p)), total };
  }

  /* ---------- Préstamos ---------- */
  function prestar({ libroId, lectorId, tipo = 'Domicilio', dias }) {
    const d = leer(); const cfg = { ...CONFIG_BASE, ...d.config };
    const l = d.libros.find((x) => x.id === libroId), r = d.lectores.find((x) => x.id === lectorId);
    if (!l || !r) throw new Error('Seleccione un lector y un libro.');
    if (!l.activo) throw new Error('El libro está retirado del catálogo.');
    if (r.estado !== 'Activo') throw new Error('El lector está suspendido.');
    const dd = deuda(lectorId); if (dd.total > 0) throw new Error(`El lector tiene deudas pendientes (S/ ${dd.total.toFixed(2)}). Debe regularizarlas primero.`);
    const abiertos = d.prestamos.filter((p) => p.lectorId === lectorId && abierto(p));
    if (tipo === 'Domicilio' && abiertos.filter((p) => p.tipo === 'Domicilio').length >= cfg.maxLibros) throw new Error(`El lector ya tiene ${cfg.maxLibros} libros a domicilio (máximo permitido).`);
    if (abiertos.some((p) => p.libroId === libroId)) throw new Error('El lector ya tiene este libro en préstamo.');
    if (l.ejemplares - d.prestamos.filter((p) => p.libroId === libroId && abierto(p)).length < 1) throw new Error('No hay ejemplares disponibles. Puede registrar una reserva.');
    const ahora = new Date(); const nDias = tipo === 'Sala' ? 0 : Number(dias) || cfg.diasPrestamo;
    d.contadores.prestamo += 1;
    const p = { id: id(), codigo: `PR-${pad(d.contadores.prestamo)}`, libroId, lectorId, tipo, fecha: ahora.toISOString(), vence: finDia(new Date(ahora.getTime() + nDias * DIA)).toISOString(), renovaciones: 0, fechaDevolucion: null, multa: 0, multaPagada: true, obs: '' };
    d.prestamos.unshift(p);
    d.reservas.filter((x) => x.libroId === libroId && x.lectorId === lectorId && x.estado === 'Pendiente').forEach((x) => { x.estado = 'Atendida'; });
    escribir(d); return p;
  }
  function devolver(pid, { estadoEjemplar = 'Bueno', obs = '' } = {}) {
    const d = leer(); const p = d.prestamos.find((x) => x.id === pid);
    if (!p || p.fechaDevolucion) throw new Error('Este préstamo ya fue devuelto.');
    const cfg = { ...CONFIG_BASE, ...d.config }; const ahora = new Date();
    p.fechaDevolucion = ahora.toISOString(); p.estadoEjemplar = estadoEjemplar; p.obs = obs;
    p.diasRetraso = retraso(p, ahora); p.multa = p.diasRetraso * cfg.multaDia; p.multaPagada = p.multa === 0;
    if (estadoEjemplar === 'Perdido') { const l = d.libros.find((x) => x.id === p.libroId); if (l) l.ejemplares = Math.max(0, l.ejemplares - 1); }
    escribir(d); return p;
  }
  function renovar(pid) {
    const d = leer(); const p = d.prestamos.find((x) => x.id === pid); const cfg = { ...CONFIG_BASE, ...d.config };
    if (!p || p.fechaDevolucion) throw new Error('El préstamo no está vigente.');
    if (p.tipo === 'Sala') throw new Error('Los préstamos en sala no se renuevan.');
    if (estadoPrestamo(p) === 'Vencido') throw new Error('Un préstamo vencido no se puede renovar. Registre la devolución.');
    if ((p.renovaciones || 0) >= cfg.maxRenovaciones) throw new Error('Ya alcanzó el máximo de renovaciones.');
    if (d.reservas.some((x) => x.libroId === p.libroId && x.estado === 'Pendiente' && x.lectorId !== p.lectorId)) throw new Error('Hay una reserva pendiente para este libro.');
    p.vence = finDia(new Date(new Date(p.vence).getTime() + cfg.diasPrestamo * DIA)).toISOString(); p.renovaciones = (p.renovaciones || 0) + 1;
    escribir(d); return p;
  }
  function pagarMulta(pid) {
    const d = leer(); const p = d.prestamos.find((x) => x.id === pid);
    if (!p || !p.fechaDevolucion) throw new Error('Primero debe registrarse la devolución.');
    p.multaPagada = true; p.fechaPago = new Date().toISOString(); escribir(d); return p;
  }

  /* ---------- Reservas ---------- */
  function reservar({ libroId, lectorId }) {
    const d = leer(); const l = d.libros.find((x) => x.id === libroId), r = d.lectores.find((x) => x.id === lectorId);
    if (!l || !r) throw new Error('Seleccione un lector y un libro.');
    if (r.estado !== 'Activo') throw new Error('El lector está suspendido.');
    if (d.reservas.some((x) => x.libroId === libroId && x.lectorId === lectorId && x.estado === 'Pendiente')) throw new Error('El lector ya tiene una reserva pendiente de este libro.');
    d.contadores.reserva += 1;
    const x = { id: id(), codigo: `RS-${pad(d.contadores.reserva)}`, libroId, lectorId, fecha: new Date().toISOString(), estado: 'Pendiente' };
    d.reservas.unshift(x); escribir(d); return x;
  }
  function cancelarReserva(rid) { const d = leer(); const x = d.reservas.find((y) => y.id === rid); if (x) { x.estado = 'Cancelada'; escribir(d); } }

  /* ---------- Catálogo y lectores ---------- */
  function guardarLibro(datos) {
    const d = leer(); let l;
    if (datos.id) {
      l = d.libros.find((x) => x.id === datos.id); if (!l) throw new Error('Libro no encontrado.');
      const prest = d.prestamos.filter((p) => p.libroId === l.id && abierto(p)).length;
      if (Number(datos.ejemplares) < prest) throw new Error(`Hay ${prest} ejemplar(es) prestado(s); no puede dejar menos.`);
      Object.assign(l, datos);
    } else { d.contadores.libro += 1; l = { id: id(), codigo: `LIB-${pad(d.contadores.libro)}`, activo: true, creado: new Date().toISOString(), ...datos }; d.libros.push(l); }
    l.ejemplares = Number(l.ejemplares); l.anio = Number(l.anio) || '';
    escribir(d); return l;
  }
  function retirarLibro(lid, activo) {
    const d = leer(); const l = d.libros.find((x) => x.id === lid); if (!l) return;
    if (!activo && d.prestamos.some((p) => p.libroId === lid && abierto(p))) throw new Error('El libro tiene préstamos vigentes; no se puede retirar todavía.');
    l.activo = activo; escribir(d);
  }
  function guardarLector(datos) {
    const d = leer(); let r;
    if (d.lectores.some((x) => x.dni === datos.dni && x.id !== datos.id)) throw new Error('Ya existe un lector con ese DNI.');
    if (datos.id) { r = d.lectores.find((x) => x.id === datos.id); Object.assign(r, datos); }
    else { r = { id: id(), estado: 'Activo', creado: new Date().toISOString(), ...datos }; d.lectores.push(r); }
    escribir(d); return r;
  }
  function estadoLector(rid, estado) { const d = leer(); const r = d.lectores.find((x) => x.id === rid); if (r) { r.estado = estado; escribir(d); } }

  /* ---------- Visitas y constancias ---------- */
  function registrarVisita({ dni, nombre, motivo }) {
    const d = leer(); const r = d.lectores.find((x) => x.dni === String(dni).trim());
    if (!r && !String(nombre || '').trim()) throw new Error('El DNI no está registrado. Escriba el nombre del visitante.');
    if (r && d.visitas.some((v) => v.lectorId === r.id && !v.salida)) throw new Error('Esta persona ya tiene un ingreso sin salida.');
    d.visitas.unshift({ id: id(), lectorId: r ? r.id : null, dni: String(dni).trim(), nombre: r ? r.nombre : nombre.trim(), motivo, ingreso: new Date().toISOString(), salida: null });
    escribir(d);
  }
  function salidaVisita(vid) { const d = leer(); const v = d.visitas.find((x) => x.id === vid); if (v && !v.salida) { v.salida = new Date().toISOString(); escribir(d); } }
  function emitirConstancia({ dni, nombre, expediente = '' }) {
    const d = leer(); d.contadores.constancia += 1;
    const c = { numero: `BIB-${new Date().getFullYear()}-${pad(d.contadores.constancia, 4)}`, dni, nombre, expediente, fecha: new Date().toISOString() };
    d.constancias.unshift(c); escribir(d); return c;
  }

  /* ---------- Respaldo ---------- */
  const respaldo = () => ({ version: 1, exportado: new Date().toISOString(), datos: leer() });
  function restaurar(o) { if (!o || !o.datos || !Array.isArray(o.datos.libros)) throw new Error('Archivo de respaldo no válido.'); escribir(o.datos); }
  const demo = () => escribir(semilla());
  const vaciar = () => escribir({ libros: [], lectores: [], prestamos: [], reservas: [], visitas: [], constancias: [], config: config(), contadores: { libro: 0, prestamo: 0, reserva: 0, constancia: 0 } });

  raiz.BiblioDatos = {
    CATEGORIAS, TIPOS_LECTOR, MOTIVOS, config, guardarConfig, libros, lectores, prestamos, reservas, visitas, constancias, libro, lector, lectorPorDni,
    estadoPrestamo, retraso, multaPrestamo, disponibles, deuda, prestar, devolver, renovar, pagarMulta, reservar, cancelarReserva,
    guardarLibro, retirarLibro, guardarLector, estadoLector, registrarVisita, salidaVisita, emitirConstancia, respaldo, restaurar, demo, vaciar
  };
})(window);
