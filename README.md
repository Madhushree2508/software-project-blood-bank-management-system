# HEMOLINK - Blood Bank Management System

An intelligent, full-stack 3-tier Blood Bank Management System featuring automated 90-day donor eligibility verification, 42-day cold-chain blood shelf life monitoring, FIFO transfusion order allocation, and interactive analytics.

## 🚀 Quick Start

1. Start the server:
   ```bash
   node server.js
   ```
2. Open your web browser at:
   ```
   http://localhost:3000
   ```

3. Run the automated test suite:
   ```bash
   node test_suite.js
   ```

## 👥 Instant Presentation Accounts
Use the **1-Click Role Switcher** at the top right of the navigation bar, or log in manually:

- **Admin Console:** `admin@bloodbank.org` / `password123`
- **Donor Portal:** `rahul.donor@example.com` / `password123`
- **Hospital Requisition:** `apollo.er@example.com` / `password123`

## 📁 Project Architecture & Files
- `server.js` - REST API backend with Express, JWT authentication, and clinical business rules
- `db/database.js` - Database layer with SQLite schemas, relations, and auto-seeding
- `db/schema_mysql.sql` - Complete MySQL 8.0 schema for university submissions
- `public/index.html` - Web application front-end interface
- `public/css/style.css` - Custom styling system (glassmorphism, high-contrast, responsive)
- `public/js/app.js` - UI controller, live stock matrix, forms, and portals
- `public/js/api.js` - API client and JWT handling
- `public/js/charts.js` - Chart.js visualizations
- `test_suite.js` - Automated integration testing suite (100% test pass rate)
- `PROJECT_REPORT.md` - Complete SE project documentation with all diagrams (Use Case, ER, DFD L0 & L1, Activity, Sequence, Class diagrams).
