-- ============================================================================
-- WarrantyWise - Comprehensive Sample Seed Data
-- Realistic Test Data for Demonstrations & Evaluation
-- Default demo password for all seeded users: Password123!
-- ============================================================================

-- 1. SEED USERS
-- Default password: Password123!
INSERT INTO dbo.Users (full_name, email, password_hash, role, phone)
VALUES 
('System Administrator', 'admin@warrantywise.com', '$2a$10$q/zFGP0a0z2ViuvlCeSlqe.4SSTHkbODG0/NihAE0m3HesgLJVT0m', 'Admin', '+1 (555) 019-2834'),
('Alex Johnson', 'demo@warrantywise.com', '$2a$10$q/zFGP0a0z2ViuvlCeSlqe.4SSTHkbODG0/NihAE0m3HesgLJVT0m', 'User', '+1 (555) 304-8821'),
('Sarah Miller', 'sarah@example.com', '$2a$10$q/zFGP0a0z2ViuvlCeSlqe.4SSTHkbODG0/NihAE0m3HesgLJVT0m', 'User', '+1 (555) 912-4409');

-- 2. SEED CATEGORIES
INSERT INTO dbo.Categories (name, description, icon, display_order)
VALUES 
('Computing & Laptops', 'Laptops, desktop PCs, workstations, and computing accessories', 'laptop', 1),
('Mobile & Tablets', 'Smartphones, iPads, tablets, smartwatches, and wearables', 'smartphone', 2),
('Home Appliances', 'Refrigerators, washing machines, microwaves, vacuums, and air conditioners', 'home', 3),
('Audio & Entertainment', 'Smart TVs, soundbars, headphones, gaming consoles, and speakers', 'tv', 4),
('Kitchen & Dining', 'Espresso machines, blenders, air fryers, and culinary gadgets', 'coffee', 5),
('Vehicles & Mobility', 'Cars, e-bikes, scooters, and automotive accessories', 'car', 6);

-- 3. SEED PRODUCTS FOR DEMO USER (User ID: 2)
INSERT INTO dbo.Products (user_id, category_id, name, brand, model_number, serial_number, purchase_date, purchase_price, currency, retailer, notes)
VALUES 
(2, 1, 'MacBook Pro 16" M3 Max', 'Apple', 'A2991', 'C02G8990MD6R', '2026-01-10', 3499.00, 'USD', 'Apple Store Regent St', 'Primary development and video editing workstation'),
(2, 4, 'Sony Bravia 65" XR OLED TV', 'Sony', 'XR-65A80L', 'SN-88201944-B', '2025-11-25', 1899.99, 'USD', 'Best Buy', 'Living room entertainment center'),
(2, 3, 'Dyson V15 Detect Cordless Vacuum', 'Dyson', 'V15-ABS', 'DY-99214-X', '2024-08-14', 749.99, 'USD', 'Target', 'Includes laser slim fluffy head and hair screw tool'),
(2, 2, 'Samsung Galaxy S24 Ultra', 'Samsung', 'SM-S928B', 'R5CW301828A', '2026-03-05', 1299.00, 'USD', 'Samsung Official Store', 'Titanium Gray, 512GB storage'),
(2, 3, 'LG French Door Smart Refrigerator', 'LG', 'LRFCS2503S', 'LG-8871029', '2025-06-18', 2199.00, 'USD', 'Home Depot', 'Smart Wi-Fi enabled with dual ice maker'),
(2, 1, 'Dell UltraSharp 32" 4K USB-C Hub Monitor', 'Dell', 'U3223QE', 'CN-0P8219-74441', '2025-11-28', 829.50, 'USD', 'Dell.com', 'IPS Black technology with 90W Power Delivery'),
(2, 4, 'Bose QuietComfort 45 Headphones', 'Bose', 'QC45-BLK', 'BOS-4481023', '2024-03-12', 329.00, 'USD', 'Amazon', 'Active noise cancelling wireless headphones'),
(2, 5, 'DeLonghi Magnifica S Espresso Machine', 'DeLonghi', 'ECAM22110B', 'DL-20239100', '2026-02-14', 649.95, 'USD', 'Williams Sonoma', 'Bean-to-cup automated coffee machine');

-- 4. SEED WARRANTIES
-- End dates dynamically adjusted relative to current timeframe
INSERT INTO dbo.Warranties (product_id, provider_name, policy_number, warranty_type, duration_months, start_date, end_date, coverage_details, support_contact, status)
VALUES 
-- MacBook Pro: Active warranty (2026-01-10 to 2028-01-10)
(1, 'AppleCare+ for Mac', 'AC-MAC-98231', 'Manufacturer', 24, '2026-01-10', '2028-01-10', 'Accidental damage protection with priority 24/7 technical support', 'apple.com/support / 1-800-APL-CARE', 'Active'),

-- Sony Bravia: Expiring Soon warranty (ends in ~18 days)
(2, 'Sony Care Protect Plan', 'SN-WTY-77192', 'Manufacturer', 12, '2025-11-25', '2026-11-29', 'Full panel replacement and in-home technician dispatch', 'support.sony.com / 1-800-222-7669', 'Expiring Soon'),

-- Dyson Vacuum: Expired warranty (ended 2025-08-14)
(3, 'Dyson 2-Year Limited Warranty', 'DY-LTD-1092', 'Manufacturer', 12, '2024-08-14', '2025-08-14', 'Parts and labor coverage for mechanical failure', 'dyson.com/support', 'Expired'),

-- Galaxy S24 Ultra: Active warranty (ends 2027-03-05)
(4, 'Samsung Care+', 'SC-GAL-33810', 'Manufacturer', 24, '2026-03-05', '2027-03-05', 'Covers screen cracks, liquid spills, and battery degradation', 'samsungcareplus.com', 'Active'),

-- LG Refrigerator: Active warranty (ends 2027-06-18)
(5, 'LG Appliance Protection', 'LG-REF-99012', 'Manufacturer', 24, '2025-06-18', '2027-06-18', 'Linear compressor covered for 10 years, all parts covered 2 years', 'lg.com/us/support', 'Active'),

-- Dell Monitor: Expiring Soon warranty (ends in ~21 days)
(6, 'Dell Premium Panel Exchange', 'DELL-MON-4412', 'Manufacturer', 12, '2025-11-28', '2026-12-02', 'Zero bright-dot guarantee and advanced device exchange', 'dell.com/monitorsupport', 'Expiring Soon'),

-- Bose QC45: Expired warranty (ended 2025-03-12)
(7, 'Bose Standard Limited Warranty', 'BOSE-4819-A', 'Manufacturer', 12, '2024-03-12', '2025-03-12', 'Factory defect warranty', 'bose.com/support', 'Expired'),

-- DeLonghi Espresso Machine: Active warranty (ends 2027-02-14)
(8, 'DeLonghi Club Care', 'DL-ESP-88192', 'Extended', 24, '2026-02-14', '2027-02-14', 'Annual descaling kit + free pump and boiler maintenance', 'delonghi.com/service', 'Active');

-- 5. SEED REPAIRS
INSERT INTO dbo.Repairs (product_id, user_id, repair_date, service_center, issue_description, cost, status, technician_notes, completion_date)
VALUES 
-- Repair on Dyson Vacuum (Completed)
(3, 2, '2025-04-10', 'Dyson Authorized Service Hub', 'Motor stopped spinning; battery indicator flashing red 10 times', 125.00, 'Completed', 'Replaced digital motor assembly and cleaned cyclonic filters', '2025-04-14'),

-- Repair on Bose QC45 (Completed)
(7, 2, '2024-11-05', 'AudioFix Specialists', 'Left ear cup audio cutting out intermittently when pivoting headband', 65.00, 'Completed', 'Re-soldered ribbon cable connector inside left hinge assembly', '2024-11-08'),

-- Repair on LG Refrigerator (Completed)
(5, 2, '2026-03-22', 'Sears Home Services / LG Certified', 'Ice maker jamming and leaking small amounts of water in freezer tray', 145.00, 'Completed', 'Replaced solenoid water inlet valve and recalibrated optical ice sensor', '2026-03-24'),

-- Repair on MacBook Pro (In Progress)
(1, 2, '2026-11-02', 'Apple Store Regent St Genius Bar', 'Sticky spacebar and slight liquid stain on keycap switch', 0.00, 'In Progress', 'Covered under AppleCare+ zero dollar accidental keyboard repair tier', NULL),

-- Repair on Sony Bravia TV (Pending)
(2, 2, '2026-11-08', 'Sony Direct Care Dispatch', 'Intermittent HDMI eARC audio handshake dropouts with Sonos Arc soundbar', 0.00, 'Pending', 'Awaiting field engineer visit before warranty expiration window closes', NULL);

-- 6. SEED DOCUMENTS
INSERT INTO dbo.Documents (product_id, user_id, repair_id, document_type, file_name, original_name, file_size, mime_type, storage_path, storage_type, upload_date)
VALUES 
(1, 2, NULL, 'Invoice', 'invoice_macbook_pro_m3.pdf', 'Apple_Store_Invoice_C02G8990.pdf', 245760, 'application/pdf', 'documents/demo_user_2/invoice_macbook_pro_m3.pdf', 'AzureBlob', '2026-01-10 11:30:00'),
(1, 2, NULL, 'Warranty Card', 'warranty_applecare_m3.pdf', 'AppleCare_Plus_Certificate.pdf', 184320, 'application/pdf', 'documents/demo_user_2/warranty_applecare_m3.pdf', 'AzureBlob', '2026-01-10 11:32:00'),
(2, 2, NULL, 'Invoice', 'invoice_sony_bravia_65.pdf', 'BestBuy_Receipt_65A80L.pdf', 312400, 'application/pdf', 'documents/demo_user_2/invoice_sony_bravia_65.pdf', 'AzureBlob', '2025-11-25 18:22:00'),
(3, 2, 1, 'Repair Receipt', 'receipt_dyson_motor_repair.pdf', 'DysonService_WorkOrder_125USD.pdf', 158900, 'application/pdf', 'documents/demo_user_2/receipt_dyson_motor_repair.pdf', 'AzureBlob', '2025-04-14 16:45:00'),
(4, 2, NULL, 'Invoice', 'invoice_galaxy_s24_ultra.pdf', 'Samsung_TaxInvoice_S24Ultra.pdf', 420100, 'application/pdf', 'documents/demo_user_2/invoice_galaxy_s24_ultra.pdf', 'AzureBlob', '2026-03-05 09:15:00'),
(5, 2, 3, 'Repair Receipt', 'receipt_lg_fridge_valve.pdf', 'LG_RepairInvoice_March2026.pdf', 198500, 'application/pdf', 'documents/demo_user_2/receipt_lg_fridge_valve.pdf', 'AzureBlob', '2026-03-24 14:10:00');

-- 7. SEED INITIAL ACTIVITY LOGS
INSERT INTO dbo.ActivityLogs (user_id, action, entity_type, entity_id, details)
VALUES 
(2, 'USER_LOGIN', 'User', 2, 'Successful authentication from Web Portal'),
(2, 'PRODUCT_REGISTERED', 'Product', 1, 'Registered MacBook Pro 16" M3 Max with AppleCare+'),
(2, 'DOCUMENT_UPLOADED', 'Document', 1, 'Uploaded purchase invoice for MacBook Pro'),
(2, 'REPAIR_LOGGED', 'Repair', 1, 'Logged Dyson vacuum repair ($125.00)'),
(2, 'PRODUCT_REGISTERED', 'Product', 4, 'Registered Samsung Galaxy S24 Ultra'),
(1, 'USER_LOGIN', 'User', 1, 'Admin logged in to system dashboard');

