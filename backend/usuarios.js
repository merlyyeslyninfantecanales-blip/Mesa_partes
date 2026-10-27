/* Cuentas de usuario guardadas en MySQL (claves con scrypt). */
const { consultar } = require('./conexion');
const { verificarClave } = require('./seguridad');

async function autenticar(usuario, clave) {
  const [u] = await consultar('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1', [String(usuario).trim().toLowerCase()]);
  if (!u || !verificarClave(clave, u.clave_hash)) return null;
  const { clave_hash, datos, ...publico } = u; return publico;
}
const listarUsuarios = () => consultar('SELECT usuario, nombre, rol, dependencia, pagina, activo, ultimo_acceso, creado FROM usuarios ORDER BY seq');

module.exports = { autenticar, listarUsuarios };
