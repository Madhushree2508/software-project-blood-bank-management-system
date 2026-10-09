# HEMOLINK: INTELLIGENT BLOOD BANK MANAGEMENT SYSTEM
## Comprehensive Software Engineering (SE) Project Report & Architecture Specification

---

### Executive Summary
**Hemolink** is an enterprise-grade 3-tier Blood Bank Management System designed to bridge the critical gap between voluntary blood donors, hospital emergency transfusion units, and centralized blood repositories. The system enforces clinical safety protocols—including an automated 90-day donor cooldown period, 42-day whole blood shelf-life tracking, and FIFO (First-In, First-Out) inventory allocation for life-saving transfusion orders.

---

## 1. System Architecture (3-Tier Design)

The system strictly adheres to the standard 3-Tier Enterprise Architecture:

```mermaid
graph TD
    subgraph Presentation_Layer ["1. Presentation Layer (Frontend Client)"]
        UI1["Interactive Web UI (HTML5, Vanilla CSS Design System, ES6 JavaScript)"]
        UI2["Portals: Donor Portal | Hospital Transfusion Portal | Admin Command Center"]
        UI3["Data Visualizations: Chart.js Bar, Line & Doughnut Gauges"]
    end

    subgraph Application_Layer ["2. Application Layer (REST API & Business Rules)"]
        API["Node.js / Express REST API Engine"]
        SEC["JWT Token Authentication & Role-Based Access Control (RBAC)"]
        RULES["Clinical Business Logic Engine:<br/>- 90-day Donor Cooldown Calculator<br/>- 42-day Blood Bag Expiry Tracker<br/>- FIFO Stock Allocation Algorithm"]
    end

    subgraph Data_Layer ["3. Data Layer (Relational Storage)"]
        DB[("Relational Database (SQLite / MySQL 8.0)")]
        T1["users & donors"]
        T2["blood_inventory (Cold Chain)"]
        T3["blood_requests & donations"]
        T4["notifications & audit_logs"]
    end

    Presentation_Layer -->|HTTP / JSON REST Calls| Application_Layer
    Application_Layer -->|SQL Queries & Transactions| Data_Layer
    Data_Layer -->|Result Sets| Application_Layer
    Application_Layer -->|JSON Responses| Presentation_Layer
```

---

## 2. Use Case Diagram

*Reflecting the system use cases identified in the design specifications:*

```mermaid
flowchart LR
    Donor(("🙋 Donor"))
    Recipient(("🏥 Recipient / Hospital"))
    Admin(("🛡️ Admin"))

    subgraph System_Boundary ["Blood Bank Management System"]
        UC1(["Register / Login"])
        UC2(["Book Donation Slot"])
        UC3(["View Donation / Request History"])
        UC4(["Search Blood Stock"])
        UC5(["Request Blood Transfusion"])
        UC6(["Manage Inventory & Shelf Life"])
        UC7(["Approve / Reject Blood Requests"])
        UC8(["Generate Reports & Visual Analytics"])
    end

    Donor --> UC1
    Donor --> UC2
    Donor --> UC3
    Donor --> UC4

    Recipient --> UC1
    Recipient --> UC3
    Recipient --> UC4
    Recipient --> UC5

    Admin --> UC1
    Admin --> UC4
    Admin --> UC6
    Admin --> UC7
    Admin --> UC8
```

---

## 3. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    USERS ||--o| DONORS : "extends as donor"
    USERS ||--o| RECIPIENTS : "extends as recipient"
    USERS ||--o{ NOTIFICATIONS : "receives"
    DONORS ||--o{ DONATIONS : "participates in"
    DONORS ||--o{ BLOOD_INVENTORY : "supplies"
    RECIPIENTS ||--o{ BLOOD_REQUESTS : "initiates"

    USERS {
        int id PK
        string name
        string email UK
        string password_hash
        string role
        string phone
        string city
        string address
        datetime created_at
    }

    DONORS {
        int id PK
        int user_id FK
        string blood_group
        int age
        string gender
        decimal weight
        date last_donation_date
        text medical_notes
        int is_available
    }

    RECIPIENTS {
        int id PK
        int user_id FK
        string organization_type
        string hospital_name
        string license_number
        string emergency_contact
    }

    BLOOD_INVENTORY {
        int id PK
        string unit_code UK
        string blood_group
        date donation_date
        date expiry_date
        string status
        int volume_ml
        string storage_location
        int donor_id FK
    }

    DONATIONS {
        int id PK
        int donor_id FK
        date donation_date
        string blood_group
        int units_collected
        decimal hemoglobin_level
        int pulse_rate
        string blood_pressure
        string status
        text notes
    }

    BLOOD_REQUESTS {
        int id PK
        int recipient_id FK
        string patient_name
        string blood_group
        int units_requested
        int units_allocated
        string urgency
        string hospital_name
        string doctor_name
        text reason
        string status
        text admin_notes
        datetime request_date
        datetime resolved_at
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK
        string title
        text message
        string type
        int is_read
        datetime created_at
    }
```

---

## 4. Data Flow Diagrams (DFD)

### Level 0: Context Diagram
```mermaid
flowchart TD
    D[Donor] -->|Registration & Appointment Request| BBMS((Blood Bank System))
    H[Hospital / Recipient] -->|Blood Requisition Order| BBMS
    A[Blood Bank Admin] -->|Inventory Logs & Decision Notes| BBMS

    BBMS -->|Eligibility Status & Confirmation| D
    BBMS -->|Transfusion Approval & Dispatched Units| H
    BBMS -->|Stock Analytics, Expiry Alerts & Reports| A
```

### Level 1: Subsystem Data Flow
```mermaid
flowchart TD
    subgraph Processes ["Core Functional Processes"]
        P1["1.0 Authentication & RBAC"]
        P2["2.0 Donor Eligibility & Booking"]
        P3["3.0 Inventory & Expiry Monitor"]
        P4["4.0 Request Processing & FIFO Allocation"]
        P5["5.0 Executive Reporting Engine"]
    end

    subgraph Data_Stores ["Data Stores"]
        DS1[("D1: Users & Profiles")]
        DS2[("D2: Blood Inventory")]
        DS3[("D3: Donations")]
        DS4[("D4: Blood Requests")]
    end

    User[External Users] -->|Credentials| P1
    P1 -->|Query & Validate| DS1

    Donor[Donor] -->|Slot Booking| P2
    P2 -->|Check Age & 90-Day Rule| DS1
    P2 -->|Record Session| DS3
    P2 -->|Add New Blood Unit| DS2

    Hospital[Hospital] -->|Requisition| P4
    P4 -->|Create Requisition| DS4
    Admin[Admin] -->|Approve Requisition| P4
    P4 -->|FIFO Stock Deduction| DS2

    P3 -->|Evaluate Expiry 42-day & Low Stock| DS2
    P5 -->|Aggregate Metrics| DS2
    P5 -->|Aggregate Metrics| DS3
    P5 -->|Aggregate Metrics| DS4
```

---

## 5. Activity Diagram: Blood Request & Transfusion Workflow

```mermaid
stateDiagram-v2
    [*] --> RecipientSubmitsRequest : Recipient / Hospital fills patient details, blood group, units & urgency
    RecipientSubmitsRequest --> AdminNotification : Request logged with status = 'Pending'
    AdminNotification --> AdminEvaluatesRequest : Admin reviews stock in Cold Storage

    state StockCheck <<choice>>
    AdminEvaluatesRequest --> StockCheck : Stock Availability Check

    StockCheck --> InsufficientStock : Available Units < Requested Units
    InsufficientStock --> AdminRejects : Admin enters refusal reason
    AdminRejects --> RecipientNotifiedDeclined : Notification sent to hospital
    RecipientNotifiedDeclined --> [*]

    StockCheck --> StockAvailable : Available Units >= Requested Units
    StockAvailable --> FIFOBagAllocation : System selects oldest non-expired units (FIFO Rule)
    FIFOBagAllocation --> UpdateInventoryStatus : Marked units as 'Issued'
    UpdateInventoryStatus --> UpdateRequestStatus : Request status updated to 'Approved'
    UpdateRequestStatus --> RecipientNotifiedApproved : Unit codes dispatched to hospital
    RecipientNotifiedApproved --> [*]
```

---

## 6. Sequence Diagram: Donor Login & Slot Booking

```mermaid
sequenceDiagram
    autonumber
    actor Donor as Donor (Client)
    participant Auth as Auth Controller
    participant DonorCtrl as Donor Controller
    participant DB as Relational Database

    Donor ->> Auth: POST /api/auth/login {email, password}
    Auth ->> DB: SELECT * FROM users WHERE email = ?
    DB -->> Auth: User record + password_hash
    Auth ->> Auth: Verify bcrypt password hash
    Auth -->> Donor: 200 OK {token: JWT, user: {id, role: 'donor'}}

    Donor ->> DonorCtrl: GET /api/donors/profile (Bearer JWT)
    DonorCtrl ->> DB: SELECT * FROM donors WHERE user_id = ?
    DB -->> DonorCtrl: Donor profile (age, weight, last_donation_date)
    DonorCtrl ->> DonorCtrl: Check Age >= 18 & Cooldown (Today - last_donation_date >= 90 days)
    DonorCtrl -->> Donor: 200 OK {donor, eligibility: {isEligible, reasons, nextEligibleDate}}

    opt If Donor Is Eligible
        Donor ->> DonorCtrl: POST /api/donations/book {donation_date, notes}
        DonorCtrl ->> DB: INSERT INTO donations (donor_id, donation_date, status='Scheduled')
        DB -->> DonorCtrl: Insert OK (donationId)
        DonorCtrl ->> DB: INSERT INTO notifications (user_id, title, message)
        DonorCtrl -->> Donor: 201 Created {message: 'Slot booked successfully'}
    end
```

---

## 7. Class Diagram (Object-Oriented Design)

```mermaid
classDiagram
    class User {
        +int id
        +string name
        +string email
        +string passwordHash
        +string role
        +string phone
        +string city
        +register()
        +login(email, password)
        +getProfile()
    }

    class Donor {
        +int donorId
        +string bloodGroup
        +int age
        +float weight
        +Date lastDonationDate
        +bool isAvailable
        +checkEligibility() EligibilityResult
        +bookDonationSlot(date, notes)
        +viewDonationHistory()
    }

    class Recipient {
        +int recipientId
        +string orgType
        +string hospitalName
        +string licenseNumber
        +submitBloodRequest(requestDetails)
        +trackOrders()
    }

    class Admin {
        +reviewPendingRequests()
        +approveRequest(requestId, adminNotes)
        +rejectRequest(requestId, reason)
        +recordDonationIntake(sessionData)
        +discardExpiredUnits()
        +generateAnalyticsReport()
    }

    class BloodInventory {
        +int unitId
        +string unitCode
        +string bloodGroup
        +Date donationDate
        +Date expiryDate
        +string status
        +int volumeMl
        +string storageLocation
        +isExpired() bool
        +isNearExpiry() bool
        +markIssued()
        +markDiscarded()
    }

    class BloodRequest {
        +int requestId
        +string patientName
        +string bloodGroup
        +int unitsRequested
        +int unitsAllocated
        +string urgency
        +string hospitalName
        +string status
        +Date requestDate
        +allocateUnits(unitList)
    }

    User <|-- Donor
    User <|-- Recipient
    User <|-- Admin
    Donor "1" --> "*" BloodInventory : donates
    Recipient "1" --> "*" BloodRequest : requisitions
    Admin "1" ..> "*" BloodRequest : approves/rejects
    Admin "1" ..> "*" BloodInventory : manages
```

---

## 8. REST API Endpoints Specification

| Method | Endpoint | Authorization | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Registers user with role (`admin`, `donor`, `recipient`) |
| `POST` | `/api/auth/login` | Public | Authenticates credentials and returns signed JWT token |
| `GET` | `/api/auth/me` | Authenticated | Retrieves current authenticated profile & role attributes |
| `GET` | `/api/inventory/summary` | Public | Live count of available units across all 8 blood groups + near expiry |
| `GET` | `/api/inventory/units` | Admin | Detailed unit-level list with cold storage bay and expiry filters |
| `POST` | `/api/inventory/discard-expired` | Admin | Purges expired units past 42 days from active reserves |
| `GET` | `/api/donors/profile` | Donor / Admin | Returns donor demographics and automated eligibility verdict |
| `GET` | `/api/donors/emergency-search` | Public | Finds eligible active donors filtered by blood group and city |
| `POST` | `/api/donations/book` | Donor | Schedules appointment slot (validated against 90-day cooldown) |
| `POST` | `/api/donations/record` | Admin | Logs physical blood donation and automatically creates bag with +42d expiry |
| `POST` | `/api/requests` | Recipient / Admin | Submits urgent transfusion requisition with hospital details |
| `GET` | `/api/requests/my` | Recipient | Tracks submission status (Pending, Approved, Rejected) |
| `GET` | `/api/requests/all` | Admin | Full console of all requisitions across hospitals |
| `PUT` | `/api/requests/:id/action` | Admin | Approves (triggers FIFO inventory deduction) or rejects request |
| `GET` | `/api/reports/dashboard` | Admin | Aggregated metrics & datasets for Chart.js dashboards |

---

## 9. Verification & Automated Test Results Matrix

The built-in test suite was executed against the running instance:

| Test ID | Test Category | Scenario | Expected Result | Status |
|---|---|---|---|---|
| **TC-01** | Authentication | Admin Login | 200 OK + Valid JWT token | ✅ PASS |
| **TC-02** | Authentication | Donor Login | 200 OK + Role 'donor' returned | ✅ PASS |
| **TC-03** | Authentication | Hospital / Recipient Login | 200 OK + Role 'recipient' returned | ✅ PASS |
| **TC-04** | Medical Rules | 90-Day Donor Cooldown | Ineligible if donation < 90 days ago; countdown returned | ✅ PASS |
| **TC-05** | Inventory | 8 Blood Groups Coverage | Live count for A+, A-, B+, B-, AB+, AB-, O+, O- | ✅ PASS |
| **TC-06** | Cold Chain | Near-Expiry Flagging | Identifies units within 7 days of 42-day lifespan | ✅ PASS |
| **TC-07** | Search | Emergency City/Group Filter | Finds eligible verified donors in requested city | ✅ PASS |
| **TC-08** | Transfusion | Requisition Submission | 201 Created + Unique Request ID issued | ✅ PASS |
| **TC-09** | Transfusion | Admin Approval & FIFO Deduction | Auto-allocates oldest units, marks 'Issued', notifies hospital | ✅ PASS |
| **TC-10** | Donation Intake | Unit Auto-Generation | Barcode created, expiry set to donation date + 42 days | ✅ PASS |
| **TC-11** | Analytics | Executive Reporting | Dynamic fulfillment rate, stock distribution, 6-month trends | ✅ PASS |

**Test Outcome:** **18/18 Automated Test Assertions Passed (100%)**

---

## 10. Execution & Setup Instructions

### Prerequisites
- Node.js (v18+)
- (Optional) MySQL 8.0+ if choosing external database server

### 1. Run with SQLite (Zero Configuration - Ready Instantly)
```bash
# Navigate to project directory
cd "c:\Users\madhu\OneDrive\Desktop\SE PROJECT"

# Install dependencies (if not already installed)
npm install

# Start the server
node server.js
```
The application will be live at: **`http://localhost:3000`**

### 2. Run Automated Integration Test Suite
```bash
node test_suite.js
```

### 3. Using MySQL (Optional University Submission)
1. Open MySQL Workbench or phpMyAdmin.
2. Open and execute the script: `db/schema_mysql.sql`.
3. The database `blood_bank_db` will be initialized with matching tables and indexes.

---

### Demo Accounts for Evaluators / Presentations
| Role | Email | Password | Access Highlights |
|---|---|---|---|
| **System Admin** | `admin@bloodbank.org` | `password123` | Request Approval, Intake Logging, Discard Expired, Full Analytics |
| **Blood Donor** | `rahul.donor@example.com` | `password123` | Eligibility Gauge, Slot Booking, Donation History |
| **Hospital / Recipient** | `apollo.er@example.com` | `password123` | Emergency Blood Requisition, Order Dispatch Tracker |
