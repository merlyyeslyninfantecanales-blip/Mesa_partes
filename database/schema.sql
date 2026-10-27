-- =====================================================================
--  Sistema Mesa de Partes · IESTP CMVO Zorritos
--  Esquema MySQL / MariaDB   (base de datos: mesa_partes)
--  Se crea automáticamente con:  npm run db:init
--  También puedes importarlo a mano:  mysql -u root -p < database/schema.sql
-- =====================================================================
CREATE DATABASE IF NOT EXISTS mesa_partes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mesa_partes;

-- ---------- Cuentas y sesiones ----------
CREATE TABLE IF NOT EXISTS usuarios (
  usuario        VARCHAR(40)  NOT NULL PRIMARY KEY,
  nombre         VARCHAR(160) NOT NULL DEFAULT '',
  rol            VARCHAR(60)  NOT NULL DEFAULT '',
  dependencia    VARCHAR(80)  NOT NULL DEFAULT '',
  pagina         VARCHAR(80)  NOT NULL DEFAULT '',
  clave_hash     VARCHAR(255) NOT NULL DEFAULT '',   -- scrypt (salt:hash), nunca la clave en texto
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acceso  DATETIME(3)  NULL,
  creado         DATETIME(3)  NULL,
  datos          LONGTEXT     NULL,
  seq            BIGINT       NOT NULL AUTO_INCREMENT UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sesiones (
  token    CHAR(64)    NOT NULL PRIMARY KEY,
  usuario  VARCHAR(40) NOT NULL,
  creado   DATETIME(3) NOT NULL,
  expira   DATETIME(3) NOT NULL,
  INDEX (usuario), INDEX (expira),
  CONSTRAINT fk_ses_usuario FOREIGN KEY (usuario) REFERENCES usuarios(usuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------- Expedientes (Mesa de Partes) ----------
CREATE TABLE IF NOT EXISTS expedientes (
  codigo        VARCHAR(30)  NOT NULL PRIMARY KEY,   -- EXP-2026-0150
  remitente     VARCHAR(200) NOT NULL DEFAULT '',
  dni           VARCHAR(20)  NOT NULL DEFAULT '',
  correo        VARCHAR(160) NOT NULL DEFAULT '',
  tipo          VARCHAR(40)  NOT NULL DEFAULT '',
  asunto        VARCHAR(400) NOT NULL DEFAULT '',
  canal         VARCHAR(40)  NOT NULL DEFAULT '',
  area          VARCHAR(80)  NOT NULL DEFAULT '',
  prioridad     VARCHAR(20)  NOT NULL DEFAULT '',
  estado        VARCHAR(30)  NOT NULL DEFAULT 'Pendiente',
  plazo         DATETIME(3)  NULL,
  portal_codigo VARCHAR(80)  NULL,
  fecha         DATETIME(3)  NOT NULL,
  datos         LONGTEXT     NULL,                   -- resto de campos (adjuntos, notas, folios…)
  seq           BIGINT       NOT NULL AUTO_INCREMENT UNIQUE,
  INDEX (estado), INDEX (area), INDEX (fecha), INDEX (dni)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos (          -- historial de cada expediente
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  expediente   VARCHAR(30)  NOT NULL,
  firma        CHAR(40)     NOT NULL,              -- evita duplicados al sincronizar
  fecha        DATETIME(3)  NOT NULL,
  accion       VARCHAR(40)  NOT NULL DEFAULT '',
  detalle      TEXT         NULL,
  responsable  VARCHAR(120) NOT NULL DEFAULT '',
  datos        LONGTEXT     NULL,
  UNIQUE KEY uq_mov (expediente, firma),
  INDEX (fecha),
  CONSTRAINT fk_mov_exp FOREIGN KEY (expediente) REFERENCES expedientes(codigo) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------- Archivos adjuntos (el contenido va a backend/uploads) ----------
CREATE TABLE IF NOT EXISTS archivos (
  id       VARCHAR(60)  NOT NULL PRIMARY KEY,
  nombre   VARCHAR(255) NOT NULL,
  tipo     VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
  tam      BIGINT       NOT NULL DEFAULT 0,
  ruta     VARCHAR(255) NOT NULL,
  origen   VARCHAR(20)  NOT NULL DEFAULT 'panel',   -- panel | portal
  creado   DATETIME(3)  NOT NULL
) ENGINE=InnoDB;

-- ---------- Solicitudes enviadas desde el portal externo ----------
CREATE TABLE IF NOT EXISTS solicitudes_portal (
  codigo      VARCHAR(80)  NOT NULL PRIMARY KEY,   -- LOCAL-2026-uuid (número de registro)
  remitente   VARCHAR(200) NOT NULL DEFAULT '',
  dni         VARCHAR(20)  NOT NULL DEFAULT '',
  correo      VARCHAR(160) NOT NULL DEFAULT '',
  asunto      VARCHAR(400) NOT NULL DEFAULT '',
  tipo        VARCHAR(40)  NOT NULL DEFAULT '',
  estado      VARCHAR(120) NOT NULL DEFAULT 'Pendiente de envío',
  area        VARCHAR(80)  NOT NULL DEFAULT '',
  expediente  VARCHAR(30)  NULL,
  fecha       DATETIME(3)  NOT NULL,
  archivo_id  VARCHAR(60)  NULL,
  anexos      LONGTEXT     NULL,                   -- ids de archivos anexos (JSON)
  datos       LONGTEXT     NULL,
  INDEX (estado), INDEX (fecha)
) ENGINE=InnoDB;

-- ---------- Configuración y bitácora ----------
CREATE TABLE IF NOT EXISTS configuracion (
  clave       VARCHAR(80) NOT NULL PRIMARY KEY,
  valor       LONGTEXT    NULL,
  actualizado DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bitacora (
  id       VARCHAR(40)  NOT NULL PRIMARY KEY,
  fecha    DATETIME(3)  NOT NULL,
  tipo     VARCHAR(40)  NOT NULL DEFAULT '',
  usuario  VARCHAR(60)  NOT NULL DEFAULT '',
  accion   VARCHAR(120) NOT NULL DEFAULT '',
  detalle  TEXT         NULL,
  seq      BIGINT       NOT NULL AUTO_INCREMENT UNIQUE,
  INDEX (fecha), INDEX (tipo)
) ENGINE=InnoDB;

-- ---------- Biblioteca ----------
CREATE TABLE IF NOT EXISTS libros (
  id VARCHAR(40) NOT NULL PRIMARY KEY, codigo VARCHAR(30), titulo VARCHAR(300) NOT NULL DEFAULT '', autor VARCHAR(200) NOT NULL DEFAULT '',
  categoria VARCHAR(80) NOT NULL DEFAULT '', ejemplares INT NOT NULL DEFAULT 1, activo TINYINT(1) NOT NULL DEFAULT 1,
  datos LONGTEXT, seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE, INDEX (codigo), INDEX (titulo(100))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lectores (
  id VARCHAR(40) NOT NULL PRIMARY KEY, dni VARCHAR(20) NOT NULL DEFAULT '', nombre VARCHAR(200) NOT NULL DEFAULT '',
  tipo VARCHAR(40) NOT NULL DEFAULT '', estado VARCHAR(30) NOT NULL DEFAULT 'Activo',
  datos LONGTEXT, seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE, INDEX (dni)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS prestamos (
  id VARCHAR(40) NOT NULL PRIMARY KEY, codigo VARCHAR(30), libro_id VARCHAR(40), lector_id VARCHAR(40), tipo VARCHAR(30) NOT NULL DEFAULT '',
  fecha DATETIME(3) NULL, vence DATETIME(3) NULL, fecha_devolucion DATETIME(3) NULL,
  datos LONGTEXT, seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE, INDEX (libro_id), INDEX (lector_id), INDEX (fecha_devolucion)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservas (
  id VARCHAR(40) NOT NULL PRIMARY KEY, codigo VARCHAR(30), libro_id VARCHAR(40), lector_id VARCHAR(40), estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
  fecha DATETIME(3) NULL, datos LONGTEXT, seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS visitas (
  id VARCHAR(40) NOT NULL PRIMARY KEY, lector_id VARCHAR(40), dni VARCHAR(20) NOT NULL DEFAULT '', nombre VARCHAR(200) NOT NULL DEFAULT '',
  motivo VARCHAR(80) NOT NULL DEFAULT '', ingreso DATETIME(3) NULL, salida DATETIME(3) NULL,
  datos LONGTEXT, seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE, INDEX (ingreso)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS constancias (
  id VARCHAR(40) NOT NULL PRIMARY KEY, codigo VARCHAR(30), lector_id VARCHAR(40), fecha DATETIME(3) NULL,
  datos LONGTEXT, seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE
) ENGINE=InnoDB;
