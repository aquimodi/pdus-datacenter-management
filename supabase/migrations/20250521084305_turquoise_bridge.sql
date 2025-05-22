-- Corrección de la columna alert_type en la tabla problems
-- Este script debe ejecutarse antes de cualquier referencia a esta columna

-- Usamos la base de datos QEIS1DAT
USE QEIS1DAT;
GO

-- Verificar si la tabla problems existe
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[problems]') AND type in (N'U'))
BEGIN
    -- Verificar si la columna alert_type ya existe
    IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[problems]') AND name = 'alert_type'
    )
    BEGIN
        -- Añadir la columna alert_type si no existe
        ALTER TABLE [dbo].[problems] 
        ADD [alert_type] VARCHAR(10);
        
        PRINT 'Columna alert_type añadida a la tabla problems';
        
        -- Actualizar los registros existentes con valores predeterminados
        UPDATE [dbo].[problems]
        SET [alert_type] = 'high'
        WHERE [alert_type] IS NULL;
        
        PRINT 'Valores predeterminados establecidos en registros existentes';
    END
    ELSE
    BEGIN
        PRINT 'La columna alert_type ya existe en la tabla problems';
    END
    
    -- Asegurarse de que la restricción existe (independiente de si la columna era nueva o ya existía)
    -- Primero eliminamos la restricción si existe
    DECLARE @constraintName NVARCHAR(128);
    SELECT @constraintName = name 
    FROM sys.check_constraints 
    WHERE parent_object_id = OBJECT_ID(N'[dbo].[problems]') 
      AND name LIKE '%alert_type%';
    
    IF @constraintName IS NOT NULL
    BEGIN
        DECLARE @sql NVARCHAR(MAX);
        SET @sql = N'ALTER TABLE [dbo].[problems] DROP CONSTRAINT ' + @constraintName;
        EXEC sp_executesql @sql;
        
        PRINT 'Restricción existente eliminada';
    END
    
    -- Añadir la restricción
    ALTER TABLE [dbo].[problems]
    ADD CONSTRAINT [CK_problems_alert_type] CHECK ([alert_type] IN ('high', 'low'));
    
    PRINT 'Restricción CK_problems_alert_type añadida';
END
ELSE
BEGIN
    PRINT 'La tabla problems no existe en la base de datos';
END
GO

PRINT 'Script ejecutado correctamente';
GO