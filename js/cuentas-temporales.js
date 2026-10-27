// DNI ficticios para pruebas locales. Sustituir estas cuentas antes de un uso real.
(function (raiz) {
  const cuentas = [
    { usuario: '00000001', clave: '00000001', rol: 'Secretaría Académica', dependencia: 'Secretaría Académica', pagina: 'secretaria.html' },
    { usuario: '00000002', clave: '00000002', rol: 'Coordinación', dependencia: 'Coordinación', pagina: 'coordinadora.html' },
    { usuario: '00240130', clave: '00240130', rol: 'Dirección', dependencia: 'Dirección', pagina: 'direccion.html' },
    { usuario: '00000004', clave: '00000004', rol: 'Administración', dependencia: 'Administración', pagina: 'administrador.html' },
    { usuario: '17528716', clave: '17528716', rol: 'Biblioteca', dependencia: 'Biblioteca', pagina: 'bibliotecaria.html' },
    { usuario: '00000005', clave: '00000005', rol: 'Secretaría', dependencia: 'Secretaría', pagina: 'secretaria.html' },
    { usuario: '00201084', clave: '00201084', rol: 'Secretaría', dependencia: 'Secretaría', pagina: 'secretaria.html' }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = cuentas;
  else raiz.cuentasTemporalesGestores = cuentas;
})(typeof window !== 'undefined' ? window : globalThis);
