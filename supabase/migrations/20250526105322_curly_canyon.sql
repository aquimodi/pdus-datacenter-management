/*
  # Remove Demo Mode Migration

  This migration adds functionality to support the removal of demo mode from the application.
  No changes are made to existing tables, but we ensure that views and stored procedures
  are updated to work without demo mode.
  
  1. Updates:
    - Updates the stored procedures to ensure they don't rely on demo mode
    - Ensures data is always returned from database, never from mock data
    
  2. Notes:
    - This migration maintains backward compatibility
    - No data is deleted or modified
    - No schema changes are made
*/

USE QEIS1DAT;
GO

-- Create a view to easily access the most recent sensor readings for each rack
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_latest_sensor_readings')
BEGIN
  EXEC('
  CREATE VIEW [dbo].[vw_latest_sensor_readings] AS
  WITH latest_readings AS (
    SELECT 
      rack_id,
      MAX(created_at) AS latest_time
    FROM 
      [dbo].[sensor_readings]
    GROUP BY 
      rack_id
  )
  SELECT 
    sr.[id],
    sr.[rack_id],
    r.[name] AS rack_name,
    r.[site],
    r.[datacenter] AS dc,
    sr.[temperature],
    sr.[humidity],
    sr.[total_power],
    sr.[total_current],
    sr.[total_voltage],
    sr.[created_at]
  FROM 
    [dbo].[sensor_readings] sr
  JOIN 
    latest_readings lr ON sr.rack_id = lr.rack_id AND sr.created_at = lr.latest_time
  JOIN 
    [dbo].[racks] r ON sr.rack_id = r.id
  ');
  
  PRINT 'View vw_latest_sensor_readings created for easy access to most recent readings';
END
ELSE
BEGIN
  PRINT 'View vw_latest_sensor_readings already exists';
END
GO

-- Create a view for easier access to problem details
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_problem_details')
BEGIN
  EXEC('
  CREATE VIEW [dbo].[vw_problem_details] AS
  SELECT 
    p.[id],
    r.[name] AS rack,
    r.[site],
    r.[datacenter] AS dc,
    p.[type],
    p.[value],
    p.[threshold],
    p.[alert_type],
    p.[created_at] AS time,
    p.[resolved_at] AS resolved,
    p.[status],
    p.[acknowledged_by]
  FROM 
    [dbo].[problems] p
  JOIN 
    [dbo].[racks] r ON p.rack_id = r.id
  ');
  
  PRINT 'View vw_problem_details created for easier access to problem information';
END
ELSE
BEGIN
  PRINT 'View vw_problem_details already exists';
END
GO

-- Create a stored procedure to get active problems with detailed information
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_active_problems')
    DROP PROCEDURE [dbo].[sp_get_active_problems];
GO

CREATE PROCEDURE [dbo].[sp_get_active_problems]
AS
BEGIN
  SET NOCOUNT ON;
  
  SELECT 
    p.[id],
    r.[name] AS rack,
    r.[site],
    r.[datacenter] AS dc,
    p.[type],
    p.[value],
    p.[threshold],
    p.[alert_type],
    p.[created_at] AS time,
    p.[status]
  FROM 
    [dbo].[problems] p
  JOIN 
    [dbo].[racks] r ON p.rack_id = r.id
  WHERE 
    p.[status] = 'active'
  ORDER BY 
    p.[created_at] DESC;
END
GO

PRINT 'Stored procedure sp_get_active_problems updated';
GO

-- Create a stored procedure to get historical problems
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_historical_problems')
    DROP PROCEDURE [dbo].[sp_get_historical_problems];
GO

CREATE PROCEDURE [dbo].[sp_get_historical_problems]
AS
BEGIN
  SET NOCOUNT ON;
  
  SELECT 
    p.[id],
    r.[name] AS rack,
    r.[site],
    r.[datacenter] AS dc,
    p.[type],
    p.[value],
    p.[threshold],
    p.[alert_type],
    p.[created_at] AS time,
    p.[resolved_at] AS resolved,
    p.[status]
  FROM 
    [dbo].[problems] p
  JOIN 
    [dbo].[racks] r ON p.rack_id = r.id
  WHERE 
    p.[status] = 'resolved'
  ORDER BY 
    p.[created_at] DESC;
END
GO

PRINT 'Stored procedure sp_get_historical_problems created';
GO

-- Update the health check stored procedure
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_check_database_health')
    DROP PROCEDURE [dbo].[sp_check_database_health];
GO

CREATE PROCEDURE [dbo].[sp_check_database_health]
AS
BEGIN
  SET NOCOUNT ON;
  
  DECLARE @result INT = 0;
  
  BEGIN TRY
    -- Check if we can query the main tables
    IF EXISTS (SELECT TOP 1 1 FROM [dbo].[racks])
      SET @result = @result + 1;
      
    IF EXISTS (SELECT TOP 1 1 FROM [dbo].[sensor_readings])
      SET @result = @result + 1;
      
    IF EXISTS (SELECT TOP 1 1 FROM [dbo].[problems])
      SET @result = @result + 1;
      
    IF EXISTS (SELECT TOP 1 1 FROM [dbo].[thresholds])
      SET @result = @result + 1;
      
    SELECT 
      CASE 
        WHEN @result = 4 THEN 'healthy'
        WHEN @result > 0 THEN 'degraded'
        ELSE 'unhealthy'
      END AS status,
      @result AS tables_accessible,
      4 AS tables_total,
      GETDATE() AS check_time
  END TRY
  BEGIN CATCH
    SELECT 
      'error' AS status,
      ERROR_MESSAGE() AS error_message,
      ERROR_LINE() AS error_line,
      ERROR_NUMBER() AS error_number,
      GETDATE() AS check_time
  END CATCH
END
GO

PRINT 'Database health check procedure updated';
GO

PRINT 'Migration completed successfully. The application is now configured to always use database data instead of demo mode.';
GO