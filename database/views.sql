-- ============================================================================
-- WarrantyWise - SQL Views for Azure SQL Database & Power BI
-- ============================================================================

-- 1. VIEW: Comprehensive Product, Warranty, and Repair Summary
-- Aggregates product specifications, category labels, warranty active status,
-- and repair expenditure per item.
CREATE OR ALTER VIEW dbo.vw_ProductWarrantyRepairSummary AS
SELECT 
    p.id AS product_id,
    p.user_id,
    u.full_name AS user_name,
    u.email AS user_email,
    p.name AS product_name,
    p.brand,
    p.model_number,
    p.serial_number,
    c.name AS category_name,
    p.purchase_date,
    p.purchase_price,
    p.currency,
    p.retailer,
    w.id AS warranty_id,
    w.provider_name AS warranty_provider,
    w.warranty_type,
    w.start_date AS warranty_start,
    w.end_date AS warranty_end,
    w.duration_months,
    CASE 
        WHEN w.end_date < CAST(GETUTCDATE() AS DATE) THEN 'Expired'
        WHEN DATEDIFF(day, CAST(GETUTCDATE() AS DATE), w.end_date) <= 30 THEN 'Expiring Soon'
        ELSE 'Active'
    END AS current_warranty_status,
    DATEDIFF(day, CAST(GETUTCDATE() AS DATE), w.end_date) AS days_remaining,
    ISNULL(r.total_repairs, 0) AS total_repairs_count,
    ISNULL(r.total_repair_cost, 0.00) AS total_repair_cost,
    (p.purchase_price + ISNULL(r.total_repair_cost, 0.00)) AS total_cost_of_ownership
FROM dbo.Products p
INNER JOIN dbo.Users u ON p.user_id = u.id
INNER JOIN dbo.Categories c ON p.category_id = c.id
LEFT JOIN dbo.Warranties w ON p.id = w.product_id
LEFT JOIN (
    SELECT 
        product_id,
        COUNT(id) AS total_repairs,
        SUM(cost) AS total_repair_cost
    FROM dbo.Repairs
    GROUP BY product_id
) r ON p.id = r.product_id;
GO

-- 2. VIEW: Upcoming Warranty Expirations (Next 30 Days)
-- Used for automated notification triggers, dashboard alert panels, and proactive reminders.
CREATE OR ALTER VIEW dbo.vw_ExpiringWarranties30Days AS
SELECT 
    w.id AS warranty_id,
    w.product_id,
    p.name AS product_name,
    p.brand,
    p.serial_number,
    u.id AS user_id,
    u.full_name AS user_name,
    u.email AS user_email,
    w.provider_name,
    w.end_date AS expiration_date,
    DATEDIFF(day, CAST(GETUTCDATE() AS DATE), w.end_date) AS days_left,
    w.support_contact,
    w.coverage_details
FROM dbo.Warranties w
INNER JOIN dbo.Products p ON w.product_id = p.id
INNER JOIN dbo.Users u ON p.user_id = u.id
WHERE w.end_date >= CAST(GETUTCDATE() AS DATE)
  AND w.end_date <= DATEADD(day, 30, CAST(GETUTCDATE() AS DATE));
GO

-- 3. VIEW: Category Expenditure & Risk Analytics (Power BI Optimized)
-- Aggregates investment vs repair maintenance costs per category across the platform.
CREATE OR ALTER VIEW dbo.vw_CategoryExpenditureAnalytics AS
SELECT 
    c.id AS category_id,
    c.name AS category_name,
    COUNT(DISTINCT p.id) AS total_products,
    ISNULL(SUM(p.purchase_price), 0.00) AS total_purchase_investment,
    ISNULL(SUM(r.total_repair_cost), 0.00) AS total_repair_spend,
    CASE 
        WHEN SUM(p.purchase_price) > 0 
        THEN ROUND((ISNULL(SUM(r.total_repair_cost), 0.00) / SUM(p.purchase_price)) * 100, 2)
        ELSE 0.00 
    END AS maintenance_cost_percentage
FROM dbo.Categories c
LEFT JOIN dbo.Products p ON c.id = p.category_id
LEFT JOIN (
    SELECT product_id, SUM(cost) AS total_repair_cost
    FROM dbo.Repairs
    GROUP BY product_id
) r ON p.id = r.product_id
GROUP BY c.id, c.name;
GO

