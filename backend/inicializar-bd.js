/* Crea la base de datos "mesa_partes", sus tablas y las cuentas iniciales.
   Uso:  npm run db:init        (es seguro ejecutarlo varias veces; no borra datos existentes) */
const fs = require('fs');
const path = require('path');
const { conexionAdmin, configuracion } = require('./conexion');
const { hashClave, fechaSQL } = require('./seguridad');
const cuentas = require('../js/cuentas-temporales');

const NOMBRES = {
  '00000001': 'Secretaría Académica', '00000002': 'Coordinación Académica', '00240130': 'Dirección General',
  '00000004': 'Administración del sistema', '00000005': 'Secretaría', '17528716': 'Bibliotecaria'
};

async function inicializar() {
  const cx = await conexionAdmin();
  try {
    // El esquema trae el nombre "mesa_partes"; se sustituye por el DB_NAME del archivo .env.
    const nombreBD = configuracion.baseDatos.replace(/[^A-Za-z0-9_]/g, '');
    const esquema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8')
      .replace(/CREATE DATABASE IF NOT EXISTS mesa_partes/, `CREATE DATABASE IF NOT EXISTS \`${nombreBD}\``).replace(/USE mesa_partes;/, `USE \`${nombreBD}\`;`);
    await cx.query(esquema);
    await cx.query(`USE \`${configuracion.baseDatos}\``);
    const todas = [
      ...cuentas.map((c) => ({ ...c, nombre: NOMBRES[c.usuario] || c.rol })),
      { usuario: 'estudiante', clave: '1234', rol: 'Externo', dependencia: '', pagina: 'registrar-documento.html', nombre: 'Estudiante' },
      { usuario: 'externo', clave: '1234', rol: 'Externo', dependencia: '', pagina: 'registrar-documento.html', nombre: 'Usuario externo' }
    ];
    let nuevas = 0;
    for (const c of todas) {
      const [r] = await cx.query('INSERT IGNORE INTO usuarios (usuario, nombre, rol, dependencia, pagina, clave_hash, activo, creado, datos) VALUES (?,?,?,?,?,?,1,?,?)',
        [c.usuario, c.nombre, c.rol, c.dependencia, c.pagina, hashClave(c.clave), fechaSQL(), JSON.stringify({ nombre: c.nombre })]);
      nuevas += r.affectedRows;
    }
    const [t] = await cx.query('SHOW TABLES');
    console.log(`Base de datos "${configuracion.baseDatos}" lista en ${configuracion.servidor}:${configuracion.puerto}`);
    console.log(`  Tablas: ${t.length} · cuentas nuevas: ${nuevas}`);
    console.log('  Los expedientes, libros y demás datos de ejemplo se cargan solos la primera vez que se abre un panel.');
  } finally { await cx.end(); }
}
if (require.main === module) inicializar().catch((e) => { console.error('\nNo se pudo inicializar la base de datos:', e.message, '\nRevisa DB_HOST / DB_USER / DB_PASSWORD en el archivo .env y que MySQL esté encendido.'); process.exit(1); });
module.exports = { inicializar };
