/*
  # Datacenter Operations Database Schema

  1. New Tables
    - `racks`
      - Basic rack information and configuration
      - Stores rack metadata, power limits, and maintenance status
    
    - `sensor_readings`
      - Historical sensor data for each rack
      - Stores temperature, humidity, and power readings
    
    - `problems`
      - Tracks current and historical problems/alerts
      - Links to racks and includes alert metadata
    
  2. Security
    - Enable RLS on all tables
    - Policies for authenticated access
    
  3. Notes
    - Timestamps use timestamptz for timezone awareness
    - Foreign key constraints ensure data integrity
    - Indexes optimize common queries
*/

-- Create racks table
CREATE TABLE IF NOT EXISTS racks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  site text NOT NULL,
  datacenter text NOT NULL,
  maintenance boolean DEFAULT false,
  max_power numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(name)
);

-- Create sensor_readings table
CREATE TABLE IF NOT EXISTS sensor_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id uuid NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  temperature numeric(5,2),
  humidity numeric(5,2),
  total_power numeric(10,2),
  total_current numeric(10,2),
  total_voltage numeric(10,2),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT temperature_range CHECK (temperature >= -50 AND temperature <= 100),
  CONSTRAINT humidity_range CHECK (humidity >= 0 AND humidity <= 100)
);

-- Create problems table
CREATE TABLE IF NOT EXISTS problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id uuid NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('Temperature', 'Humidity', 'Power')),
  value text NOT NULL,
  threshold text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'acknowledged')),
  resolved_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_racks_site_dc ON racks(site, datacenter);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_rack_time ON sensor_readings(rack_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_problems_rack_status ON problems(rack_id, status);
CREATE INDEX IF NOT EXISTS idx_problems_type_status ON problems(type, status);

-- Enable Row Level Security
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated read access to racks"
  ON racks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access to sensor readings"
  ON sensor_readings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access to problems"
  ON problems FOR SELECT TO authenticated
  USING (true);

-- Allow managers and admins to update racks
CREATE POLICY "Allow managers and admins to update racks"
  ON racks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND raw_user_meta_data->>'role' IN ('Manager', 'Admin')
    )
  );

-- Allow managers and admins to acknowledge problems
CREATE POLICY "Allow managers and admins to update problems"
  ON problems FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND raw_user_meta_data->>'role' IN ('Manager', 'Admin')
    )
  );

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_racks_updated_at
  BEFORE UPDATE ON racks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_problems_updated_at
  BEFORE UPDATE ON problems
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();