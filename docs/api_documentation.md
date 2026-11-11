# WarrantyWise — REST API Reference Documentation

All endpoints return JSON responses adhering to the following structure:
```json
{
  "success": true,
  "message": "Optional human-readable confirmation message",
  "data": { ... }
}
```

Protected endpoints require the HTTP Authorization header:
`Authorization: Bearer <JWT_TOKEN>`

---

## 1. Authentication Endpoints

### 1.1 User Registration
- **`POST /api/auth/register`**
- **Access**: Public
- **Request Body**:
  ```json
  {
    "full_name": "Alex Johnson",
    "email": "alex@example.com",
    "password": "Password123!",
    "phone": "+1 (555) 019-2834"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Registration successful! Welcome to WarrantyWise.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "user": {
      "id": 2,
      "full_name": "Alex Johnson",
      "email": "alex@example.com",
      "role": "User",
      "phone": "+1 (555) 019-2834"
    }
  }
  ```

### 1.2 User Login
- **`POST /api/auth/login`**
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "demo@warrantywise.com",
    "password": "Password123!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Login successful.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "user": {
      "id": 2,
      "full_name": "Alex Johnson",
      "email": "demo@warrantywise.com",
      "role": "User"
    }
  }
  ```

### 1.3 Get Current User Profile
- **`GET /api/auth/me`**
- **Access**: Authenticated

### 1.4 Update Profile Details
- **`PUT /api/auth/profile`**
- **Access**: Authenticated
- **Request Body**: `{ "full_name": "Alexander Johnson", "phone": "+1 (555) 304-9900" }`

### 1.5 Change Password
- **`PUT /api/auth/change-password`**
- **Access**: Authenticated
- **Request Body**: `{ "current_password": "Password123!", "new_password": "NewSecretPassword2026!" }`

---

## 2. Product & Asset Endpoints

### 2.1 List User Products
- **`GET /api/products`**
- **Access**: Authenticated (User returns own products, Admin returns system products)
- **Query Parameters**:
  - `q` (string): Search name, brand, model, serial number.
  - `category_id` (int): Filter by category ID.
  - `status` (string): `Active`, `Expiring Soon`, `Expired`.
  - `sort_by` (string): `created_at`, `price_desc`, `price_asc`, `warranty_expiring`, `name_asc`.

### 2.2 Get Product by ID
- **`GET /api/products/:id`**
- **Access**: Authenticated (Owner or Admin)
- **Response (200 OK)**: Returns full product metadata, attached warranty object, list of repairs, and list of attached documents.

### 2.3 Create Product with Warranty
- **`POST /api/products`**
- **Access**: Authenticated
- **Request Body**:
  ```json
  {
    "name": "Sony Bravia 65\" OLED TV",
    "brand": "Sony",
    "category_id": 4,
    "model_number": "XR-65A80L",
    "serial_number": "SN-88201944-B",
    "purchase_date": "2025-11-25",
    "purchase_price": 1899.99,
    "currency": "USD",
    "retailer": "Best Buy",
    "notes": "Living room entertainment setup",
    "provider_name": "Sony Care Protect Plan",
    "policy_number": "SN-WTY-77192",
    "warranty_type": "Manufacturer",
    "duration_months": 12,
    "start_date": "2025-11-25",
    "end_date": "2026-11-29",
    "coverage_details": "Full panel replacement and in-home technician dispatch"
  }
  ```

### 2.4 Update Product
- **`PUT /api/products/:id`**
- **Access**: Authenticated (Owner or Admin)

### 2.5 Delete Product
- **`DELETE /api/products/:id`**
- **Access**: Authenticated (Owner or Admin)
- Cascades deletion to attached warranties, repairs, and documents.

---

## 3. Repair & Maintenance Endpoints

### 3.1 List Repairs
- **`GET /api/repairs`**
- **Query Parameters**: `product_id`, `status` (`Pending`, `In Progress`, `Completed`), `q`.

### 3.2 Create Repair Record
- **`POST /api/repairs`**
- **Request Body**:
  ```json
  {
    "product_id": 1,
    "repair_date": "2026-10-25",
    "service_center": "Apple Authorized Service Provider",
    "issue_description": "Keyboard spacebar replacement",
    "cost": 89.00,
    "status": "Completed",
    "technician_notes": "Cleaned switch contacts and replaced top case keycap"
  }
  ```

### 3.3 Update Repair Record
- **`PUT /api/repairs/:id`**

### 3.4 Delete Repair Record
- **`DELETE /api/repairs/:id`**

---

## 4. Document Management Endpoints

### 4.1 List Documents
- **`GET /api/documents`**
- **Query Parameters**: `product_id`, `document_type` (`Invoice`, `Warranty Card`, `Repair Receipt`).

### 4.1b List Stored Objects (Azure Blob / Local Storage)
- **`GET /api/documents/storage`**
- **Access**: Authenticated (regular users scoped to `user_<id>/`, Admins view all or filter via `?user_id=`)
- Returns files currently stored in the private `warranty-documents` container (or local fallback directory).

### 4.2 Upload Document
- **`POST /api/documents/upload`**
- **Content-Type**: `multipart/form-data`
- **Form Fields**:
  - `file`: Binary file (PDF, JPEG, PNG, WebP <= 10MB)
  - `product_id`: Integer
  - `document_type`: `Invoice` | `Warranty Card` | `Repair Receipt`
  - `repair_id`: Optional Integer

### 4.3 Download Document
- **`GET /api/documents/:id/download`**
- Streams the document with proper `Content-Disposition: attachment; filename="..."` and `Content-Type`.

### 4.4 Delete Document
- **`DELETE /api/documents/:id`**
- Deletes record from database and removes object from Azure Blob Storage / disk.

---

## 5. Analytics & Dashboard Endpoints

### 5.1 Get Dashboard Analytics
- **`GET /api/analytics/dashboard`**
- **Access**: Authenticated
- **Response Data**:
  - `kpis`: Total products, active, expiring, expired, total repair spend, total asset value.
  - `category_distribution`: Array of categories with counts and investment values.
  - `top_repair_products`: Top 5 products by repair expense with cost ratios.
  - `upcoming_expirations`: Warranties expiring in next 30 days.
  - `monthly_repair_spending`: Monthly repair trend data.

---

## 6. Administration Endpoints (Admin Role Only)

### 6.1 List All System Users
- **`GET /api/admin/users`**

### 6.2 Update User Role
- **`PUT /api/admin/users/:id/role`**
- **Request Body**: `{ "role": "Admin" }` or `{ "role": "User" }`

### 6.3 System-Wide Metrics
- **`GET /api/admin/stats`**

### 6.4 Activity Audit Logs
- **`GET /api/admin/activity-logs?limit=50`**

