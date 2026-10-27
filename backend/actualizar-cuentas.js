/* Pasa las cuentas de Dirección y Biblioteca a sus DNI nuevos (usuario = clave). Se ejecuta solo al hacer "npm start"; no falla si ya están actualizadas. */
const { consultar } = require('./conexion');
const { hashClave } = require('./seguridad');
const CAMBIOS = [
  { viejo: '00000003', nuevo: '00240130' },   // Dirección
  { viejo: '00000006', nuevo: '17528716' }    // Biblioteca
];
async function main() {
  for (const c of CAMBIOS) {
    const [yaNuevo] = await consultar('SELECT usuario FROM usuarios WHERE usuario = ?', [c.nuevo]);
    if (!yaNuevo) {
      const [viejo] = await consultar('SELECT usuario FROM usuarios WHERE usuario = ?', [c.viejo]);
      if (!viejo) continue;
      await consultar('UPDATE usuarios SET usuario = ? WHERE usuario = ?', [c.nuevo, c.viejo]);
    }
    await consultar('UPDATE usuarios SET clave_hash = ?, activo = 1 WHERE usuario = ?', [hashClave(c.nuevo), c.nuevo]);
    await consultar('DELETE FROM sesiones WHERE usuario = ?', [c.nuevo]);
    console.log(`Cuenta ${c.nuevo} lista.`);
  }
  process.exit(0);
}
main().catch((e) => { console.log('Aviso (cuentas):', e.message); process.exit(0); });
