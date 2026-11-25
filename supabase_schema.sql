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
  api_key_whatsapp TEXT DEFAULT '7650246'
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

INSERT INTO lecturas_sensor (sucursal_id, temperatura, humedad, hay_luz, created_at) VALUES
  (1, 4.2, 55.0, TRUE, NOW() - INTERVAL '4 minutes'),
  (1, 4.8, 56.0, TRUE, NOW() - INTERVAL '3 minutes'),
  (1, 5.1, 57.0, TRUE, NOW() - INTERVAL '2 minutes'),
  (1, 5.6, 58.0, TRUE, NOW() - INTERVAL '1 minutes'),
  (1, 5.3, 57.5, TRUE, NOW()),
  -- Lecturas extra para que "Farmacia Norte" tampoco salga vacía
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

-- 4) ACCESO ABIERTO PARA DEMO ACADÉMICA -------------------------------
-- RLS desactivado: el ESP32 y la web leen/escriben sin bloqueos.
ALTER TABLE sucursales      DISABLE ROW LEVEL SECURITY;
ALTER TABLE lecturas_sensor DISABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_alerta  DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON sucursales, lecturas_sensor, eventos_alerta TO anon, authenticated;
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
