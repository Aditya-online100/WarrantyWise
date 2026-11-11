# WarrantyWise — Personal Warranty & Repair Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](LICENSE)
[![Architecture: Modular Monolith](https://img.shields.io/badge/Architecture-Modular%20Monolith-blue.svg)]()
[![Stack: React + Node.js + Express](https://img.shields.io/badge/Stack-React%20%7C%20Node%20%7C%20Express-emerald.svg)]()
[![Database: Azure SQL + SQLite Fallback](https://img.shields.io/badge/Database-Azure%20SQL%20%7C%20SQLite-azure.svg)]()
[![Cloud: Microsoft Azure](https://img.shields.io/badge/Cloud-Azure%20Blob%20%26%20SQL-0078D4.svg)]()

> **WarrantyWise** is a full-stack, cloud-ready web platform that solves the common problems of lost purchase invoices, missed warranty expiration deadlines, unorganized repair logs, and untracked maintenance costs.

---

## 📑 Table of Contents

1. [Problem Statement & Solution](#1-problem-statement--solution)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Core Features](#4-core-features)
5. [Database Architecture (3NF)](#5-database-architecture-3nf)
6. [Demo Accounts (Ready to Use)](#6-demo-accounts-ready-to-use)
7. [Getting Started (Beginner-Friendly)](#7-getting-started-beginner-friendly)
8. [Azure Cloud Configuration](#8-azure-cloud-configuration)
9. [Automated Testing & Verification](#9-automated-testing--verification)
10. [University Project Report Outline](#10-university-project-report-outline)

---

## 1. Problem Statement & Solution

### The Problem
- **Consumers misplace purchase receipts and invoices**, making warranty claims nearly impossible when electronics or appliances fail.
- **Warranty expiration dates are forgotten**, leaving consumers to pay full price for repairs that would have been covered for free under warranty.
- **Repair histories are scattered across paper slips and emails**, obscuring the true cost of maintaining an asset.
- **Consumers have no visibility into "money pit" products** whose recurring repair expenses exceed their original value.

### The Solution: WarrantyWise
WarrantyWise centralizes your purchased items, monitors warranty deadlines in real time, securely archives digital invoices in the cloud, logs service incidents, and computes financial analytics on your personal assets.

---

## 2. Technology Stack

| Layer | Technologies Selected | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, JavaScript, Tailwind CSS, Lucide Icons, Recharts | Fast, responsive, clean SaaS interface inspired by Linear and Stripe. |
| **Backend** | Node.js, Express.js, REST APIs | Modular controller architecture, centralized error handling, and file streaming. |
| **Security** | JWT (JSON Web Tokens), Bcrypt, Role-Based Access Control (RBAC) | Secure user authentication, password hashing, and user data isolation. |
| **Database** | Azure SQL Database (T-SQL) with zero-config local disk fallback | Third Normal Form (3NF) relational design with views, triggers, and procedures. |
| **Cloud Storage** | Microsoft Azure Blob Storage (with local disk fallback) | Private, encrypted object storage for PDF invoices and warranty cards. |
| **Analytics** | Recharts & Microsoft Power BI | Interactive charts and enterprise reporting datasets. |

---

## 3. Architecture Overview

WarrantyWise is built as a **Modular Monolith**:

```
React Frontend (SPA)
        │
        ▼ (HTTPS REST / Bearer JWT)
Express.js REST API Layer
        │
   ┌────┴──────────────────────────┐
   ▼                               ▼
Azure SQL Database           Azure Blob Storage
(Structured Relational Data)  (Unstructured PDF/Image Files)
```

- **Dual-Mode Database Adapter**: Automatically connects to Azure SQL Database when credentials are provided in `.env`. If running offline or without credentials, it seamlessly runs with local SQL persistence (`backend/data/warrantywise.db`).
- **Dual-Mode Storage Adapter**: Directly streams uploads to private Azure Blob Storage containers or safely stores files on local disk (`backend/uploads/`).

---

## 4. Core Features

### Feature 1: Product & Warranty Management
- Register products with brand, model number, serial number, category, purchase date, price, and retailer.
- Attach warranty terms: provider, policy number, duration, start date, and end date.
- Dynamic status calculation: **Active**, **Expiring Soon** (within 30 days), or **Expired**.
- Search by keyword, filter by category or warranty status, and sort by date or price.

### Feature 2: Repair & Service History
- Log repairs with problem description, service center, cost, repair date, technician notes, and workflow status (`Pending`, `In Progress`, `Completed`).
- Cumulative repair expenditure calculated automatically per product and platform-wide.

### Feature 3: Document Management Vault
- Upload and index purchase invoices, warranty certificates, and repair receipts (PDF, PNG, JPEG, WebP up to 10MB).
- Secure authenticated downloads directly from Azure Blob Storage.
- Never exposes private document containers publicly.

### Feature 4: Warranty Analytics Dashboard
- KPI summary cards (Total Products, Active, Expiring, Expired, Total Repair Outlay, Asset Value).
- Interactive Recharts category distribution donut chart.
- Monthly repair expense trend bar chart.
- High-Maintenance Asset Risk table identifying items where repairs exceed 30% of original price.
- Upcoming warranty expirations schedule (within 30 days).

---

## 5. Database Architecture (3NF)

Designed in Third Normal Form across seven relational tables:

1. **`Users`**: Authenticated credentials, bcrypt password hash, and RBAC roles (`User`, `Admin`).
2. **`Categories`**: Standardized classifications (Computing, Mobile, Appliances, Entertainment, Dining, Vehicles).
3. **`Products`**: Purchased assets linked to user owners and categories.
4. **`Warranties`**: Coverage duration, start/end dates, provider details, and calculated status.
5. **`Repairs`**: Service records, technicians, costs, and workflow status.
6. **`Documents`**: Invoices and receipts linked to products with cloud storage paths.
7. **`ActivityLogs`**: Immutable security audit trail.

### SQL Artifacts Included in `database/`
- **`database/schema.sql`**: Full 3NF schema with PK, FK (`ON DELETE CASCADE`), CHECK constraints, and non-clustered indexes.
- **`database/queries.sql`**: Six meaningful SQL JOIN queries with explanations.
- **`database/views.sql`**: Three reporting views (`vw_ProductWarrantyRepairSummary`, `vw_ExpiringWarranties30Days`, `vw_CategoryExpenditureAnalytics`).
- **`database/procedures.sql`**: Stored procedures (`sp_RegisterProductWithWarranty`, `sp_GetUserDashboardSummary`).
- **`database/triggers.sql`**: Automated status update and deletion audit triggers.
- **`database/transactions.sql`**: Demonstrating ACID transactions with `COMMIT` and `ROLLBACK`.
- **`database/sample_data.sql`**: Comprehensive test seed data.

---

## 6. Demo Accounts (Ready to Use)

WarrantyWise comes pre-seeded with realistic demonstration accounts:

| Role | Email Address | Password | Privileges |
| :--- | :--- | :--- | :--- |
| **Demo User** | `demo@warrantywise.com` | `Password123!` | Manages personal products, warranties, repairs, documents, and analytics. |
| **Administrator** | `admin@warrantywise.com` | `Password123!` | Access to System Administration Center, user role promotion, system telemetry, and audit logs. |

*(Note: The login screen also features one-click quick login buttons for instant evaluation!)*

---

## 7. Getting Started (Beginner-Friendly)

### Option A: One-Click Windows Launcher (Easiest)
1. Double-click **`run.bat`** in the `WarrantyWise` folder.
2. Open your web browser and navigate to: **`http://localhost:5000`**
3. Log in with either demo account!

### Option B: Running via Terminal / PowerShell

#### Step 1: Open Terminal in the WarrantyWise directory
```powershell
cd "d:\ALL PRACTICE CODES\WarrantyWise"
```

#### Step 2: Start the Application Server
```powershell
$env:PATH = "d:\ALL PRACTICE CODES\nodejs;$env:PATH"
node backend/server.js
```
The server will start on port `5000` and automatically serve both the React frontend and the Express REST API!

#### Step 3: Open in Browser
Visit **`http://localhost:5000`** in your browser.

#### Development Mode with Hot Reload (Optional)
If you wish to edit frontend code with Vite's instant Hot Module Replacement:
- **Terminal 1 (Backend)**: `node backend/server.js`
- **Terminal 2 (Frontend)**: `npm run dev --prefix frontend` (opens `http://localhost:5173`)

---

## 8. Azure Cloud Configuration

To connect WarrantyWise to Microsoft Azure services:

### 1. Azure SQL Database Setup (Managed Identity)
1. In the [Azure Portal](https://portal.azure.com), use Azure SQL Server `warrantywise-sql-2026.database.windows.net` and database `WarrantyWiseDB`.
2. Enable Microsoft Entra authentication on the Azure SQL Server, ensure **Allow Azure services and resources to access this server** is enabled, and grant the Web App `warrantywise-web-123` System-Assigned Managed Identity database access (`db_datareader`, `db_datawriter`, `db_ddladmin` or `EXECUTE`).
3. Run the idempotent schema initialization script (never drops existing tables):
   ```powershell
   npm run azure:init-db
   ```
4. Configure App Service Application Settings (no SQL password needed with Managed Identity):
   ```env
   NODE_ENV=production
   DB_SERVER=warrantywise-sql-2026.database.windows.net
   DB_NAME=WarrantyWiseDB
   DB_AUTH_MODE=managed_identity
   ```

### 2. Azure Blob Storage Setup (Private Container + Managed Identity)
1. In the Azure Portal, use Storage Account **`warrantystorage2026`** and Private Blob Container **`warranty-documents`** (Public access level: **Private / no anonymous access**).
2. Assign the Web App Managed Identity the **`Storage Blob Data Contributor`** RBAC role on the storage account or `warranty-documents` container (no storage account keys required).
3. Configure App Service Application Settings:
   ```env
   AZURE_STORAGE_ACCOUNT_NAME=warrantystorage2026
   AZURE_STORAGE_CONTAINER_NAME=warranty-documents
   ```

---

## 9. Automated Testing & Verification

WarrantyWise includes an end-to-end automated integration test suite that tests health checks, user registration, JWT login, RBAC restrictions, product CRUD, warranty calculations, repair tracking, analytics, and cascading deletion.

### To Run the Test Suite:
```powershell
$env:PATH = "d:\ALL PRACTICE CODES\nodejs;$env:PATH"
cd "d:\ALL PRACTICE CODES\WarrantyWise"
node backend/tests/api.test.js
```
Or simply double-click **`test.bat`**!

**Expected Test Output**:
```
===============================================================
🧪 WARRANTYWISE AUTOMATED INTEGRATION TEST SUITE
===============================================================
--- Suite 1: Health & System Diagnostics ---
  ✅ PASS: Health check returns 200 UP status

--- Suite 2: Authentication & RBAC ---
  ✅ PASS: Seeded demo user login succeeds and receives JWT
  ✅ PASS: Invalid password rejected with 401 Unauthorized
  ✅ PASS: Admin login succeeds with Admin role
  ✅ PASS: Regular user blocked from Admin route with 403 Forbidden
  ✅ PASS: Admin successfully accesses Admin stats route

--- Suite 3: Categories & Product Management ---
  ✅ PASS: Fetched categories list (6 standard categories)
  ✅ PASS: Listed user products (8 registered products)
  ✅ PASS: Created product with attached warranty
  ✅ PASS: Fetched single product with full warranty & repair breakdown
  ✅ PASS: Updated product information successfully

--- Suite 4: Repairs & Expenditure History ---
  ✅ PASS: Repair record registered successfully ($29.00)
  ✅ PASS: Repairs ledger retrieved with expenditure total ($364)

--- Suite 5: Warranty Analytics Dashboard ---
  ✅ PASS: Dashboard analytics accurately computed (KPIs, Category breakdown, Upcoming expirations)

--- Suite 6: Deletion & Referential Integrity ---
  ✅ PASS: Product and cascading relations deleted cleanly
  ✅ PASS: Deleted product verified removed (404 Not Found)

===============================================================
🏁 TEST RESULTS: 16 PASSED, 0 FAILED
===============================================================
```

---

## 10. University Project Report Outline

For academic submission, you can follow this structured outline:

1. **Title Page**: Project Title, Student Details, Institution Name, Submission Date.
2. **Abstract / Executive Summary**: Summary of problem statement, technological solution, and key outcomes.
3. **Introduction**: Background, motivations, objectives, and scope of WarrantyWise.
4. **Literature Review & Existing Systems**: Comparative analysis of manual receipt storage vs cloud asset tracking platforms.
5. **System Requirements & Specifications**:
   - Functional & Non-Functional Requirements.
   - Hardware and software requirements.
6. **System Design & Architecture**:
   - High-level architecture diagram.
   - Modular monolith vs microservices trade-off analysis.
   - Data flow sequence diagrams.
7. **Database Design (DBMS / DP-900)**:
   - 3NF Normalization explanation.
   - Entity-Relationship (ER) diagram.
   - Schema dictionary, constraints, and indexes.
   - Analysis of JOIN queries, Views, Stored Procedures, and Triggers.
   - ACID transaction demonstration with COMMIT and ROLLBACK.
   - Cloud mapping: Structured data (Azure SQL) vs Unstructured data (Azure Blob Storage).
8. **Security & Cloud Governance**:
   - Bcrypt password hashing and JWT authentication.
   - Role-Based Access Control (RBAC).
   - SQL Injection prevention and XSS mitigation.
   - Azure SQL firewall rules and private blob containers.
9. **Implementation Details**:
   - REST API design with endpoints breakdown.
   - React UI/UX design inspired by modern SaaS interfaces.
   - Recharts visual analytics implementation.
10. **Testing & Quality Assurance**:
    - Integration test cases and execution results.
    - User data isolation testing.
11. **Conclusion & Future Enhancements**:
    - Automatic receipt OCR using Azure AI Document Intelligence.
    - SMS/Email notifications via Azure Communication Services.
12. **References & Appendices**:
    - API documentation and complete SQL schema scripts.

