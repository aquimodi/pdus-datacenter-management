USE QEIS1DAT;
GO

-- Fix the error with the view that's using index hints
-- Error: "Index hints within a schema-bound object can be applied only to memory optimized tables."
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_current_thresholds')
    DROP VIEW [dbo].[vw_current_thresholds];
GO

-- Re-create the view without the index hint and without SCHEMABINDING
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

PRINT 'Fixed vw_current_thresholds view by removing the invalid index hint';
GO

-- Verify the stored procedure exists
IF NOT EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_thresholds_fast')
BEGIN
    -- Create improved stored procedure without index hint
    CREATE PROCEDURE [dbo].[sp_get_thresholds_fast]
    AS
    BEGIN
        SET NOCOUNT ON;
        SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;  -- Use nolock hint
        
        DECLARE @name VARCHAR(50) = 'global';
        
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
            t.[name] = @name
        ORDER BY 
            t.[created_at] DESC;
    END
    
    PRINT 'Created sp_get_thresholds_fast procedure';
END
ELSE
BEGIN
    -- Drop and recreate the procedure without index hint
    DROP PROCEDURE [dbo].[sp_get_thresholds_fast];
    
    CREATE PROCEDURE [dbo].[sp_get_thresholds_fast]
    AS
    BEGIN
        SET NOCOUNT ON;
        SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;  -- Use nolock hint
        
        DECLARE @name VARCHAR(50) = 'global';
        
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
            t.[name] = @name
        ORDER BY 
            t.[created_at] DESC;
    END
    
    PRINT 'Updated sp_get_thresholds_fast procedure by removing the index hint';
END
GO

-- Create a procedure to check threshold lookup performance
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_test_threshold_performance')
    DROP PROCEDURE [dbo].[sp_test_threshold_performance];
GO

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

-- Run the performance test
PRINT 'Running threshold retrieval performance test...';
EXEC sp_test_threshold_performance;
GO

PRINT 'Migration completed successfully. Threshold view has been fixed.';
GO