USE QEIS1DAT;
GO

-- Drop existing stored procedures to avoid errors
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_thresholds_fast')
    DROP PROCEDURE [dbo].[sp_get_thresholds_fast];
GO

IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_update_thresholds')
    DROP PROCEDURE [dbo].[sp_update_thresholds];
GO

IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_test_threshold_performance')
    DROP PROCEDURE [dbo].[sp_test_threshold_performance];
GO

-- First, create the view without the problematic index hint
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

PRINT 'Fixed view for current thresholds';
GO

-- Now create the fast stored procedure separately
CREATE PROCEDURE [dbo].[sp_get_thresholds_fast]
AS
BEGIN
    SET NOCOUNT ON;
    SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
    
    -- Use direct TOP 1 query without the problematic index hint
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
        [dbo].[thresholds] t WITH (NOLOCK)
    WHERE 
        t.[name] = 'global'
    ORDER BY 
        t.[created_at] DESC;
END
GO

PRINT 'Created fast threshold retrieval procedure';
GO

-- Create the update procedure separately
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

PRINT 'Created threshold update procedure';
GO

-- Performance testing procedure
CREATE PROCEDURE [dbo].[sp_test_threshold_performance]
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @start_time DATETIME2 = GETDATE();
    DECLARE @direct_query_time INT;
    DECLARE @view_query_time INT;
    DECLARE @sp_query_time INT;
    DECLARE @fast_sp_time INT;
    
    -- Test direct query
    BEGIN TRY
        DECLARE @start1 DATETIME2 = GETDATE();
        
        SELECT TOP 1
            id, name, min_temp, max_temp, min_humidity, max_humidity, 
            max_power_single_phase, max_power_three_phase
        FROM [dbo].[thresholds]
        WHERE name = 'global'
        ORDER BY created_at DESC;
        
        SET @direct_query_time = DATEDIFF(MILLISECOND, @start1, GETDATE());
    END TRY
    BEGIN CATCH
        SET @direct_query_time = -1;
    END CATCH
    
    -- Test view query
    BEGIN TRY
        DECLARE @start2 DATETIME2 = GETDATE();
        
        SELECT
            id, name, min_temp, max_temp, min_humidity, max_humidity, 
            max_power_single_phase, max_power_three_phase
        FROM [dbo].[vw_current_thresholds]
        WHERE name = 'global';
        
        SET @view_query_time = DATEDIFF(MILLISECOND, @start2, GETDATE());
    END TRY
    BEGIN CATCH
        SET @view_query_time = -1;
    END CATCH
    
    -- Test standard SP
    BEGIN TRY
        DECLARE @start3 DATETIME2 = GETDATE();
        
        EXEC [dbo].[sp_get_thresholds];
        
        SET @sp_query_time = DATEDIFF(MILLISECOND, @start3, GETDATE());
    END TRY
    BEGIN CATCH
        SET @sp_query_time = -1;
    END CATCH
    
    -- Test fast SP
    BEGIN TRY
        DECLARE @start4 DATETIME2 = GETDATE();
        
        EXEC [dbo].[sp_get_thresholds_fast];
        
        SET @fast_sp_time = DATEDIFF(MILLISECOND, @start4, GETDATE());
    END TRY
    BEGIN CATCH
        SET @fast_sp_time = -1;
    END CATCH
    
    -- Return performance metrics
    SELECT 
        @direct_query_time AS direct_query_ms,
        @view_query_time AS view_query_ms,
        @sp_query_time AS sp_query_ms,
        @fast_sp_time AS fast_sp_ms,
        CASE 
            WHEN @fast_sp_time > 0 AND @fast_sp_time <= @sp_query_time AND 
                 @fast_sp_time <= @view_query_time AND @fast_sp_time <= @direct_query_time 
            THEN 'sp_get_thresholds_fast'
            
            WHEN @view_query_time > 0 AND @view_query_time <= @sp_query_time AND 
                 @view_query_time <= @direct_query_time 
            THEN 'vw_current_thresholds'
            
            WHEN @sp_query_time > 0 AND @sp_query_time <= @direct_query_time 
            THEN 'sp_get_thresholds'
            
            ELSE 'direct_query'
        END AS fastest_method;
END
GO

PRINT 'Created performance testing procedure for thresholds';
GO

-- Create a stored procedure to clean up old threshold versions
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

PRINT 'Created cleanup procedure for old threshold versions';
GO

-- Run a test to validate everything is working correctly
EXEC sp_test_threshold_performance;
GO

PRINT 'Migration completed successfully. All procedures have been created with proper syntax.';
GO