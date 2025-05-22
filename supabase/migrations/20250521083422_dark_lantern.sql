-- Tabla de umbrales para monitorización
-- Almacena los umbrales máximos y mínimos para temperatura y humedad
-- Permite configurar alertas tanto por valores demasiado altos como demasiado bajos
-- Incluye información sobre quién actualizó los umbrales y cuándo

-- Verificar si la tabla ya existe
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
END
GO

-- Verificar si el campo alert_type existe en la tabla problems
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.problems') AND name = 'alert_type'
)
BEGIN
    ALTER TABLE [dbo].[problems] 
    ADD [alert_type] VARCHAR(10);
    
    -- Agregar constraint para alert_type
    ALTER TABLE [dbo].[problems]
    ADD CONSTRAINT [CK_problems_alert_type] CHECK ([alert_type] IN ('high', 'low'));
END
GO

-- Insertar valores predeterminados si no existen
IF NOT EXISTS (SELECT 1 FROM [dbo].[thresholds] WHERE [name] = 'global')
BEGIN
    INSERT INTO [dbo].[thresholds] 
        ([name], [min_temp], [max_temp], [min_humidity], [max_humidity], [max_power_single_phase], [max_power_three_phase])
    VALUES 
        ('global', 18.0, 32.0, 40.0, 70.0, 16.0, 48.0);
END
ELSE
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
END
GO

-- Crear trigger para actualizar updated_at
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_thresholds_update')
    DROP TRIGGER [TR_thresholds_update];
GO

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