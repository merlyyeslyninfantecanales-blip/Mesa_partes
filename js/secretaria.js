const formularioDocumento = document.querySelector('#formulario-documento'); // Busca el formulario documental cuando existe.
if (formularioDocumento) formularioDocumento.addEventListener('submit', (evento) => { // Escucha el registro de documentos.
  evento.preventDefault(); // Evita recargar la página.
  const documentos = JSON.parse(localStorage.getItem('documentosMesaPartes') || '[]'); // Recupera registros anteriores.
  const datos = new FormData(formularioDocumento); // Lee los campos del formulario.
  const codigo = `EXP-2026-${String(149 + documentos.length).padStart(4, '0')}`; // Genera el número de expediente.
  documentos.unshift({ codigo, remitente: datos.get('remitente'), asunto: datos.get('asunto'), area: datos.get('area'), estado: 'Pendiente' }); // Construye el registro.
  localStorage.setItem('documentosMesaPartes', JSON.stringify(documentos)); // Guarda el documento en el navegador.
  const mensaje = document.querySelector('#mensaje-documento'); // Obtiene el mensaje de confirmación.
  mensaje.textContent = `Documento registrado correctamente: ${codigo}`; // Informa el código generado.
  mensaje.className = 'mensaje exito visible'; // Muestra la confirmación.
  formularioDocumento.reset(); // Limpia los campos.
}); // Finaliza el registro documental.
const buscador = document.querySelector('#buscar'); // Busca el campo de búsqueda cuando existe.
if (buscador) buscador.addEventListener('input', () => { // Escucha cada búsqueda.
  const texto = buscador.value.toLowerCase(); // Normaliza el texto buscado.
  document.querySelectorAll('tbody tr').forEach((fila) => { fila.style.display = fila.textContent.toLowerCase().includes(texto) ? '' : 'none'; }); // Filtra las filas visibles.
}); // Finaliza la búsqueda.
document.querySelectorAll('.cerrar-sesion').forEach((boton) => boton.addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; })); // Cierra la sesión.
