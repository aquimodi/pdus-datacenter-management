/*
  # Tabla de umbrales para monitorización

  1. Nueva tabla
    - `thresholds`
      - Almacena los umbrales máximos y mínimos para temperatura y humedad
      - Permite configurar alertas tanto por valores demasiado altos como demasiado bajos
      - Incluye información sobre quién actualizó los umbrales y cuándo
    
  2. Seguridad
    - Habilitar RLS en la tabla de umbrales
    - Políticas para acceso autenticado
    
  3. Datos iniciales
    - Inserta valores predeterminados para los umbrales
*/

-- Crear tabla de umbrales si no existe
CREATE TABLE IF NOT EXISTS thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  min_temp DECIMAL(5,2) NOT NULL DEFAULT 18.0,
  max_temp DECIMAL(5,2) NOT NULL DEFAULT 32.0,
  min_humidity DECIMAL(5,2) NOT NULL DEFAULT 40.0,
  max_humidity DECIMAL(5,2) NOT NULL DEFAULT 70.0,
  max_power_single_phase DECIMAL(5,2) NOT NULL DEFAULT 16.0,
  max_power_three_phase DECIMAL(5,2) NOT NULL DEFAULT 48.0,
  updated_by uuid REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(name)
);

-- Habilitar Row Level Security
ALTER TABLE thresholds ENABLE ROW LEVEL SECURITY;

-- Crear políticas
CREATE POLICY "Permitir lectura a todos los usuarios autenticados"
  ON thresholds FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Permitir actualización a administradores y gestores"
  ON thresholds FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND raw_user_meta_data->>'role' IN ('Manager', 'Admin')
    )
  );

-- Actualizar la tabla de problemas para referenciar el tipo de alerta
DO $$
BEGIN
  -- Añadir campo alert_type si no existe
  IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'problems' AND column_name = 'alert_type'
  ) THEN
    ALTER TABLE problems 
    ADD COLUMN alert_type VARCHAR(10) CHECK (alert_type IN ('high', 'low'));
  END IF;
END $$;

-- Insertar valores predeterminados
INSERT INTO thresholds (name, min_temp, max_temp, min_humidity, max_humidity, max_power_single_phase, max_power_three_phase)
VALUES ('global', 18.0, 32.0, 40.0, 70.0, 16.0, 48.0)
ON CONFLICT (name) DO UPDATE SET 
  min_temp = EXCLUDED.min_temp,
  max_temp = EXCLUDED.max_temp,
  min_humidity = EXCLUDED.min_humidity,
  max_humidity = EXCLUDED.max_humidity,
  max_power_single_phase = EXCLUDED.max_power_single_phase,
  max_power_three_phase = EXCLUDED.max_power_three_phase,
  updated_at = now();

-- Crear trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_thresholds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_thresholds_updated_at
  BEFORE UPDATE ON thresholds
  FOR EACH ROW
  EXECUTE FUNCTION update_thresholds_updated_at();