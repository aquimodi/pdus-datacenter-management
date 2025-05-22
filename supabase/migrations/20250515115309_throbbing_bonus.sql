/*
  # Database Schema Update Script
  
  1. Updates
    - Add "phase" column to racks table
    - Add additional columns to sensor_readings table to match new API format
    - Update indexes to optimize new API structure
    
  2. Notes
    - All changes use IF NOT EXISTS checks to prevent errors on reexecution
    - No data is deleted, existing data is preserved
    - New columns match the fields from the new API format 
*/

-- Use the QEIS1DAT database
USE QEIS1DAT;
GO

-- Add 'phase' column to racks table if it doesn't exist
IF NOT EXISTS (
  SELECT * FROM sys.columns 
  WHERE name = 'phase' AND object_id = OBJECT_ID('dbo.racks')
)
BEGIN
  ALTER TABLE [dbo].[racks]
  ADD [phase] NVARCHAR(20) NULL;
  
  PRINT 'Added phase column to racks table.';
END
ELSE
BEGIN
  PRINT 'phase column already exists in racks table.';
END
GO

-- Add capacityAmps column to racks table
IF NOT EXISTS (
  SELECT * FROM sys.columns 
  WHERE name = 'capacity_amps' AND object_id = OBJECT_ID('dbo.racks')
)
BEGIN
  ALTER TABLE [dbo].[racks]
  ADD [capacity_amps] DECIMAL(10,2) NULL;
  
  PRINT 'Added capacity_amps column to racks table.';
END
ELSE
BEGIN
  PRINT 'capacity_amps column already exists in racks table.';
END
GO

-- Add average voltage field to sensor_readings table
IF NOT EXISTS (
  SELECT * FROM sys.columns 
  WHERE name = 'avg_voltage' AND object_id = OBJECT_ID('dbo.sensor_readings')
)
BEGIN
  ALTER TABLE [dbo].[sensor_readings]
  ADD [avg_voltage] DECIMAL(10,2) NULL;
  
  PRINT 'Added avg_voltage column to sensor_readings table.';
END
ELSE
BEGIN
  PRINT 'avg_voltage column already exists in sensor_readings table.';
END
GO

-- Create a new view for power data that matches the new API structure
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_power_data')
BEGIN
  EXEC('
  CREATE VIEW [dbo].[vw_power_data] AS
  SELECT 
    r.[id],
    r.[id] AS rackId,
    r.[name] AS rackName,
    r.[site],
    r.[datacenter] AS dc,
    r.[maintenance],
    r.[phase],
    r.[capacity_amps] AS capacityAmps,
    r.[max_power] AS capacityKw,
    sr.[total_voltage] AS totalVolts,
    sr.[avg_voltage] AS avgVolts,
    sr.[total_current] AS totalAmps,
    sr.[total_power] * 1000 AS totalWatts,
    sr.[total_power] AS totalKw,
    NULL AS totalKwh,
    NULL AS totalVa,
    NULL AS totalkVa,
    NULL AS totalPf,
    0 AS powerFail,
    sr.[created_at] AS lastUpdate,
    ''OK'' AS rstatus
  FROM [dbo].[racks] r
  LEFT JOIN [dbo].[sensor_readings] sr ON r.[id] = sr.[rack_id]
  WHERE sr.[id] IN (
    SELECT MAX(id)
    FROM [dbo].[sensor_readings]
    GROUP BY rack_id
  )
  ');
  
  PRINT 'Created power data view.';
END
ELSE
BEGIN
  PRINT 'Power data view already exists.';
END
GO

-- Create a new view for sensor data that matches the new API structure
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_sensor_data')
BEGIN
  EXEC('
  CREATE VIEW [dbo].[vw_sensor_data] AS
  SELECT 
    sr.[id],
    NULL AS nodeId,
    NULL AS sensorIndex,
    ''wired'' AS sensorType,
    NULL AS planId,
    sr.[rack_id] AS rackId,
    r.[name] AS name,
    r.[name] AS rackName,
    ''front'' AS position,
    ''middle'' AS level,
    r.[site],
    r.[datacenter] AS dc,
    sr.[temperature],
    sr.[humidity],
    sr.[created_at] AS lastUpdate,
    ''Online'' AS status
  FROM [dbo].[sensor_readings] sr
  JOIN [dbo].[racks] r ON sr.[rack_id] = r.[id]
  WHERE sr.[id] IN (
    SELECT MAX(id)
    FROM [dbo].[sensor_readings]
    GROUP BY rack_id
  )
  ');
  
  PRINT 'Created sensor data view.';
END
ELSE
BEGIN
  PRINT 'Sensor data view already exists.';
END
GO

-- Create a stored procedure to update the phase field in the racks table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_update_rack_phase')
BEGIN
  EXEC('
  CREATE PROCEDURE [dbo].[sp_update_rack_phase]
  AS
  BEGIN
    SET NOCOUNT ON;
    
    -- Update phase based on L2 and L3 voltage values
    -- If L2 and L3 voltages are NULL, it''s a Single Phase rack
    -- Otherwise, it''s a 3-Phase rack
    UPDATE r
    SET r.[phase] = 
      CASE 
        WHEN (sr.l2_voltage IS NULL AND sr.l3_voltage IS NULL) THEN ''Single Phase''
        ELSE ''3-Phase''
      END
    FROM [dbo].[racks] r
    JOIN [dbo].[sensor_readings] sr ON r.[id] = sr.[rack_id]
    WHERE r.[phase] IS NULL
    AND sr.[id] IN (
      SELECT MAX(id)
      FROM [dbo].[sensor_readings]
      GROUP BY rack_id
    );
    
    -- For any remaining racks without phase info, default to Single Phase
    UPDATE [dbo].[racks]
    SET [phase] = ''Single Phase''
    WHERE [phase] IS NULL;
    
    -- Return the number of updated records
    SELECT 
      SUM(CASE WHEN [phase] = ''Single Phase'' THEN 1 ELSE 0 END) AS SinglePhaseCount,
      SUM(CASE WHEN [phase] = ''3-Phase'' THEN 1 ELSE 0 END) AS ThreePhaseCount
    FROM [dbo].[racks];
  END
  ');
  
  PRINT 'Created procedure to update rack phases.';
END
ELSE
BEGIN
  PRINT 'Rack phase update procedure already exists.';
END
GO

-- Execute the phase update procedure
EXEC [dbo].[sp_update_rack_phase];
GO

-- Create an index on phase column for efficient filtering
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_racks_phase' AND object_id = OBJECT_ID('dbo.racks'))
BEGIN
  CREATE INDEX [IX_racks_phase] ON [dbo].[racks] ([phase]);
  PRINT 'Created index on phase column in racks table.';
END
ELSE
BEGIN
  PRINT 'Index on phase column already exists.';
END
GO

PRINT 'Database schema update completed successfully.';
GO