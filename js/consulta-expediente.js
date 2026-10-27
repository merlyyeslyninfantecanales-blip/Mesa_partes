const formulario = document.querySelector('#formulario-consulta');
const mensaje = document.querySelector('#mensaje-consulta');
const resultado = document.querySelector('#resultado');
const campoRegistro = document.querySelector('#numero-registro');
const botonConsulta = formulario.querySelector('.boton-consultar');
const textoBoton = botonConsulta.querySelector('span');
const limpiarRegistro = document.querySelector('.limpiar-registro');
const contadorRegistro = document.querySelector('.contador-registro');
const normalizar = valor => String(valor || '').trim().toUpperCase();

const actualizarCampo = () => {
  const valor = campoRegistro.value;
  contadorRegistro.textContent = `${valor.length}/100`;
  limpiarRegistro.classList.toggle('visible', Boolean(valor));
  campoRegistro.classList.toggle('valido', /^[A-Z]{2,5}-\d{4}-\d{3,6}$/i.test(valor.trim()));
  campoRegistro.classList.remove('invalido');
};

campoRegistro.addEventListener('input', actualizarCampo);
campoRegistro.addEventListener('blur', () => {
  campoRegistro.value = normalizar(campoRegistro.value);
  actualizarCampo();
});

limpiarRegistro.addEventListener('click', () => {
  campoRegistro.value = '';
  actualizarCampo();
  campoRegistro.focus();
});

document.querySelector('.sugerencia-registro').addEventListener('click', evento => {
  campoRegistro.value = evento.currentTarget.dataset.registro;
  actualizarCampo();
  campoRegistro.focus();
});

botonConsulta.addEventListener('pointerdown', evento => {
  const caja = botonConsulta.getBoundingClientRect();
  botonConsulta.style.setProperty('--onda-x', `${evento.clientX - caja.left}px`);
  botonConsulta.style.setProperty('--onda-y', `${evento.clientY - caja.top}px`);
  botonConsulta.classList.remove('con-onda');
  requestAnimationFrame(() => botonConsulta.classList.add('con-onda'));
});

document.querySelectorAll('.tarjeta-consulta').forEach(tarjeta => {
  tarjeta.addEventListener('pointermove', evento => {
    const caja = tarjeta.getBoundingClientRect();
    tarjeta.style.setProperty('--puntero-x', `${evento.clientX - caja.left}px`);
    tarjeta.style.setProperty('--puntero-y', `${evento.clientY - caja.top}px`);
  });
});

const pieColumnas = document.querySelector('.pie-columnas');
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entrada], observador) => {
    if (entrada.isIntersecting) { pieColumnas.classList.add('visible'); observador.disconnect(); }
  }, { threshold: .15 }).observe(pieColumnas);
} else pieColumnas.classList.add('visible');

function buscarSolicitudes(numero) {
  return new Promise((resolve, reject) => {
    const apertura = indexedDB.open('mesaPartesSolicitudes', 1);
    apertura.onupgradeneeded = () => apertura.result.createObjectStore('solicitudes', { keyPath: 'codigo' });
    apertura.onerror = () => reject(apertura.error);
    apertura.onsuccess = () => {
      const db = apertura.result;
      const peticion = db.transaction('solicitudes').objectStore('solicitudes').openCursor();
      peticion.onerror = () => { db.close(); reject(peticion.error); };
      peticion.onsuccess = () => {
        const cursor = peticion.result;
        if (!cursor) { db.close(); resolve(null); return; }
        if (normalizar(cursor.value.codigo) === numero) { db.close(); resolve(cursor.value); return; }
        cursor.continue();
      };
    };
  });
}
formulario.addEventListener('submit', async evento => {
  evento.preventDefault(); resultado.hidden = true;
  const numero = normalizar(campoRegistro.value);
  mensaje.hidden = false;
  mensaje.className = '';
  if (!numero) { mensaje.textContent = 'Ingrese el número de registro de su expediente.'; mensaje.classList.add('error'); campoRegistro.classList.add('invalido'); campoRegistro.focus(); return; }
  botonConsulta.disabled = true; botonConsulta.classList.add('cargando'); textoBoton.textContent = 'Consultando…'; mensaje.textContent = (window.DBSync && window.DBSync.online ? 'Buscando el expediente en la base de datos…' : 'Buscando el expediente en los registros del navegador…'); mensaje.classList.add('cargando');
  try {
    const enServidor = Boolean(window.DBSync && window.DBSync.online); // Con el servidor encendido se consulta en MySQL.
    let documento;
    if (enServidor) documento = await window.DBSync.consultar(numero);
    else {
      const registros = JSON.parse(localStorage.getItem('documentosMesaPartes') || '[]');
      if (!Array.isArray(registros)) throw new Error('Datos inválidos');
      documento = registros.find(item => item && normalizar(item.codigo) === numero) || await buscarSolicitudes(numero);
    }
    if (!documento) { mensaje.textContent = enServidor ? 'No se encontró un expediente con ese número. Verifique el número de registro completo.' : 'No se encontró un expediente con ese número en este navegador. Verifique el número de registro completo.'; mensaje.className = 'error'; campoRegistro.classList.add('invalido'); return; }
    const lista = document.querySelector('#datos-expediente'); lista.replaceChildren();
    const fecha = documento.fecha ? new Date(documento.fecha) : null;
    const campos = { 'Número de registro': documento.codigo, 'Estado': documento.estado || 'Sin estado registrado', 'Área de atención': documento.area || 'Sin asignar', 'Tipo de documento': documento.tipo || 'No registrado', 'Asunto': documento.asunto || 'No registrado', 'Fecha de registro': fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleString('es-PE') : 'No registrada' };
    Object.entries(campos).forEach(([nombre, valor]) => { const grupo = document.createElement('div'); const titulo = document.createElement('dt'); const dato = document.createElement('dd'); titulo.textContent = nombre; dato.textContent = valor; grupo.append(titulo, dato); lista.append(grupo); });
    document.querySelector('#nota-resultado').textContent = (window.DBSync && window.DBSync.online) ? (documento.estado === 'Pendiente de envío' ? 'Su solicitud fue recibida y está pendiente de recepción por Secretaría.' : 'Información registrada en la base de datos institucional. Se actualiza cada vez que el expediente cambia de estado o de área.') : documento.estado === 'Pendiente de envío' ? 'Este registro se guardó localmente y todavía no tiene recepción institucional.' : 'Se muestra la información guardada en este navegador. El historial de movimientos por oficinas aún no está disponible.';
    mensaje.textContent = 'Expediente encontrado correctamente.'; mensaje.className = 'exito'; resultado.hidden = false;
    requestAnimationFrame(() => resultado.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  } catch { mensaje.textContent = (window.DBSync && window.DBSync.online) ? 'No se pudo consultar la base de datos. Inténtelo nuevamente en unos minutos.' : 'No se pudo consultar el almacenamiento del navegador. Inténtelo nuevamente y verifique sus permisos.'; mensaje.className = 'error'; }
  finally { botonConsulta.disabled = false; botonConsulta.classList.remove('cargando'); textoBoton.textContent = 'Consultar trámite'; }
});

actualizarCampo();
