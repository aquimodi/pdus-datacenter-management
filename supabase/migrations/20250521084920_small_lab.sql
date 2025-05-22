-- Este script para SQL Server añade umbrales mínimos para temperatura y humedad
-- y se asegura de que los problemas puedan tener un tipo de alerta (alta o baja)

-- Usamos la base de datos QEIS1DAT
USE QEIS1DAT;
GO

-- Verificar si la tabla thresholds existe y crear si no existe
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[thresholds]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[thresholds] (
        [id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [name] VARCHAR(50) NOT NULL,
        [min_temp] DECIMAL(5,2) NOT NULL DEFAULT 18.0,
        [max_temp] DECIMAL(5,2) NOT NULL DEFAULT 32.0,
        [min_humidity] DECIMAL(5,2) NOT NULL DEFAULT 40.0,
        [max_humidity] DECIMAL(5,2) NOT NULL DEFAULT 70.0,
        [max_power_single_phase] DECIMAL(5,2) NOT NULL DEFAULT 16.0,
        [max_power_three_phase] DECIMAL(5,2) NOT NULL DEFAULT 48.0,
        [updated_by] UNIQUEIDENTIFIER NULL,
        [created_at] DATETIME2 DEFAULT GETDATE(),
        [updated_at] DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT [UQ_thresholds_name] UNIQUE ([name])
    );
    
    PRINT 'Tabla thresholds creada';
END
ELSE
BEGIN
    PRINT 'La tabla thresholds ya existe';
    
    -- Si la tabla existe pero faltan las columnas, agregarlas
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'min_temp')
    BEGIN
        ALTER TABLE [dbo].[thresholds] ADD [min_temp] DECIMAL(5,2) NOT NULL DEFAULT 18.0;
        PRINT 'Columna min_temp agregada a thresholds';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.thresholds') AND name = 'min_humidity')
    BEGIN
        ALTER TABLE [dbo].[thresholds] ADD [min_humidity] DECIMAL(5,2) NOT NULL DEFAULT 40.0;
        PRINT 'Columna min_humidity agregada a thresholds';
    END
END

-- Verificar si la columna alert_type existe en la tabla problems
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[problems]') AND type in (N'U'))
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.problems') AND name = 'alert_type')
    BEGIN
        ALTER TABLE [dbo].[problems] ADD [alert_type] VARCHAR(10) NULL;
        PRINT 'Columna alert_type agregada a problems';
    END
    
    -- Actualizar los registros existentes para establecer un valor por defecto en alert_type
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.problems') AND name = 'alert_type')
    BEGIN
        -- Establece un valor predeterminado para registros existentes
        UPDATE [dbo].[problems]
        SET [alert_type] = 'high'
        WHERE [alert_type] IS NULL;
        
        PRINT 'Valores alert_type actualizados en registros existentes';
        
        -- Eliminar constraint existente si existe para recrearlo
        IF EXISTS (SELECT * FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('dbo.problems') AND name = 'CK_problems_alert_type')
        BEGIN
            ALTER TABLE [dbo].[problems] DROP CONSTRAINT [CK_problems_alert_type];
            PRINT 'Constraint CK_problems_alert_type eliminado';
        END
        
        -- Añadir constraint
        ALTER TABLE [dbo].[problems] 
        ADD CONSTRAINT [CK_problems_alert_type] CHECK ([alert_type] IN ('high', 'low'));
        
        PRINT 'Constraint CK_problems_alert_type agregado';
    END
END

-- Insertar o actualizar los umbrales globales predeterminados
IF EXISTS (SELECT 1 FROM [dbo].[thresholds] WHERE [name] = 'global')
BEGIN
    UPDATE [dbo].[thresholds]
    SET 
        [min_temp] = 18.0,
        [max_temp] = 32.0,
        [min_humidity] = 40.0,
        [max_humidity] = 70.0,
        [max_power_single_phase] = 16.0,
        [max_power_three_phase] = 48.0,
        [updated_at] = GETDATE()
    WHERE [name] = 'global';
    
    PRINT 'Umbrales globales actualizados';
END
ELSE
BEGIN
    INSERT INTO [dbo].[thresholds] 
        ([name], [min_temp], [max_temp], [min_humidity], [max_humidity], [max_power_single_phase], [max_power_three_phase])
    VALUES 
        ('global', 18.0, 32.0, 40.0, 70.0, 16.0, 48.0);
    
    PRINT 'Umbrales globales insertados';
END

-- Trigger para actualizar updated_at
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_thresholds_update')
    DROP TRIGGER [TR_thresholds_update];

PRINT 'Eliminado trigger anterior';

CREATE TRIGGER [TR_thresholds_update] ON [dbo].[thresholds]
AFTER UPDATE AS 
BEGIN
    SET NOCOUNT ON;
    UPDATE [dbo].[thresholds]
    SET [updated_at] = GETDATE()
    FROM [dbo].[thresholds] t
    INNER JOIN inserted i ON t.[id] = i.[id];
END

PRINT 'Trigger TR_thresholds_update creado';
GO

-- Procedimiento almacenado para obtener umbrales globales
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
    
    -- Si no hay registros, insertar los valores predeterminados
    IF @@ROWCOUNT = 0
    BEGIN
        INSERT INTO [dbo].[thresholds] 
            ([name], [min_temp], [max_temp], [min_humidity], [max_humidity], [max_power_single_phase], [max_power_three_phase])
        VALUES 
            ('global', 18.0, 32.0, 40.0, 70.0, 16.0, 48.0);
        
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
END
GO

PRINT 'Procedimiento sp_get_thresholds creado';
GO

PRINT 'Script ejecutado correctamente';
GO