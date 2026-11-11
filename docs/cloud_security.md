# WarrantyWise — Cloud Security & Governance Architecture

## 1. Security Overview

WarrantyWise is built upon the **Defense-in-Depth** security philosophy. Security controls are applied across every layer of the technology stack:
- **Identity & Access Management (IAM)**
- **Application & Transport Layer Security**
- **Data Protection at Rest and in Transit**
- **Cloud Perimeter & Infrastructure Security**
- **Auditability & Traceability**

---

## 2. Authentication & Authorization Architecture

### 2.1 Password Hashing with Bcrypt
- User passwords are never stored in plaintext.
- The platform uses `bcrypt` with **10 salt rounds**, ensuring computational resistance against rainbow table and brute-force dictionary attacks.
- Each hash generates an unpredictable cryptographic salt:
  `$2a$10$q/zFGP0a0z2ViuvlCeSlqe.4SSTHkbODG0/NihAE0m3HesgLJVT0m`

### 2.2 Stateless Session Management via JWT
- Authenticated sessions use signed JSON Web Tokens (JWT) adhering to RFC 7519.
- Payload includes immutable claims: `{ id, email, role, full_name }`.
- Tokens are cryptographically signed using `HMAC-SHA256` backed by an environment secret `JWT_SECRET`.
- Short token expiration windows (`7d`) with automatic invalidation on account revocation.

### 2.3 Role-Based Access Control (RBAC)
WarrantyWise defines two distinct security principals:
1. **`User` (Standard Principal)**:
   - Constrained to the Principle of Least Privilege (PoLP).
   - Can only create, read, update, and delete their own products, repairs, and uploaded invoices.
   - Enforced at both the controller layer (`WHERE user_id = ?`) and database foreign key relationships.
2. **`Admin` (Administrative Principal)**:
   - Authorized to manage user accounts, inspect system-wide audit activity logs, view platform-wide inventory metrics, and change user access tiers.
   - Guarded by the `requireRole('Admin')` middleware.

---

## 3. Threat Mitigation Matrix

| Threat Category | Potential Attack Vector | WarrantyWise Engineering Mitigation |
| :--- | :--- | :--- |
| **SQL Injection (SQLi)** | Malicious SQL syntax in search query or product inputs | **Strict Parameterized Queries**: All database queries use parameterized placeholders (`@p0` in Azure SQL or `?` in SQLite). Raw user string concatenation into SQL statements is prohibited. |
| **Cross-Site Scripting (XSS)** | Injected JavaScript payloads in product descriptions or notes | **Input Sanitization & React Virtual DOM Escaping**: React natively escapes strings rendered in JSX. Content Security Policy headers (`X-XSS-Protection: 1; mode=block`, `X-Content-Type-Options: nosniff`) block inline script execution. |
| **Cross-Site Request Forgery (CSRF)** | Unauthorized state-changing browser requests | **Stateless Bearer Header Tokens**: APIs reject cookie-based ambient credentials; authentication requires explicit `Authorization: Bearer <token>` HTTP headers. |
| **Insecure Direct Object Reference (IDOR)** | User changing IDs in URL to view or delete another user's documents | **Dual-Constraint Verification**: All modification and retrieval queries bind both `id` AND `user_id` (`WHERE id = ? AND user_id = ?`). Attempting to access another user's resource yields `404 Not Found`. |
| **Public Blob Exposure** | Direct public scraping of uploaded invoices and receipts | **Private Azure Containers**: Azure Blob Storage container `warranty-documents` is provisioned with private access only (zero anonymous access, no public `{ access: 'blob' }` flag). Files are never accessible via raw public URLs and must be streamed through authenticated API proxy endpoints using Managed Identity (`DefaultAzureCredential`). |
| **Malicious File Uploads** | Uploading `.exe`, `.bat`, or `.php` payloads | **MIME-Type & Extension Whitelisting**: Multer middleware strictly whitelists PDF, PNG, JPG, and WebP, rejecting executables and enforcing 10MB file caps. |

---

## 4. Azure Cloud Perimeter & Network Hardening

When deployed to Microsoft Azure:

1. **Azure SQL Database Firewall**:
   - By default, all external internet access to Azure SQL is denied.
   - Firewall rules only allow connections from approved virtual networks (VNet integration) and the Azure App Service outbound IP addresses.
   - `Allow Azure services and resources to access this server` is configured strictly for the App Service subnet.
   - TLS 1.2 or higher is mandatory (`encrypt: true` in connection configuration).

2. **Azure App Service HTTPS Enforcement**:
   - `HTTPS Only` toggle enabled in Azure App Service Configuration.
   - Automatic HTTP-to-HTTPS redirect (301 Permanent Redirect).
   - Minimum TLS version pinned to TLS 1.3.

3. **Secret Governance & Passwordless Managed Identity**:
   - Zero hardcoded credentials or storage account keys in source code.
   - Azure SQL Database and Azure Blob Storage (`warrantystorage2026` / `warranty-documents`) authenticate using Azure App Service Managed Identity (`@azure/identity` `DefaultAzureCredential`).
   - Application secrets (`JWT_SECRET`) reside in Azure App Service Application Settings (optionally backed by Azure Key Vault references).
   - `.env.example` provided for safe team distribution.

---

## 5. Security Audit Trail (`ActivityLogs`)

WarrantyWise records immutable audit entries for all sensitive security and business actions:
- `USER_LOGIN`
- `FAILED_LOGIN_ATTEMPT`
- `PRODUCT_REGISTERED`
- `PRODUCT_UPDATED`
- `PRODUCT_DELETED`
- `DOCUMENT_UPLOADED`
- `DOCUMENT_DELETED`
- `PASSWORD_CHANGED`
- `ADMIN_ROLE_UPDATED`

Each entry logs the `user_id`, `action`, `entity_type`, `entity_id`, timestamp, details, and client IP address.

