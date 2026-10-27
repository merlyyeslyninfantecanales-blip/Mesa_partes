/* Conexión a MySQL (pool de mysql2). Los datos de acceso se leen de ../.env o de variables de entorno. */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Lector mínimo de .env (sin dependencias extra).
function cargarEnv() {
  const archivo = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(archivo)) return;
  fs.readFileSync(archivo, 'utf8').split(/\r?\n/).forEach((linea) => {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !m[1].startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}
cargarEnv();

const configuracion = {
  servidor: process.env.DB_HOST || 'localhost',
  puerto: Number(process.env.DB_PORT || 3306),
  baseDatos: process.env.DB_NAME || 'mesa_partes',
  usuario: process.env.DB_USER || 'root',
  clave: process.env.DB_PASSWORD || ''
};

let pool = null;
function obtenerConexion() {
  if (!pool) {
    pool = mysql.createPool({
      host: configuracion.servidor, port: configuracion.puerto, database: configuracion.baseDatos,
      user: configuracion.usuario, password: configuracion.clave,
      waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4', timezone: 'Z', dateStrings: true, multipleStatements: false
    });
  }
  return pool;
}
// Conexión sin base de datos (la usa el script de inicialización para crearla).
const conexionAdmin = () => mysql.createConnection({
  host: configuracion.servidor, port: configuracion.puerto, user: configuracion.usuario, password: configuracion.clave,
  charset: 'utf8mb4', timezone: 'Z', dateStrings: true, multipleStatements: true
});
const consultar = async (sql, params = []) => (await obtenerConexion().query(sql, params))[0];

module.exports = { configuracion, obtenerConexion, conexionAdmin, consultar };
