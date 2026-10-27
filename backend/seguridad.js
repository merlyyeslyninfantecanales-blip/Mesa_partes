/* Claves con scrypt (sal aleatoria) y sesiones con token aleatorio guardadas en MySQL. */
const crypto = require('crypto');
const { consultar } = require('./conexion');

const hashClave = (clave) => {
  const sal = crypto.randomBytes(16).toString('hex');
  return `${sal}:${crypto.scryptSync(String(clave), sal, 64).toString('hex')}`;
};
function verificarClave(clave, guardado) {
  const [sal, hash] = String(guardado || '').split(':'); if (!sal || !hash) return false;
  const calc = crypto.scryptSync(String(clave), sal, 64); const esperado = Buffer.from(hash, 'hex');
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}
const fechaSQL = (d = new Date()) => d.toISOString().replace('T', ' ').replace('Z', '');
const DURACION_H = Number(process.env.SESION_HORAS || 12);

async function crearSesion(usuario) {
  const token = crypto.randomBytes(32).toString('hex'); const ahora = new Date();
  await consultar('DELETE FROM sesiones WHERE expira < ?', [fechaSQL()]);
  await consultar('INSERT INTO sesiones (token, usuario, creado, expira) VALUES (?,?,?,?)', [token, usuario, fechaSQL(ahora), fechaSQL(new Date(ahora.getTime() + DURACION_H * 3600e3))]);
  return token;
}
async function usuarioDeToken(token) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const f = await consultar('SELECT u.usuario, u.nombre, u.rol, u.dependencia, u.pagina FROM sesiones s JOIN usuarios u ON u.usuario = s.usuario WHERE s.token = ? AND s.expira > ? AND u.activo = 1', [token, fechaSQL()]);
  return f[0] || null;
}
const cerrarSesion = (token) => consultar('DELETE FROM sesiones WHERE token = ?', [token]);

module.exports = { hashClave, verificarClave, crearSesion, usuarioDeToken, cerrarSesion, fechaSQL };
