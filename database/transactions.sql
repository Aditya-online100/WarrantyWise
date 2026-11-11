-- ============================================================================
-- WarrantyWise - Transaction Demonstrations (COMMIT & ROLLBACK)
-- Demonstrating ACID Compliance in Azure SQL Database
-- ============================================================================

-- ============================================================================
-- DEMONSTRATION 1: SUCCESSFUL TRANSACTION (COMMIT)
-- Registers a product, its warranty, and logs an activity audit record atomically.
-- ============================================================================
PRINT '=== Starting Demonstration 1: Successful Transaction (COMMIT) ===';

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @DemoUserId INT = 1;
    DECLARE @DemoCategoryId INT = 1; -- Electronics
    DECLARE @NewProdId INT;

    -- Step 1: Insert product record
    INSERT INTO dbo.Products (
        user_id, category_id, name, brand, model_number, serial_number,
        purchase_date, purchase_price, currency, retailer, notes
    )
    VALUES (
        @DemoUserId, @DemoCategoryId, 'iPad Air M2', 'Apple', 'A2902', 'DMPZ9981LL',
        '2026-05-15', 799.00, 'USD', 'Apple Store Online', 'Bought for college coursework'
    );

    SET @NewProdId = SCOPE_IDENTITY();
    PRINT CONCAT('Inserted Product with ID: ', @NewProdId);

    -- Step 2: Insert corresponding warranty record
    INSERT INTO dbo.Warranties (
        product_id, provider_name, policy_number, warranty_type,
        duration_months, start_date, end_date, coverage_details,
        support_contact, status
    )
    VALUES (
        @NewProdId, 'AppleCare+', 'AC-99882211', 'Manufacturer',
        24, '2026-05-15', '2028-05-15', 'Accidental damage coverage with $49 deductible',
        'support.apple.com', 'Active'
    );
    PRINT 'Inserted Warranty for Product successfully.';

    -- Step 3: Insert audit log entry
    INSERT INTO dbo.ActivityLogs (user_id, action, entity_type, entity_id, details)
    VALUES (@DemoUserId, 'PRODUCT_REGISTERED', 'Product', @NewProdId, 'Transaction DEMO 1 - Successfully registered iPad Air');

    -- Commit atomic unit of work
    COMMIT TRANSACTION;
    PRINT 'SUCCESS: Transaction committed successfully. All 3 records persisted.'
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT CONCAT('ERROR in Transaction 1: ', ERROR_MESSAGE());
END CATCH;
GO

-- ============================================================================
-- DEMONSTRATION 2: INTENTIONAL FAILURE AND ROLLBACK
-- Attempts to register a repair with an invalid negative cost (violates CK_Repairs_Cost),
-- causing an error which triggers ROLLBACK to preserve database integrity.
-- ============================================================================
PRINT '=== Starting Demonstration 2: Intentional Constraint Violation (ROLLBACK) ===';

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @TargetProductId INT = 1;
    DECLARE @TargetUserId INT = 1;

    PRINT 'Step 1: Logging intention to start repair...';
    INSERT INTO dbo.ActivityLogs (user_id, action, entity_type, entity_id, details)
    VALUES (@TargetUserId, 'REPAIR_INITIATED', 'Product', @TargetProductId, 'Attempting repair registration');

    PRINT 'Step 2: Inserting Repair record with INVALID negative cost (-250.00)...';
    -- Violates CK_Repairs_Cost: CHECK (cost >= 0)
    INSERT INTO dbo.Repairs (
        product_id, user_id, repair_date, service_center, issue_description, cost, status
    )
    VALUES (
        @TargetProductId, @TargetUserId, '2026-06-01', 'Dodgy Repair Shop', 'Screen replacement', -250.00, 'Pending'
    );

    -- This point will NOT be reached because the check constraint fails immediately
    COMMIT TRANSACTION;
    PRINT 'Transaction unexpectedly committed.';
END TRY
BEGIN CATCH
    PRINT 'Constraint violation intercepted in CATCH block.';
    PRINT CONCAT('Caught Error: ', ERROR_MESSAGE());

    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION;
        PRINT 'ROLLBACK executed successfully! Step 1 activity log was discarded to maintain database consistency.';
    END
END CATCH;
GO

