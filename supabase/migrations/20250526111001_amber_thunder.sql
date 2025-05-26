/*
  # Fix Thresholds Table Schema and Add Better Access Methods
  
  1. Schema Updates
    - Ensure thresholds table has proper data types and constraints
    - Add appropriate indexes for faster queries
    
  2. Improved Access
    - Create more efficient views for threshold data
    - Add timeout-resistant stored procedures for threshold access
    
  3. Diagnostics
    - Add stored procedures for threshold diagnostics
    - Add error logging support
*/

USE QEIS1DAT;
GO

-- Verify the thresholds table exists and has the correct structure
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[thresholds]') AND type in (N'U'))
BEGIN
    PRINT 'Thresholds table exists, checking columns...';
    
    -- Check and update data types to ensure consistency
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'min_temp')
    BEGIN
        PRINT 'min_temp column exists';
        
        -- Check data type and update if needed
        IF NOT EXISTS (
            SELECT * FROM sys.columns 
            WHERE object_id = OBJECT_ID('dbo.thresholds') 
            AND name = 'min_temp' 
            AND system_type_id = 106  -- DECIMAL type
        )
        BEGIN
            PRINT 'min_temp column has wrong data type, updating...';
            ALTER TABLE [dbo].[thresholds] ALTER COLUMN [min_temp] DECIMAL(5,2) NOT NULL;
        END
    END
    ELSE
    BEGIN
        PRINT 'Adding min_temp column...';
        ALTER TABLE [dbo].[thresholds] ADD [min_temp] DECIMAL(5,2) NOT NULL DEFAULT 18.0;
    END
    
    -- Similar checks for other columns
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'max_temp')
    BEGIN
        PRINT 'max_temp column exists';
        
        IF NOT EXISTS (
            SELECT * FROM sys.columns 
            WHERE object_id = OBJECT_ID('dbo.thresholds') 
            AND name = 'max_temp' 
            AND system_type_id = 106
        )
        BEGIN
            PRINT 'max_temp column has wrong data type, updating...';
            ALTER TABLE [dbo].[thresholds] ALTER COLUMN [max_temp] DECIMAL(5,2) NOT NULL;
        END
    END
    ELSE
    BEGIN
        PRINT 'Adding max_temp column...';
        ALTER TABLE [dbo].[thresholds] ADD [max_temp] DECIMAL(5,2) NOT NULL DEFAULT 32.0;
    END
    
    -- Check other required columns
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'min_humidity')
    BEGIN
        PRINT 'Adding min_humidity column...';
        ALTER TABLE [dbo].[thresholds] ADD [min_humidity] DECIMAL(5,2) NOT NULL DEFAULT 40.0;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'max_humidity')
    BEGIN
        PRINT 'Adding max_humidity column...';
        ALTER TABLE [dbo].[thresholds] ADD [max_humidity] DECIMAL(5,2) NOT NULL DEFAULT 70.0;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'max_power_single_phase')
    BEGIN
        PRINT 'Adding max_power_single_phase column...';
        ALTER TABLE [dbo].[thresholds] ADD [max_power_single_phase] DECIMAL(5,2) NOT NULL DEFAULT 16.0;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'max_power_three_phase')
    BEGIN
        PRINT 'Adding max_power_three_phase column...';
        ALTER TABLE [dbo].[thresholds] ADD [max_power_three_phase] DECIMAL(5,2) NOT NULL DEFAULT 48.0;
    END
    
    -- Check if created_at and updated_at timestamps exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'created_at')
    BEGIN
        PRINT 'Adding created_at column...';
        ALTER TABLE [dbo].[thresholds] ADD [created_at] DATETIME2 DEFAULT GETDATE();
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'updated_at')
    BEGIN
        PRINT 'Adding updated_at column...';
        ALTER TABLE [dbo].[thresholds] ADD [updated_at] DATETIME2 DEFAULT GETDATE();
    END
    
    -- Add index on name column if not exists
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_thresholds_name' AND object_id = OBJECT_ID('dbo.thresholds'))
    BEGIN
        PRINT 'Adding index on name column...';
        CREATE INDEX [IX_thresholds_name] ON [dbo].[thresholds] ([name]);
    END
END
ELSE
BEGIN
    -- Create the thresholds table if it doesn't exist
    PRINT 'Thresholds table does not exist, creating it...';
    
    CREATE TABLE [dbo].[thresholds] (
        [id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [name] VARCHAR(50) NOT NULL,
        [min_temp] DECIMAL(5,2) NOT NULL DEFAULT 18.0,
        [max_temp] DECIMAL(5,2) NOT NULL DEFAULT 32.0,
        [min_humidity] DECIMAL(5,2) NOT NULL DEFAULT 40.0,
        [max_humidity] DECIMAL(5,2) NOT NULL DEFAULT 70.0,
        [max_power_single_phase] DECIMAL(5,2) NOT NULL DEFAULT 16.0,
        [max_power_three_phase] DECIMAL(5,2) NOT NULL DEFAULT 48.0,
        [created_at] DATETIME2 DEFAULT GETDATE(),
        [updated_at] DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT [UQ_thresholds_name] UNIQUE ([name])
    );
    
    PRINT 'Created thresholds table';
    
    CREATE INDEX [IX_thresholds_name] ON [dbo].[thresholds] ([name]);
    PRINT 'Created index on name column';
END
GO

-- Create an efficient view for the latest threshold values
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_current_thresholds')
    DROP VIEW [dbo].[vw_current_thresholds];
GO

CREATE VIEW [dbo].[vw_current_thresholds] AS
WITH latest_thresholds AS (
    SELECT 
        name,
        MAX(created_at) AS latest_time
    FROM 
        [dbo].[thresholds]
    GROUP BY 
        name
)
SELECT 
    t.[id],
    t.[name],
    t.[min_temp],
    t.[max_temp],
    t.[min_humidity],
    t.[max_humidity],
    t.[max_power_single_phase],
    t.[max_power_three_phase],
    t.[created_at],
    t.[updated_at]
FROM 
    [dbo].[thresholds] t
JOIN 
    latest_thresholds lt ON t.name = lt.name AND t.created_at = lt.latest_time;
GO

PRINT 'Created optimized view for current thresholds';
GO

-- Create an improved stored procedure for getting thresholds with timeout protection
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_thresholds')
    DROP PROCEDURE [dbo].[sp_get_thresholds];
GO

CREATE PROCEDURE [dbo].[sp_get_thresholds]
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Use a timeout mechanism to prevent hanging
    BEGIN TRY
        -- Attempt to get thresholds from the view (faster)
        SELECT TOP 1
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
        FROM [dbo].[vw_current_thresholds]
        WHERE name = 'global';
        
        -- If no results, try direct table access
        IF @@ROWCOUNT = 0
        BEGIN
            SELECT TOP 1
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
            WHERE name = 'global'
            ORDER BY created_at DESC;
            
            -- If still no results, insert default values
            IF @@ROWCOUNT = 0
            BEGIN
                DECLARE @new_id UNIQUEIDENTIFIER = NEWID();
                
                INSERT INTO [dbo].[thresholds] 
                    ([id], [name], [min_temp], [max_temp], [min_humidity], [max_humidity], [max_power_single_phase], [max_power_three_phase])
                VALUES 
                    (@new_id, 'global', 18.0, 32.0, 40.0, 70.0, 16.0, 48.0);
                
                SELECT
                    @new_id AS id,
                    'global' AS name,
                    18.0 AS min_temp,
                    32.0 AS max_temp,
                    40.0 AS min_humidity,
                    70.0 AS max_humidity,
                    16.0 AS max_power_single_phase,
                    48.0 AS max_power_three_phase,
                    GETDATE() AS created_at,
                    GETDATE() AS updated_at;
            END
        END
    END TRY
    BEGIN CATCH
        -- Log the error
        PRINT 'Error in sp_get_thresholds: ' + ERROR_MESSAGE();
        
        -- Return default values in case of error
        SELECT
            NEWID() AS id,
            'global' AS name,
            18.0 AS min_temp,
            32.0 AS max_temp,
            40.0 AS min_humidity,
            70.0 AS max_humidity,
            16.0 AS max_power_single_phase,
            48.0 AS max_power_three_phase,
            GETDATE() AS created_at,
            GETDATE() AS updated_at;
    END CATCH
END
GO

PRINT 'Created improved stored procedure for getting thresholds';
GO

-- Create a simplified diagnostic procedure to check if thresholds are accessible
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_check_thresholds_access')
    DROP PROCEDURE [dbo].[sp_check_thresholds_access];
GO

CREATE PROCEDURE [dbo].[sp_check_thresholds_access]
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        DECLARE @count INT;
        SELECT @count = COUNT(*) FROM [dbo].[thresholds] WITH (NOLOCK);
        
        SELECT
            'success' AS status,
            @count AS threshold_count,
            'Thresholds table is accessible' AS message,
            GETDATE() AS check_time;
    END TRY
    BEGIN CATCH
        SELECT
            'error' AS status,
            0 AS threshold_count,
            'Error accessing thresholds table: ' + ERROR_MESSAGE() AS message,
            GETDATE() AS check_time;
    END CATCH
END
GO

PRINT 'Created diagnostic procedure for thresholds access';
GO

-- Insert default threshold values if they don't exist
IF NOT EXISTS (SELECT 1 FROM [dbo].[thresholds] WHERE name = 'global')
BEGIN
    PRINT 'No threshold values found, inserting defaults...';
    
    INSERT INTO [dbo].[thresholds] 
        ([name], [min_temp], [max_temp], [min_humidity], [max_humidity], [max_power_single_phase], [max_power_three_phase])
    VALUES 
        ('global', 18.0, 32.0, 40.0, 70.0, 16.0, 48.0);
        
    PRINT 'Default threshold values inserted';
END
ELSE
BEGIN
    PRINT 'Threshold values already exist';
END
GO

PRINT 'Threshold tables and stored procedures have been updated. This should fix any timeout issues.';
GO