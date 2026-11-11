-- ============================================================================
-- WarrantyWise - Meaningful SQL JOIN Queries Demonstration
-- Azure SQL Database & Microsoft SQL Server Compatible
-- ============================================================================

-- ============================================================================
-- QUERY 1: INNER JOIN - User Product Portfolio with Category Details
-- Purpose: Retrieves all products owned by users, joining Products, Users,
-- and Categories to produce a readable asset inventory.
-- ============================================================================
SELECT 
    p.id AS product_id,
    u.full_name AS owner_name,
    u.email AS owner_email,
    p.name AS product_name,
    p.brand,
    p.model_number,
    c.name AS category_name,
    p.purchase_date,
    p.purchase_price,
    p.currency
FROM dbo.Products p
INNER JOIN dbo.Users u ON p.user_id = u.id
INNER JOIN dbo.Categories c ON p.category_id = c.id
ORDER BY p.purchase_date DESC;

-- ============================================================================
-- QUERY 2: LEFT OUTER JOIN - Products With or Without Active Warranties
-- Purpose: Identifies all registered products and their current warranty coverage.
-- Products without an attached warranty still appear (showing NULL warranty info),
-- alerting users to unprotected assets.
-- ============================================================================
SELECT 
    p.id AS product_id,
    p.name AS product_name,
    p.brand,
    ISNULL(w.provider_name, 'NO WARRANTY ATTACHED') AS warranty_provider,
    w.warranty_type,
    w.start_date,
    w.end_date,
    ISNULL(w.status, 'Unprotected') AS warranty_status,
    DATEDIFF(day, CAST(GETUTCDATE() AS DATE), w.end_date) AS days_remaining
FROM dbo.Products p
LEFT OUTER JOIN dbo.Warranties w ON p.id = w.product_id
ORDER BY w.end_date ASC;

-- ============================================================================
-- QUERY 3: MULTI-TABLE JOIN WITH AGGREGATION - Total Repair Cost per Product
-- Purpose: Joins Products, Categories, and Repairs to calculate total repair expenses
-- and maintenance count per product, filtered to items that have incurred repairs.
-- ============================================================================
SELECT 
    p.id AS product_id,
    p.name AS product_name,
    p.brand,
    c.name AS category,
    p.purchase_price,
    COUNT(r.id) AS number_of_repairs,
    SUM(r.cost) AS total_repair_expenditure,
    ROUND((SUM(r.cost) / NULLIF(p.purchase_price, 0)) * 100, 2) AS repair_to_purchase_ratio_pct
FROM dbo.Products p
INNER JOIN dbo.Categories c ON p.category_id = c.id
INNER JOIN dbo.Repairs r ON p.id = r.product_id
GROUP BY p.id, p.name, p.brand, c.name, p.purchase_price
HAVING SUM(r.cost) > 0
ORDER BY total_repair_expenditure DESC;

-- ============================================================================
-- QUERY 4: THREE-WAY JOIN - Document Vault Linking Products, Warranties & Receipts
-- Purpose: Produces an itemized audit of digital documents uploaded to Azure Blob Storage,
-- mapping each file to its associated product, category, and document type.
-- ============================================================================
SELECT 
    d.id AS document_id,
    p.name AS product_name,
    c.name AS category_name,
    d.document_type,
    d.original_name,
    ROUND(CAST(d.file_size AS FLOAT) / 1024.0, 2) AS size_kb,
    d.mime_type,
    d.storage_path,
    d.upload_date
FROM dbo.Documents d
INNER JOIN dbo.Products p ON d.product_id = p.id
INNER JOIN dbo.Categories c ON p.category_id = c.id
ORDER BY d.upload_date DESC;

-- ============================================================================
-- QUERY 5: COMPLEX JOIN - High-Maintenance Assets Requiring Strategic Replacement
-- Purpose: Evaluates products whose total repair expenses exceed 30% of their original
-- purchase price, joining Users, Products, Warranties, and aggregate Repairs.
-- ============================================================================
SELECT 
    u.full_name AS owner_name,
    p.name AS product_name,
    p.brand,
    p.purchase_date,
    p.purchase_price,
    ISNULL(w.status, 'Expired') AS warranty_status,
    agg.total_repairs,
    agg.total_repair_cost,
    ROUND((agg.total_repair_cost / p.purchase_price) * 100, 1) AS repair_percent_of_cost,
    CASE 
        WHEN agg.total_repair_cost >= (p.purchase_price * 0.5) THEN 'High Risk - Consider Replacement'
        WHEN agg.total_repair_cost >= (p.purchase_price * 0.3) THEN 'Moderate Risk - Monitor Closely'
        ELSE 'Normal Maintenance'
    END AS financial_recommendation
FROM dbo.Products p
INNER JOIN dbo.Users u ON p.user_id = u.id
LEFT JOIN dbo.Warranties w ON p.id = w.product_id
INNER JOIN (
    SELECT 
        product_id,
        COUNT(id) AS total_repairs,
        SUM(cost) AS total_repair_cost
    FROM dbo.Repairs
    GROUP BY product_id
) agg ON p.id = agg.product_id
WHERE agg.total_repair_cost > (p.purchase_price * 0.30)
ORDER BY agg.total_repair_cost DESC;

-- ============================================================================
-- QUERY 6: LEFT JOIN WITH COALESCE - Category Expenditure Breakdown for Power BI
-- Purpose: Aggregates total purchase investment, active product counts, and repair
-- spend per category, including categories with zero registered items.
-- ============================================================================
SELECT 
    c.name AS category_name,
    COUNT(DISTINCT p.id) AS product_count,
    COALESCE(SUM(p.purchase_price), 0.00) AS total_purchased_amount,
    COALESCE(SUM(r.cost), 0.00) AS total_repaired_amount,
    COALESCE(SUM(p.purchase_price), 0.00) + COALESCE(SUM(r.cost), 0.00) AS grand_total_cost
FROM dbo.Categories c
LEFT JOIN dbo.Products p ON c.id = p.category_id
LEFT JOIN dbo.Repairs r ON p.id = r.product_id
GROUP BY c.id, c.name
ORDER BY grand_total_cost DESC;

