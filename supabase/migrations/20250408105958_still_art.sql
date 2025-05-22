/*
VITE_API1_URL=http://placeholder.api/api1/sensordata
VITE_API2_URL=http://placeholder.api/api2/sensordata
VITE_API1_USERNAME=admin
VITE_API1_PASSWORD=password
VITE_DEFAULT_REFRESH_INTERVAL=30000
VITE_SQL_USER=your_user
VITE_SQL_PASSWORD=your_password
VITE_SQL_SERVER=your_server
VITE_SQL_DATABASE=yo
  # Update Database Name

  1. Changes
    - Rename database to QEIS1DAT
    
  2. Notes
    - This migration ensures the database name matches the specified requirement
    - All existing tables and data are preserved
*/

-- Rename the database if it exists with a different name
IF EXISTS (SELECT * FROM sys.databases WHERE name = 'DCOpsManager')
BEGIN
    ALTER DATABASE DCOpsManager MODIFY NAME = QEIS1DAT;
END
GO

-- Create the database if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'QEIS1DAT')
BEGIN
    CREATE DATABASE QEIS1DAT;
END
GO

USE QEIS1DAT;
GO