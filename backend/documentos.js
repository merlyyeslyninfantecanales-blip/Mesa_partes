/* Consultas de expedientes directamente sobre MySQL (las usa la API y se pueden reutilizar en reportes). */
const { consultar } = require('./conexion');
const { leerColeccion } = require('./colecciones');

const listarDocumentos = () => leerColeccion('expedientes');
async function obtenerDocumento(codigo) { return (await listarDocumentos()).find((d) => d.codigo === codigo) || null; }
const contarPorEstado = () => consultar('SELECT estado, COUNT(*) AS total FROM expedientes GROUP BY estado');
const contarPorArea = () => consultar('SELECT area, COUNT(*) AS total FROM expedientes GROUP BY area');

module.exports = { listarDocumentos, obtenerDocumento, contarPorEstado, contarPorArea };
