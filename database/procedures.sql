-- ============================================================================
-- WarrantyWise - Stored Procedures (Azure SQL Database & SQL Server)
-- ============================================================================

-- 1. PROCEDURE: sp_RegisterProductWithWarranty
-- Registers a product and its initial warranty in an atomic transaction.
-- If any insert fails, the transaction is rolled back safely.
CREATE OR ALTER PROCEDURE dbo.sp_RegisterProductWithWarranty
    @UserId INT,
    @CategoryId INT,
    @Name NVARCHAR(150),
    @Brand NVARCHAR(100),
    @ModelNumber NVARCHAR(100) = NULL,
    @SerialNumber NVARCHAR(100) = NULL,
    @PurchaseDate DATE,
    @PurchasePrice DECIMAL(18,2) = 0.00,
    @Currency NVARCHAR(10) = 'USD',
    @Retailer NVARCHAR(150) = NULL,
    @Notes NVARCHAR(MAX) = NULL,
    @ProviderName NVARCHAR(150),
    @PolicyNumber NVARCHAR(100) = NULL,
    @WarrantyType NVARCHAR(50) = 'Manufacturer',
    @DurationMonths INT,
    @StartDate DATE,
    @EndDate DATE,
    @CoverageDetails NVARCHAR(MAX) = NULL,
    @SupportContact NVARCHAR(255) = NULL,
    @NewProductId INT OUTPUT,
    @NewWarrantyId INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Insert Product
        INSERT INTO dbo.Products (
            user_id, category_id, name, brand, model_number, serial_number,
            purchase_date, purchase_price, currency, retailer, notes
        )
        VALUES (
            @UserId, @CategoryId, @Name, @Brand, @ModelNumber, @SerialNumber,
            @PurchaseDate, @PurchasePrice, @Currency, @Retailer, @Notes
        );

        SET @NewProductId = SCOPE_IDENTITY();

        -- Calculate initial warranty status
        DECLARE @CalcStatus NVARCHAR(30);
        IF @EndDate < CAST(GETUTCDATE() AS DATE)
            SET @CalcStatus = 'Expired';
        ELSE IF DATEDIFF(day, CAST(GETUTCDATE() AS DATE), @EndDate) <= 30
            SET @CalcStatus = 'Expiring Soon';
        ELSE
            SET @CalcStatus = 'Active';

        -- Insert Warranty
        INSERT INTO dbo.Warranties (
            product_id, provider_name, policy_number, warranty_type,
            duration_months, start_date, end_date, coverage_details,
            support_contact, status
        )
        VALUES (
            @NewProductId, @ProviderName, @PolicyNumber, @WarrantyType,
            @DurationMonths, @StartDate, @EndDate, @CoverageDetails,
            @SupportContact, @CalcStatus
        );

        SET @NewWarrantyId = SCOPE_IDENTITY();

        -- Log Action in ActivityLogs
        INSERT INTO dbo.ActivityLogs (user_id, action, entity_type, entity_id, details)
        VALUES (@UserId, 'PRODUCT_REGISTERED', 'Product', @NewProductId, 
                CONCAT('Registered product "', @Name, '" with ', @DurationMonths, ' months warranty'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END;
GO

-- 2. PROCEDURE: sp_GetUserDashboardSummary
-- Computes key dashboard KPIs for a user in a single optimized database call.
CREATE OR ALTER PROCEDURE dbo.sp_GetUserDashboardSummary
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        COUNT(DISTINCT p.id) AS total_products,
        ISNULL(SUM(CASE WHEN w.status = 'Active' THEN 1 ELSE 0 END), 0) AS active_warranties,
        ISNULL(SUM(CASE WHEN w.status = 'Expiring Soon' THEN 1 ELSE 0 END), 0) AS expiring_warranties,
        ISNULL(SUM(CASE WHEN w.status = 'Expired' THEN 1 ELSE 0 END), 0) AS expired_warranties,
        ISNULL((
            SELECT SUM(cost) 
            FROM dbo.Repairs r 
            WHERE r.user_id = @UserId
        ), 0.00) AS total_repair_expenditure,
        ISNULL((
            SELECT SUM(purchase_price) 
            FROM dbo.Products 
            WHERE user_id = @UserId
        ), 0.00) AS total_purchase_value
    FROM dbo.Products p
    LEFT JOIN dbo.Warranties w ON p.id = w.product_id
    WHERE p.user_id = @UserId;
END;
GO

