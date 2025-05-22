-- Script for SQL Server to fix trigger creation issue
-- This properly separates batch statements with GO to avoid syntax errors

USE QEIS1DAT;
GO

-- Drop the existing trigger if it exists
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_thresholds_update')
    DROP TRIGGER [TR_thresholds_update];
GO

-- Create the trigger with proper batch separation
CREATE TRIGGER [TR_thresholds_update] ON [dbo].[thresholds]
AFTER UPDATE AS 
BEGIN
    SET NOCOUNT ON;
    UPDATE [dbo].[thresholds]
    SET [updated_at] = GETDATE()
    FROM [dbo].[thresholds] t
    INNER JOIN inserted i ON t.[id] = i.[id];
END
GO

-- Create stored procedure to check and get alerts based on thresholds
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_thresholds')
    DROP PROCEDURE [dbo].[sp_get_thresholds];
GO

CREATE PROCEDURE [dbo].[sp_get_thresholds]
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        id,
        name,
        min_temp,
        max_temp,
        min_humidity,
        max_humidity,
        max_power_single_phase,
        max_power_three_phase,
        created_at,
        updated_at
    FROM [dbo].[thresholds]
    WHERE name = 'global';
END
GO

PRINT 'Trigger and stored procedures successfully created';
GO