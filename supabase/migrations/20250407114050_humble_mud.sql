-- Create database if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'DCOpsManager')
BEGIN
    CREATE DATABASE DCOpsManager;
END
GO

USE DCOpsManager;
GO

-- Create racks table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[racks]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[racks] (
        [id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [name] NVARCHAR(50) NOT NULL,
        [site] NVARCHAR(50) NOT NULL,
        [datacenter] NVARCHAR(50) NOT NULL,
        [maintenance] BIT DEFAULT 0,
        [max_power] DECIMAL(10,2) NOT NULL,
        [max_units] INT NOT NULL,
        [free_units] INT NOT NULL,
        [created_at] DATETIME2 DEFAULT GETDATE(),
        [updated_at] DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT [UQ_racks_name] UNIQUE ([name])
    );
END

-- Create sensor_readings table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[sensor_readings]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[sensor_readings] (
        [id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [rack_id] UNIQUEIDENTIFIER NOT NULL,
        [temperature] DECIMAL(5,2),
        [humidity] DECIMAL(5,2),
        [total_power] DECIMAL(10,2),
        [total_current] DECIMAL(10,2),
        [total_voltage] DECIMAL(10,2),
        [l1_voltage] DECIMAL(10,2),
        [l2_voltage] DECIMAL(10,2),
        [l3_voltage] DECIMAL(10,2),
        [l1_current] DECIMAL(10,2),
        [l2_current] DECIMAL(10,2),
        [l3_current] DECIMAL(10,2),
        [created_at] DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT [FK_sensor_readings_racks] FOREIGN KEY ([rack_id]) 
            REFERENCES [dbo].[racks] ([id]) ON DELETE CASCADE,
        CONSTRAINT [CK_temperature_range] CHECK ([temperature] >= -50 AND [temperature] <= 100),
        CONSTRAINT [CK_humidity_range] CHECK ([humidity] >= 0 AND [humidity] <= 100)
    );
END

-- Create problems table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[problems]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[problems] (
        [id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [rack_id] UNIQUEIDENTIFIER NOT NULL,
        [type] NVARCHAR(20) NOT NULL,
        [value] NVARCHAR(50) NOT NULL,
        [threshold] NVARCHAR(50) NOT NULL,
        [status] NVARCHAR(20) NOT NULL DEFAULT 'active',
        [resolved_at] DATETIME2,
        [acknowledged_by] NVARCHAR(50),
        [created_at] DATETIME2 DEFAULT GETDATE(),
        [updated_at] DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT [FK_problems_racks] FOREIGN KEY ([rack_id]) 
            REFERENCES [dbo].[racks] ([id]) ON DELETE CASCADE,
        CONSTRAINT [CK_problem_type] CHECK ([type] IN ('Temperature', 'Humidity', 'Power')),
        CONSTRAINT [CK_problem_status] CHECK ([status] IN ('active', 'resolved', 'acknowledged'))
    );
END

-- Create indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_racks_site_dc' AND object_id = OBJECT_ID('dbo.racks'))
BEGIN
    CREATE INDEX [IX_racks_site_dc] ON [dbo].[racks] ([site], [datacenter]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_sensor_readings_rack_time' AND object_id = OBJECT_ID('dbo.sensor_readings'))
BEGIN
    CREATE INDEX [IX_sensor_readings_rack_time] ON [dbo].[sensor_readings] ([rack_id], [created_at] DESC);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_problems_rack_status' AND object_id = OBJECT_ID('dbo.problems'))
BEGIN
    CREATE INDEX [IX_problems_rack_status] ON [dbo].[problems] ([rack_id], [status]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_problems_type_status' AND object_id = OBJECT_ID('dbo.problems'))
BEGIN
    CREATE INDEX [IX_problems_type_status] ON [dbo].[problems] ([type], [status]);
END

-- Create trigger to update updated_at column
IF NOT EXISTS (SELECT * FROM sys.objects WHERE type = 'TR' AND name = 'TR_racks_update')
BEGIN
    EXEC('CREATE TRIGGER [TR_racks_update] ON [dbo].[racks]
    AFTER UPDATE AS 
    BEGIN
        SET NOCOUNT ON;
        UPDATE [dbo].[racks]
        SET [updated_at] = GETDATE()
        FROM [dbo].[racks] t
        INNER JOIN inserted i ON t.[id] = i.[id]
    END');
END

IF NOT EXISTS (SELECT * FROM sys.objects WHERE type = 'TR' AND name = 'TR_problems_update')
BEGIN
    EXEC('CREATE TRIGGER [TR_problems_update] ON [dbo].[problems]
    AFTER UPDATE AS 
    BEGIN
        SET NOCOUNT ON;
        UPDATE [dbo].[problems]
        SET [updated_at] = GETDATE()
        FROM [dbo].[problems] t
        INNER JOIN inserted i ON t.[id] = i.[id]
    END');
END

-- Create stored procedures for common operations
IF NOT EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_active_problems')
BEGIN
    EXEC('CREATE PROCEDURE [dbo].[sp_get_active_problems]
    AS
    BEGIN
        SET NOCOUNT ON;
        SELECT 
            p.[id],
            r.[name] as rack_name,
            r.[site],
            r.[datacenter],
            p.[type],
            p.[value],
            p.[threshold],
            p.[created_at],
            p.[status]
        FROM [dbo].[problems] p
        INNER JOIN [dbo].[racks] r ON p.[rack_id] = r.[id]
        WHERE p.[status] = ''active''
        ORDER BY p.[created_at] DESC;
    END');
END

IF NOT EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_get_latest_sensor_readings')
BEGIN
    EXEC('CREATE PROCEDURE [dbo].[sp_get_latest_sensor_readings]
    AS
    BEGIN
        SET NOCOUNT ON;
        SELECT 
            sr.[id],
            r.[name] as rack_name,
            r.[site],
            r.[datacenter],
            sr.[temperature],
            sr.[humidity],
            sr.[total_current],
            sr.[total_voltage],
            sr.[total_power],
            sr.[created_at]
        FROM [dbo].[sensor_readings] sr
        INNER JOIN [dbo].[racks] r ON sr.[rack_id] = r.[id]
        WHERE sr.[created_at] >= DATEADD(MINUTE, -5, GETDATE())
        ORDER BY sr.[created_at] DESC;
    END');
END