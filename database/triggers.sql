-- ============================================================================
-- WarrantyWise - Triggers (Azure SQL Database & SQL Server)
-- ============================================================================

-- 1. TRIGGER: trg_UpdateWarrantyStatusOnInsertUpdate
-- Automatically sets and keeps warranty status consistent upon insert or modification
-- of the start or end dates.
CREATE OR ALTER TRIGGER dbo.trg_UpdateWarrantyStatusOnInsertUpdate
ON dbo.Warranties
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Avoid infinite recursive trigger loop
    IF TRIGGER_NESTLEVEL() > 1 RETURN;

    -- Update status based on current UTC date and end_date
    UPDATE w
    SET 
        status = CASE 
            WHEN i.end_date < CAST(GETUTCDATE() AS DATE) THEN 'Expired'
            WHEN DATEDIFF(day, CAST(GETUTCDATE() AS DATE), i.end_date) <= 30 THEN 'Expiring Soon'
            ELSE 'Active'
        END,
        updated_at = SYSUTCDATETIME()
    FROM dbo.Warranties w
    INNER JOIN inserted i ON w.id = i.id;
END;
GO

-- 2. TRIGGER: trg_AuditProductDeletion
-- Automatically writes an audit entry to ActivityLogs whenever a product is deleted.
CREATE OR ALTER TRIGGER dbo.trg_AuditProductDeletion
ON dbo.Products
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.ActivityLogs (
        user_id,
        action,
        entity_type,
        entity_id,
        details,
        created_at
    )
    SELECT 
        CASE
            WHEN EXISTS (SELECT 1 FROM dbo.Users u WHERE u.id = d.user_id) THEN d.user_id
            ELSE NULL
        END,
        'PRODUCT_DELETED',
        'Product',
        d.id,
        CONCAT('Deleted product "', d.name, '" (Brand: ', d.brand, ', Serial: ', ISNULL(d.serial_number, 'N/A'), ')'),
        SYSUTCDATETIME()
    FROM deleted d;
END;
GO

