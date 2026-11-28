-- =====================================================================
-- CENTINELA IOT - Esquema Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase > SQL Editor > New query > RUN
-- Es re-ejecutable: borra y recrea las tablas de la demo.
-- =====================================================================

DROP TABLE IF EXISTS eventos_alerta;
DROP TABLE IF EXISTS lecturas_sensor;
DROP TABLE IF EXISTS sucursales;

-- 1) SUCURSALES -------------------------------------------------------
CREATE TABLE sucursales (
  id               SERIAL PRIMARY KEY,
  nombre           TEXT NOT NULL,
  telefono_alerta  TEXT DEFAULT '+584125002119',
  api_key_whatsapp TEXT DEFAULT '7650246',
  temp_min         FLOAT DEFAULT 2.0,
  temp_max         FLOAT DEFAULT 8.0
);

INSERT INTO sucursales (nombre) VALUES
  ('Bodegón Central'),
  ('Farmacia Norte');

-- 2) LECTURAS DEL SENSOR ----------------------------------------------
CREATE TABLE lecturas_sensor (
  id          BIGSERIAL PRIMARY KEY,
  sucursal_id INT DEFAULT 1,
  temperatura FLOAT,
  humedad     FLOAT,
  hay_luz     BOOLEAN,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Lecturas iniciales solo para el nodo demo "Farmacia Norte" (id = 2);
-- "Bodegón Central" (id = 1) queda limpio para recibir lecturas reales del ESP32 físico.
INSERT INTO lecturas_sensor (sucursal_id, temperatura, humedad, hay_luz, created_at) VALUES
  (2, 3.9, 60.0, TRUE, NOW() - INTERVAL '2 minutes'),
  (2, 4.4, 61.0, TRUE, NOW() - INTERVAL '1 minutes'),
  (2, 4.1, 60.5, TRUE, NOW());

-- 3) EVENTOS DE ALERTA ------------------------------------------------
CREATE TABLE eventos_alerta (
  id              BIGSERIAL PRIMARY KEY,
  sucursal_id     INT DEFAULT 1,
  tipo_evento     TEXT,
  mensaje_enviado TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lecturas_suc_fecha ON lecturas_sensor (sucursal_id, created_at DESC);
CREATE INDEX idx_eventos_suc_fecha  ON eventos_alerta  (sucursal_id, created_at DESC);

-- 4) SEGURIDAD RLS (Row Level Security ACTIVADO) ----------------------
-- - Solo usuarios que inicien sesión con correo y contraseña (rol 'authenticated')
--   pueden VER (SELECT) las sucursales/neveras, lecturas y alertas, o agregar nuevas neveras.
-- - El ESP32 físico (rol 'anon' con la publishable key) tiene permiso únicamente
--   para INSERTAR nuevas lecturas y alertas de telemetría.
ALTER TABLE sucursales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecturas_sensor ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_alerta  ENABLE ROW LEVEL SECURITY;

-- Políticas para sucursales (neveras / nodos ESP32)
CREATE POLICY "Usuarios autenticados ven sucursales"
  ON sucursales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados crean sucursales"
  ON sucursales FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados editan sucursales"
  ON sucursales FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para lecturas_sensor
CREATE POLICY "Usuarios autenticados ven lecturas"
  ON lecturas_sensor FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ESP32 y usuarios autenticados insertan lecturas"
  ON lecturas_sensor FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Políticas para eventos_alerta
CREATE POLICY "Usuarios autenticados ven alertas"
  ON eventos_alerta FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ESP32 y usuarios autenticados insertan alertas"
  ON eventos_alerta FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON sucursales TO authenticated;
GRANT SELECT, INSERT ON lecturas_sensor, eventos_alerta TO authenticated;
GRANT INSERT ON lecturas_sensor, eventos_alerta TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 5) REALTIME (opcional; la web también refresca cada 5 s) -----------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE lecturas_sensor;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE eventos_alerta;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Verificación rápida
SELECT * FROM sucursales;
