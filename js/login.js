const cuentas = {
  ...Object.fromEntries(window.cuentasTemporalesGestores.map(cuenta => [cuenta.usuario, cuenta])),
  estudiante: { clave: '1234', pagina: 'registrar-documento.html' },
  externo: { clave: '1234', pagina: 'registrar-documento.html' }
}; // Define usuarios, claves y destinos.
try { // Aplica los cambios hechos en «Gestión de usuarios» del panel de Administración (altas, claves, cuentas inactivas).
  (JSON.parse(localStorage.getItem('mesaPartes.usuarios.v1')) || []).forEach((u) => {
    if (!u || !u.usuario) return;
    if (u.activo === false) { delete cuentas[u.usuario]; return; }
    cuentas[u.usuario] = { ...(cuentas[u.usuario] || {}), usuario: u.usuario, clave: u.clave, rol: u.rol, dependencia: u.dependencia, pagina: u.pagina };
  });
} catch (error) { /* Sin usuarios guardados: se usan las cuentas base. */ }
const formulario = document.querySelector('#formulario-login'); // Obtiene el formulario de acceso.
const mensaje = document.querySelector('#mensaje-login'); // Obtiene el espacio para errores.
const tipoAcceso = new URLSearchParams(window.location.search).get('acceso') === 'externos' ? 'externos' : 'gestores';
const esExterno = (usuario) => ['externo', 'estudiante'].includes(usuario);
if (tipoAcceso === 'externos' || tipoAcceso === 'gestores') {
  const externos = tipoAcceso === 'externos';
  document.querySelector('.tarjeta-login header h2').textContent = externos ? 'Acceso de usuarios externos' : 'Gestores pedagógicos';
  document.querySelector('.tarjeta-login header p').textContent = externos
    ? 'Ingresa a tu cuenta para presentar documentos y consultar tus solicitudes.'
    : 'Ingresa con tu usuario institucional para acceder al panel de tu área.';
  document.querySelector('.gestores').hidden = externos;
  document.querySelectorAll('[data-usuario]').forEach((boton) => {
    boton.hidden = esExterno(boton.dataset.usuario) !== externos;
  });
  if (!externos) {
    document.body.classList.add('login-gestores');
    document.title = 'Gestores pedagógicos | Sistema de Gestión Documental';
    document.querySelector('.tarjeta-login header h2').textContent = 'Sistema de Gestión Documental';
    document.querySelector('.tarjeta-login header p').textContent = 'Acceso para gestores pedagógicos';
    document.querySelector('.identidad-texto h1').innerHTML = 'Gestión<br>Documental';
    document.querySelector('.separador').hidden = true;
    document.querySelector('.cuentas').hidden = true;
    document.querySelector('.clave-demo').hidden = true;
    document.querySelector('#campo-dependencia').hidden = false;
    document.querySelector('#ayuda-dependencia').hidden = false;
    document.querySelector('.boton-ingresar').innerHTML = 'Ingresar <i data-lucide="log-in"></i>';
    const campoUsuario = document.querySelector('#usuario');
    document.querySelector('label[for="usuario"]').textContent = 'DNI';
    campoUsuario.placeholder = 'Ingrese su DNI';
    campoUsuario.inputMode = 'numeric';
    campoUsuario.maxLength = 8;
    campoUsuario.pattern = '[0-9]{8}';
    const actualizarDependencia = () => {
      const cuenta = cuentas[campoUsuario.value.trim()];
      document.querySelector('#dependencia').value = cuenta?.dependencia || '';
    };
    campoUsuario.addEventListener('input', actualizarDependencia);
    campoUsuario.addEventListener('change', actualizarDependencia);
    window.addEventListener('pageshow', actualizarDependencia);
    actualizarDependencia();
  }
}
formulario.addEventListener('submit', async (evento) => { // Escucha el envío del formulario.
  evento.preventDefault(); // Evita recargar la página.
  const usuario = document.querySelector('#usuario').value.trim().toLowerCase(); // Lee y normaliza el usuario.
  const clave = document.querySelector('#clave').value; // Lee la contraseña.
  const enServidor = Boolean(window.DBSync && window.DBSync.online); // Con el servidor encendido, la cuenta se valida en MySQL.
  let cuenta = cuentas[usuario]; // Busca la cuenta indicada (modo local).
  if (enServidor) {
    const r = await window.DBSync.login(usuario, clave);
    if (!r.ok) { mensaje.textContent = r.error; mensaje.className = 'mensaje error visible'; return; }
    cuenta = r.cuenta;
  } else if (!cuenta || cuenta.clave !== clave) { mensaje.textContent = 'Usuario o contraseña incorrectos.'; mensaje.className = 'mensaje error visible'; return; } // Muestra un error si no coincide.
  if ((tipoAcceso === 'externos' && !esExterno(usuario)) || (tipoAcceso === 'gestores' && esExterno(usuario))) {
    if (enServidor) { try { sessionStorage.removeItem('tokenMesaPartes'); } catch (error) { /* nada */ } }
    mensaje.textContent = 'Esta cuenta corresponde al otro acceso. Regresa al inicio y selecciona el acceso correspondiente.';
    mensaje.className = 'mensaje error visible';
    return;
  }
  try { // Registra el acceso en la bitácora del Administrador y el último acceso del usuario.
    const ahora = new Date().toISOString();
    if (cuenta.rol && !enServidor) { // En modo servidor el acceso ya se registró en MySQL.
      const bit = JSON.parse(localStorage.getItem('mesaPartes.bitacora.v1')) || [];
      bit.push({ fecha: ahora, tipo: 'Accesos', usuario, accion: 'Inicio de sesión', detalle: `${cuenta.rol} · ${cuenta.pagina}` });
      localStorage.setItem('mesaPartes.bitacora.v1', JSON.stringify(bit.slice(-400)));
      const lista = JSON.parse(localStorage.getItem('mesaPartes.usuarios.v1'));
      const u = Array.isArray(lista) && lista.find((x) => x.usuario === usuario);
      if (u) { u.ultimoAcceso = ahora; localStorage.setItem('mesaPartes.usuarios.v1', JSON.stringify(lista)); }
    }
  } catch (error) { /* El registro es opcional. */ }
  sessionStorage.setItem('rolMesaPartes', cuenta.rol || 'Externo');
  sessionStorage.setItem('dependenciaMesaPartes', cuenta.dependencia || '');
  sessionStorage.setItem('usuarioMesaPartes', usuario); // Guarda el usuario durante la sesión.
  window.location.href = cuenta.pagina; // Abre el panel correspondiente.
}); // Finaliza el evento del formulario.
document.querySelectorAll('[data-usuario]').forEach((boton) => { // Recorre los accesos rápidos.
  boton.addEventListener('click', () => { document.querySelector('#usuario').value = boton.dataset.usuario; document.querySelector('#clave').value = '1234'; formulario.requestSubmit(); }); // Completa e inicia sesión.
}); // Finaliza los accesos rápidos.
const botonGestores = document.querySelector('#boton-gestores');
const opcionesGestores = document.querySelector('#opciones-gestores');
botonGestores.addEventListener('click', () => {
  const abierto = botonGestores.getAttribute('aria-expanded') === 'true';
  botonGestores.setAttribute('aria-expanded', String(!abierto));
  opcionesGestores.hidden = abierto;
});
const botonMostrarClave = document.querySelector('#mostrar-clave'); // Obtiene el control de visibilidad de la contraseña.
botonMostrarClave.addEventListener('click', () => { // Alterna entre mostrar y ocultar la contraseña.
  const campoClave = document.querySelector('#clave');
  const mostrar = campoClave.type === 'password';
  campoClave.type = mostrar ? 'text' : 'password';
  botonMostrarClave.setAttribute('aria-pressed', String(mostrar));
  botonMostrarClave.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  botonMostrarClave.innerHTML = `<i data-lucide="${mostrar ? 'eye-off' : 'eye'}"></i>`;
  window.actualizarIconos?.(botonMostrarClave);
});
