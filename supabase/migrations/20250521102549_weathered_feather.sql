-- Script para actualizar la base de datos SQL Server con versiones de umbrales
-- Este script permite mantener un historial de umbrales para análisis de cambios

USE QEIS1DAT;
GO

-- Verificar si ya existe la vista que obtiene el umbral activo más reciente
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_active_threshold')
BEGIN
    EXEC('
    CREATE VIEW [dbo].[vw_active_threshold] AS
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
    WHERE name = ''global''
    ORDER BY created_at DESC
    ');
    
    PRINT 'Vista vw_active_threshold creada';
END
ELSE
BEGIN
    PRINT 'La vista vw_active_threshold ya existe';
END
GO

-- Crear un procedimiento almacenado para obtener el historial de umbrales
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_threshold_history')
    DROP PROCEDURE [dbo].[sp_get_threshold_history];
GO

CREATE PROCEDURE [dbo].[sp_get_threshold_history]
    @limit INT = 10
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT TOP (@limit)
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
END
GO

PRINT 'Procedimiento sp_get_threshold_history creado';
GO

-- Crear un procedimiento almacenado para comparar versiones de umbrales
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_compare_thresholds')
    DROP PROCEDURE [dbo].[sp_compare_thresholds];
GO

CREATE PROCEDURE [dbo].[sp_compare_thresholds]
    @id1 UNIQUEIDENTIFIER,
    @id2 UNIQUEIDENTIFIER = NULL  -- Si es NULL, compara con el umbral activo más reciente
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Si @id2 es NULL, obtener el ID del umbral más reciente
    IF @id2 IS NULL
    BEGIN
        SELECT TOP 1 @id2 = id
        FROM [dbo].[thresholds]
        WHERE name = 'global' AND id != @id1
        ORDER BY created_at DESC;
    END
    
    -- Obtener ambos umbrales
    SELECT 
        t1.id AS id1,
        t2.id AS id2,
        t1.created_at AS created_at1,
        t2.created_at AS created_at2,
        t1.min_temp AS min_temp1,
        t2.min_temp AS min_temp2,
        t1.min_temp - t2.min_temp AS min_temp_diff,
        t1.max_temp AS max_temp1,
        t2.max_temp AS max_temp2,
        t1.max_temp - t2.max_temp AS max_temp_diff,
        t1.min_humidity AS min_humidity1,
        t2.min_humidity AS min_humidity2,
        t1.min_humidity - t2.min_humidity AS min_humidity_diff,
        t1.max_humidity AS max_humidity1,
        t2.max_humidity AS max_humidity2,
        t1.max_humidity - t2.max_humidity AS max_humidity_diff,
        t1.max_power_single_phase AS max_power_single_phase1,
        t2.max_power_single_phase AS max_power_single_phase2,
        t1.max_power_single_phase - t2.max_power_single_phase AS max_power_single_phase_diff,
        t1.max_power_three_phase AS max_power_three_phase1,
        t2.max_power_three_phase AS max_power_three_phase2,
        t1.max_power_three_phase - t2.max_power_three_phase AS max_power_three_phase_diff
    FROM 
        [dbo].[thresholds] t1
    CROSS JOIN 
        [dbo].[thresholds] t2
    WHERE 
        t1.id = @id1 AND t2.id = @id2;
END
GO

PRINT 'Procedimiento sp_compare_thresholds creado';
GO

-- Crear función para verificar si un valor está fuera de los umbrales
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'FN' AND name = 'fn_check_threshold')
    DROP FUNCTION [dbo].[fn_check_threshold];
GO

CREATE FUNCTION [dbo].[fn_check_threshold]
(
    @value DECIMAL(10,2),
    @min_threshold DECIMAL(10,2),
    @max_threshold DECIMAL(10,2)
)
RETURNS VARCHAR(10)
AS
BEGIN
    DECLARE @result VARCHAR(10);
    
    IF @value > @max_threshold
        SET @result = 'high';
    ELSE IF @value < @min_threshold
        SET @result = 'low';
    ELSE
        SET @result = 'normal';
        
    RETURN @result;
END
GO

PRINT 'Función fn_check_threshold creada';
GO