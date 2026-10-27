const formularioDocumento = document.querySelector('#formulario-documento');
const principal = document.querySelector('#archivo');
const anexos = document.querySelector('#anexos');
const mensaje = document.querySelector('#mensaje-documento');
let archivoPrincipal = null;
let archivosAnexos = [];
let codigo = '';
const informar = (texto, error = true) => { mensaje.textContent = texto; mensaje.className = `mensaje ancho visible ${error ? 'error' : 'exito'}`; };
function dibujarCodigo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const numeros = crypto.getRandomValues(new Uint32Array(5));
  codigo = Array.from(numeros, n => alfabeto[n % alfabeto.length]).join('');
  const ctx = document.querySelector('#captcha').getContext('2d');
  ctx.fillStyle = '#f6ecef'; ctx.fillRect(0, 0, 150, 44);
  ctx.font = 'italic bold 25px Arial'; ctx.fillStyle = '#5a2333';
  ctx.fillText(codigo, 13, 31);
  document.querySelector('#codigo-imagen').value = '';
}
function renderizar(archivos, selector, eliminar) {
  const cuerpo = document.querySelector(selector); cuerpo.replaceChildren();
  if (!archivos.length) { const fila = cuerpo.insertRow(); const celda = fila.insertCell(); celda.colSpan = 4; celda.textContent = 'No ha seleccionado ningún archivo.'; return; }
  archivos.forEach((archivo, indice) => {
    const fila = cuerpo.insertRow();
    [archivo.name, archivo.name.split('.').pop().toUpperCase(), `${(archivo.size / 1024 / 1024).toFixed(2)} MB`].forEach(texto => { fila.insertCell().textContent = texto; });
    const boton = document.createElement('button'); boton.type = 'button'; boton.textContent = 'Eliminar'; boton.setAttribute('aria-label', `Eliminar ${archivo.name}`); boton.addEventListener('click', () => eliminar(indice)); fila.insertCell().append(boton);
  });
}
function actualizarArchivos() {
  renderizar(archivoPrincipal ? [archivoPrincipal] : [], '#lista-principal', () => { archivoPrincipal = null; principal.value = ''; actualizarArchivos(); });
  renderizar(archivosAnexos, '#lista-anexos', indice => { archivosAnexos.splice(indice, 1); actualizarArchivos(); });
}
principal.addEventListener('change', () => {
  const archivo = principal.files[0]; if (!archivo) return;
  if (!/\.pdf$/i.test(archivo.name) || archivo.size > 50 * 1024 * 1024 || !archivo.size) { principal.value = ''; informar('El documento principal debe ser un PDF no vacío de hasta 50 MB.'); return; }
  archivoPrincipal = archivo; mensaje.className = 'mensaje ancho'; actualizarArchivos();
});
anexos.addEventListener('change', () => {
  const nuevos = Array.from(anexos.files); anexos.value = '';
  if (nuevos.some(a => !/\.(pdf|doc|docx|jpg|jpeg)$/i.test(a.name) || a.size > 20 * 1024 * 1024 || !a.size)) { informar('Los anexos deben ser PDF, Word o JPG no vacíos de hasta 20 MB por archivo.'); return; }
  archivosAnexos.push(...nuevos); mensaje.className = 'mensaje ancho'; actualizarArchivos();
});
document.querySelector('#asunto').addEventListener('input', evento => { document.querySelector('#caracteres').textContent = `${900 - evento.target.value.length} caracteres restantes`; });
document.querySelector('#renovar-codigo').addEventListener('click', dibujarCodigo);
// Guarda los datos y los archivos juntos en el navegador; no representa un envío a la institución.
function guardarLocal(documento) {
  return new Promise((resolve, reject) => {
    const apertura = indexedDB.open('mesaPartesSolicitudes', 1);
    apertura.onupgradeneeded = () => apertura.result.createObjectStore('solicitudes', { keyPath: 'codigo' });
    apertura.onerror = () => reject(apertura.error);
    apertura.onsuccess = () => {
      const db = apertura.result;
      const transaccion = db.transaction('solicitudes', 'readwrite');
      transaccion.objectStore('solicitudes').add(documento);
      transaccion.oncomplete = () => { db.close(); resolve(); };
      transaccion.onabort = () => { db.close(); reject(transaccion.error); };
      transaccion.onerror = () => { db.close(); reject(transaccion.error); };
    };
  });
}
formularioDocumento.addEventListener('submit', async evento => {
  evento.preventDefault();
  // Validaciones del formulario (mismo estilo de mensajes que el ejemplo de registro).
  const nombreCompleto = ['nombres', 'apellido-paterno', 'apellido-materno'].map(id => document.getElementById(id).value.trim()).join(' ').trim();
  const correo = document.getElementById('correo').value.trim();
  if (nombreCompleto.length < 3) { informar('Error: ingresa al menos 3 caracteres en el nombre.'); document.getElementById('nombres').focus(); return; }
  if (!correo) { informar('Error: el correo electrónico es obligatorio.'); document.getElementById('correo').focus(); return; }
  if (!document.getElementById('correo').checkValidity()) { informar('Error: ingresa un correo electrónico válido.'); document.getElementById('correo').focus(); return; }
  if (!archivoPrincipal) { informar('Seleccione el documento principal en formato PDF.'); principal.focus(); return; }
  if (document.querySelector('#codigo-imagen').value.trim().toUpperCase() !== codigo) { informar('El código de imagen no coincide. Inténtelo con el nuevo código.'); dibujarCodigo(); document.querySelector('#codigo-imagen').focus(); return; }
  const boton = formularioDocumento.querySelector('[type="submit"]'); boton.disabled = true; boton.textContent = 'Guardando…';
  try {
    const datos = Object.fromEntries(new FormData(formularioDocumento)); delete datos.archivo; delete datos.anexos;
    if (window.DBSync && window.DBSync.online) { // Con el servidor encendido la solicitud y sus archivos se guardan en MySQL.
      const registro = await window.DBSync.enviarSolicitud(datos, archivoPrincipal, archivosAnexos);
      informar(`Solicitud enviada a la Secretaría. Su número de registro es ${registro}. Consérvelo para consultar el expediente.`, false);
      formularioDocumento.reset(); archivoPrincipal = null; archivosAnexos = []; actualizarArchivos(); dibujarCodigo(); document.querySelector('#caracteres').textContent = '900 caracteres restantes';
      return;
    }
    const identificador = `LOCAL-${new Date().getFullYear()}-${crypto.randomUUID()}`;
    await guardarLocal({ ...datos, codigo: identificador, remitente: `${datos.nombres} ${datos['apellido-paterno']} ${datos['apellido-materno']}`, fecha: new Date().toISOString(), estado: 'Pendiente de envío', archivo: archivoPrincipal, anexos: archivosAnexos });
    informar(`Solicitud enviada a la Secretaría. Su número de registro es ${identificador}. Consérvelo para consultar el expediente.`, false);
    formularioDocumento.reset(); archivoPrincipal = null; archivosAnexos = []; actualizarArchivos(); dibujarCodigo(); document.querySelector('#caracteres').textContent = '900 caracteres restantes';
  } catch (error) { if (window.DBSync && window.DBSync.online) { informar(error.message || 'No se pudo enviar la solicitud. Inténtelo nuevamente; sus datos siguen en el formulario.'); return; } informar('No se pudo guardar la solicitud. Verifique el espacio disponible y los permisos del navegador. Sus datos siguen en el formulario.'); }
  finally { boton.disabled = false; boton.textContent = 'Enviar expediente'; mensaje.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});
actualizarArchivos(); dibujarCodigo();
// Aviso: sin servidor el documento llega a la bandeja de la Secretaría solo en este mismo navegador.
if (!(window.DBSync && window.DBSync.online)) informar('Modo local: el documento llegará a la bandeja de la Secretaría solo si ella abre el sistema en este mismo navegador. Para recibirlo desde otros equipos, inicie el servidor (npm start → http://localhost:3001).', false);
