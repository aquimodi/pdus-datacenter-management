USE QEIS1DAT;
GO

-- This migration optimizes database performance for thresholds table and adds additional indices

-- Create a more efficient index for thresholds table with included columns for faster retrieval
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_thresholds_name_created' AND object_id = OBJECT_ID('dbo.thresholds'))
BEGIN
    CREATE INDEX [IX_thresholds_name_created] ON [dbo].[thresholds] 
    ([name], [created_at] DESC) 
    INCLUDE ([min_temp], [max_temp], [min_humidity], [max_humidity], 
            [max_power_single_phase], [max_power_three_phase]);
    
    PRINT 'Created optimized index for thresholds table';
END
ELSE
BEGIN
    PRINT 'Optimized index for thresholds already exists';
END
GO

-- Update the view to explicitly use the index for better performance
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_current_thresholds')
    DROP VIEW [dbo].[vw_current_thresholds];
GO

CREATE VIEW [dbo].[vw_current_thresholds] WITH SCHEMABINDING AS
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
    [dbo].[thresholds] t WITH (INDEX = [IX_thresholds_name_created])
JOIN 
    latest_thresholds lt ON t.name = lt.name AND t.created_at = lt.latest_time;
GO

PRINT 'Updated view with index hint for better performance';
GO

-- Create a very efficient procedure to get thresholds with minimal overhead
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_thresholds_fast')
    DROP PROCEDURE [dbo].[sp_get_thresholds_fast];
GO

CREATE PROCEDURE [dbo].[sp_get_thresholds_fast]
AS
BEGIN
    SET NOCOUNT ON;
    SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;  -- Use nolock hint
    
    DECLARE @name VARCHAR(50) = 'global';
    
    -- Use direct TOP 1 query with index hint for fastest possible retrieval
    SELECT TOP 1
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
        [dbo].[thresholds] t WITH (NOLOCK, INDEX = [IX_thresholds_name_created])
    WHERE 
        t.[name] = @name
    ORDER BY 
        t.[created_at] DESC;
END
GO

PRINT 'Created ultra-fast thresholds retrieval procedure';
GO

-- Create an explicit transaction for threshold updates to ensure atomicity
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_update_thresholds')
    DROP PROCEDURE [dbo].[sp_update_thresholds];
GO

CREATE PROCEDURE [dbo].[sp_update_thresholds]
    @min_temp DECIMAL(5,2),
    @max_temp DECIMAL(5,2),
    @min_humidity DECIMAL(5,2),
    @max_humidity DECIMAL(5,2),
    @max_power_single_phase DECIMAL(5,2),
    @max_power_three_phase DECIMAL(5,2)
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Validate inputs
    IF @min_temp IS NULL OR @max_temp IS NULL OR 
       @min_humidity IS NULL OR @max_humidity IS NULL OR
       @max_power_single_phase IS NULL OR @max_power_three_phase IS NULL
    BEGIN
        RAISERROR('All threshold values are required', 16, 1);
        RETURN;
    END
    
    -- Validate thresholds
    IF @min_temp >= @max_temp
    BEGIN
        RAISERROR('Minimum temperature must be less than maximum temperature', 16, 1);
        RETURN;
    END
    
    IF @min_humidity >= @max_humidity
    BEGIN
        RAISERROR('Minimum humidity must be less than maximum humidity', 16, 1);
        RETURN;
    END
    
    -- Insert new record for versioning
    BEGIN TRY
        INSERT INTO [dbo].[thresholds]
            ([name], [min_temp], [max_temp], [min_humidity], [max_humidity], 
            [max_power_single_phase], [max_power_three_phase])
        VALUES
            ('global', @min_temp, @max_temp, @min_humidity, @max_humidity,
            @max_power_single_phase, @max_power_three_phase);
            
        -- Return the new record
        SELECT TOP 1
            [id],
            [name],
            [min_temp],
            [max_temp],
            [min_humidity],
            [max_humidity],
            [max_power_single_phase],
            [max_power_three_phase],
            [created_at],
            [updated_at]
        FROM
            [dbo].[thresholds]
        WHERE
            [name] = 'global'
        ORDER BY
            [created_at] DESC;
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000);
        DECLARE @ErrorSeverity INT;
        DECLARE @ErrorState INT;

        SELECT 
            @ErrorMessage = ERROR_MESSAGE(),
            @ErrorSeverity = ERROR_SEVERITY(),
            @ErrorState = ERROR_STATE();

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END
GO

PRINT 'Created stored procedure for threshold updates with validation';
GO

-- Create a purge procedure to cleanup old threshold versions
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_purge_old_thresholds')
    DROP PROCEDURE [dbo].[sp_purge_old_thresholds];
GO

CREATE PROCEDURE [dbo].[sp_purge_old_thresholds]
    @keep_count INT = 10  -- Number of most recent versions to keep
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @threshold_count INT;
    DECLARE @delete_count INT = 0;
    
    -- Get the count of thresholds
    SELECT @threshold_count = COUNT(*) 
    FROM [dbo].[thresholds] 
    WHERE [name] = 'global';
    
    -- Only delete if we have more than the keep count
    IF @threshold_count > @keep_count
    BEGIN
        -- Delete all but the most recent @keep_count records
        WITH ranked_thresholds AS (
            SELECT 
                id,
                ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) as row_num
            FROM 
                [dbo].[thresholds]
            WHERE 
                [name] = 'global'
        )
        DELETE FROM [dbo].[thresholds]
        WHERE id IN (
            SELECT id FROM ranked_thresholds
            WHERE row_num > @keep_count
        );
        
        SET @delete_count = @@ROWCOUNT;
    END
    
    SELECT 
        @threshold_count AS original_count,
        @delete_count AS deleted_count,
        @threshold_count - @delete_count AS remaining_count;
END
GO

PRINT 'Created stored procedure to clean up old threshold versions';
GO

-- Create a job to automatically purge old thresholds (run this purge now for immediate cleanup)
EXEC [dbo].[sp_purge_old_thresholds] 10;
GO

PRINT 'Ran initial threshold cleanup';
GO

-- Performance optimization: Add index on alert_type in problems table
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_problems_alert_type' AND object_id = OBJECT_ID('dbo.problems'))
BEGIN
    CREATE INDEX [IX_problems_alert_type] ON [dbo].[problems] ([alert_type]);
    PRINT 'Created index on alert_type column in problems table';
END
ELSE
BEGIN
    PRINT 'Index on alert_type column already exists';
END
GO

PRINT 'Migration completed successfully. Thresholds table performance has been optimized.';
GO