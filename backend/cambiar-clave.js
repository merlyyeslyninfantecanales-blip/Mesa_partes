/* Cambia la contraseña de una cuenta del sistema (la guarda cifrada, como espera el login).
   Uso:  node backend/cambiar-clave.js <usuario> <nueva_clave>
   Ej.:  node backend/cambiar-clave.js 00201084 00201084
   Nota: si editas "clave_hash" a mano en phpMyAdmin con una clave en texto, el login falla; use este script. */
const { consultar } = require('./conexion');
const { hashClave } = require('./seguridad');

async function main() {
  const [usuario, clave] = process.argv.slice(2);
  if (!usuario || !clave) { console.log('Uso: node backend/cambiar-clave.js <usuario> <nueva_clave>'); process.exit(1); }
  const [fila] = await consultar('SELECT usuario, nombre, rol, activo FROM usuarios WHERE usuario = ?', [usuario.trim().toLowerCase()]);
  if (!fila) { console.log(`No existe el usuario "${usuario}". Revise la columna "usuario" en la tabla usuarios.`); process.exit(1); }
  await consultar('UPDATE usuarios SET clave_hash = ?, activo = 1 WHERE usuario = ?', [hashClave(clave), fila.usuario]);
  await consultar('DELETE FROM sesiones WHERE usuario = ?', [fila.usuario]);
  console.log(`Listo: ${fila.usuario} (${fila.nombre} · ${fila.rol}) ya puede ingresar con la nueva contraseña.`);
  process.exit(0);
}
main().catch((e) => { console.error('No se pudo cambiar la clave:', e.message); process.exit(1); });
