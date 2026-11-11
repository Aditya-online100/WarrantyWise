-- ============================================================================
-- WarrantyWise - Personal Warranty & Repair Tracker
-- Database Schema Definition (Azure SQL Database & Microsoft SQL Server)
-- Third Normal Form (3NF) Relational Design
-- Idempotent / Non-destructive: safe to execute on an existing database.
-- ============================================================================

-- 1. USERS TABLE
-- Stores authenticated users, credentials, role (User/Admin), and profile metadata.
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY CLUSTERED,
        full_name NVARCHAR(100) NOT NULL,
        email NVARCHAR(255) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        role NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_Role DEFAULT 'User'
            CONSTRAINT CK_Users_Role CHECK (role IN ('User', 'Admin')),
        phone NVARCHAR(20) NULL,
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME()
    );
END;

-- 2. CATEGORIES TABLE
-- Stores standardized product categories (Electronics, Home Appliances, Vehicles, etc.)
IF OBJECT_ID(N'dbo.Categories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Categories (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Categories PRIMARY KEY CLUSTERED,
        name NVARCHAR(100) NOT NULL CONSTRAINT UQ_Categories_Name UNIQUE,
        description NVARCHAR(500) NULL,
        icon NVARCHAR(50) NOT NULL CONSTRAINT DF_Categories_Icon DEFAULT 'tag',
        display_order INT NOT NULL CONSTRAINT DF_Categories_Order DEFAULT 0,
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_Categories_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END;

-- 3. PRODUCTS TABLE
-- Stores purchased item details, linked to the registered owner (User) and Category.
IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Products (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Products PRIMARY KEY CLUSTERED,
        user_id INT NOT NULL CONSTRAINT FK_Products_Users FOREIGN KEY REFERENCES dbo.Users(id) ON DELETE CASCADE,
        category_id INT NOT NULL CONSTRAINT FK_Products_Categories FOREIGN KEY REFERENCES dbo.Categories(id),
        name NVARCHAR(150) NOT NULL,
        brand NVARCHAR(100) NOT NULL,
        model_number NVARCHAR(100) NULL,
        serial_number NVARCHAR(100) NULL,
        purchase_date DATE NOT NULL,
        purchase_price DECIMAL(18, 2) NOT NULL CONSTRAINT DF_Products_Price DEFAULT 0.00
            CONSTRAINT CK_Products_Price CHECK (purchase_price >= 0),
        currency NVARCHAR(10) NOT NULL CONSTRAINT DF_Products_Currency DEFAULT 'USD',
        retailer NVARCHAR(150) NULL,
        notes NVARCHAR(MAX) NULL,
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_Products_UpdatedAt DEFAULT SYSUTCDATETIME()
    );
END;

-- 4. WARRANTIES TABLE
-- Stores warranty coverage terms, start/end dates, provider, and calculated status.
IF OBJECT_ID(N'dbo.Warranties', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Warranties (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Warranties PRIMARY KEY CLUSTERED,
        product_id INT NOT NULL CONSTRAINT FK_Warranties_Products FOREIGN KEY REFERENCES dbo.Products(id) ON DELETE CASCADE,
        provider_name NVARCHAR(150) NOT NULL,
        policy_number NVARCHAR(100) NULL,
        warranty_type NVARCHAR(50) NOT NULL CONSTRAINT DF_Warranties_Type DEFAULT 'Manufacturer'
            CONSTRAINT CK_Warranties_Type CHECK (warranty_type IN ('Manufacturer', 'Extended', 'Retailer', 'Third-Party')),
        duration_months INT NOT NULL CONSTRAINT CK_Warranties_Duration CHECK (duration_months > 0),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        coverage_details NVARCHAR(MAX) NULL,
        support_contact NVARCHAR(255) NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_Warranties_Status DEFAULT 'Active'
            CONSTRAINT CK_Warranties_Status CHECK (status IN ('Active', 'Expiring Soon', 'Expired')),
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_Warranties_CreatedAt DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_Warranties_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_Warranties_Dates CHECK (end_date >= start_date)
    );
END;

-- 5. REPAIRS TABLE
-- Stores maintenance and repair records, costs, service centers, and workflow status.
IF OBJECT_ID(N'dbo.Repairs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Repairs (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Repairs PRIMARY KEY CLUSTERED,
        product_id INT NOT NULL CONSTRAINT FK_Repairs_Products FOREIGN KEY REFERENCES dbo.Products(id) ON DELETE CASCADE,
        user_id INT NOT NULL CONSTRAINT FK_Repairs_Users FOREIGN KEY REFERENCES dbo.Users(id),
        repair_date DATE NOT NULL,
        service_center NVARCHAR(150) NOT NULL,
        issue_description NVARCHAR(1000) NOT NULL,
        cost DECIMAL(18, 2) NOT NULL CONSTRAINT DF_Repairs_Cost DEFAULT 0.00
            CONSTRAINT CK_Repairs_Cost CHECK (cost >= 0),
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_Repairs_Status DEFAULT 'Completed'
            CONSTRAINT CK_Repairs_Status CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
        technician_notes NVARCHAR(MAX) NULL,
        completion_date DATE NULL,
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_Repairs_CreatedAt DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_Repairs_UpdatedAt DEFAULT SYSUTCDATETIME()
    );
END;

-- 6. DOCUMENTS TABLE
-- Stores references to digital files (Invoices, Warranty Cards, Receipts) stored in Azure Blob Storage.
IF OBJECT_ID(N'dbo.Documents', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Documents (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Documents PRIMARY KEY CLUSTERED,
        product_id INT NOT NULL CONSTRAINT FK_Documents_Products FOREIGN KEY REFERENCES dbo.Products(id) ON DELETE CASCADE,
        user_id INT NOT NULL CONSTRAINT FK_Documents_Users FOREIGN KEY REFERENCES dbo.Users(id),
        repair_id INT NULL CONSTRAINT FK_Documents_Repairs FOREIGN KEY REFERENCES dbo.Repairs(id),
        document_type NVARCHAR(50) NOT NULL CONSTRAINT DF_Documents_Type DEFAULT 'Invoice'
            CONSTRAINT CK_Documents_Type CHECK (document_type IN ('Invoice', 'Warranty Card', 'Repair Receipt', 'User Manual', 'Other')),
        file_name NVARCHAR(255) NOT NULL,
        original_name NVARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL CONSTRAINT CK_Documents_Size CHECK (file_size > 0),
        mime_type NVARCHAR(100) NOT NULL,
        storage_path NVARCHAR(1000) NOT NULL,
        storage_type NVARCHAR(20) NOT NULL CONSTRAINT DF_Documents_Storage DEFAULT 'AzureBlob'
            CONSTRAINT CK_Documents_Storage CHECK (storage_type IN ('AzureBlob', 'LocalDisk')),
        upload_date DATETIME2(7) NOT NULL CONSTRAINT DF_Documents_UploadDate DEFAULT SYSUTCDATETIME()
    );
END;

-- 7. ACTIVITY LOGS TABLE (AUDIT TRAIL)
-- Captures security and administrative events for compliance and troubleshooting.
IF OBJECT_ID(N'dbo.ActivityLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ActivityLogs (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ActivityLogs PRIMARY KEY CLUSTERED,
        user_id INT NULL CONSTRAINT FK_ActivityLogs_Users FOREIGN KEY REFERENCES dbo.Users(id) ON DELETE SET NULL,
        action NVARCHAR(100) NOT NULL,
        entity_type NVARCHAR(50) NOT NULL,
        entity_id INT NULL,
        details NVARCHAR(1000) NULL,
        ip_address NVARCHAR(50) NULL,
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_ActivityLogs_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END;

-- ============================================================================
-- PERFORMANCE & SEARCH INDEXES
-- ============================================================================

-- Index products by user for lightning-fast user dashboard queries
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_UserId' AND object_id = OBJECT_ID(N'dbo.Products'))
    CREATE NONCLUSTERED INDEX IX_Products_UserId ON dbo.Products(user_id) INCLUDE (name, brand, category_id, purchase_date);

-- Index products by category
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_CategoryId' AND object_id = OBJECT_ID(N'dbo.Products'))
    CREATE NONCLUSTERED INDEX IX_Products_CategoryId ON dbo.Products(category_id);

-- Index warranties by product and expiration date for expiring warranty alerts
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Warranties_ProductId' AND object_id = OBJECT_ID(N'dbo.Warranties'))
    CREATE NONCLUSTERED INDEX IX_Warranties_ProductId ON dbo.Warranties(product_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Warranties_EndDate' AND object_id = OBJECT_ID(N'dbo.Warranties'))
    CREATE NONCLUSTERED INDEX IX_Warranties_EndDate ON dbo.Warranties(end_date) INCLUDE (status, provider_name);

-- Index repairs by product and user
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Repairs_ProductId' AND object_id = OBJECT_ID(N'dbo.Repairs'))
    CREATE NONCLUSTERED INDEX IX_Repairs_ProductId ON dbo.Repairs(product_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Repairs_UserId' AND object_id = OBJECT_ID(N'dbo.Repairs'))
    CREATE NONCLUSTERED INDEX IX_Repairs_UserId ON dbo.Repairs(user_id) INCLUDE (cost, status);

-- Index documents by product and user
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Documents_ProductId' AND object_id = OBJECT_ID(N'dbo.Documents'))
    CREATE NONCLUSTERED INDEX IX_Documents_ProductId ON dbo.Documents(product_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Documents_UserId' AND object_id = OBJECT_ID(N'dbo.Documents'))
    CREATE NONCLUSTERED INDEX IX_Documents_UserId ON dbo.Documents(user_id);

-- Index activity logs by created_at for audit queries
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ActivityLogs_CreatedAt' AND object_id = OBJECT_ID(N'dbo.ActivityLogs'))
    CREATE NONCLUSTERED INDEX IX_ActivityLogs_CreatedAt ON dbo.ActivityLogs(created_at DESC);

