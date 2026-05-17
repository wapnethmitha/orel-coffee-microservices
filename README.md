# Coffee Shop Microservices - Order Management System

## Overview

This project is a microservices-based Order Management System for a coffee shop. It demonstrates the use of a decoupled architecture where the frontend, product inventory, and order processing operate as independent services.

## System Architecture

- **Frontend (React):** A dashboard to browse coffee products and place orders.
- **Inventory Service (Port 5001):** Manages product stock and prices using a dedicated MySQL database.
- **Order Service (Port 5002):** Handles customer orders and communicates with the Inventory Service via Axios to validate stock before confirmation.

## Setup & Installation

### Prerequisites

- Node.js (18+ recommended)
- MySQL Server (8+ recommended)

### 1. Database Setup

Execute the scripts in the `/db` folder using MySQL Workbench or the command line:

1. Run `db/inventory_schema.sql` to create `coffee_inventory`.
2. Run `db/order_schema.sql` to create `coffee_orders`.
3. Run `db/seed.sql` to populate initial product data.

If you prefer explicit CLI commands, here are example MySQL commands you can run (adjust `-u` and `-p` as needed):

```bash
# Create schemas and tables
mysql -u root -p < db/inventory_schema.sql
mysql -u root -p < db/order_schema.sql

# Populate seed data (runs against both databases as written in the file)
mysql -u root -p < db/seed.sql
```

### 2. Configuration

In both the `inventory-service` and `order-service` folders:

1. Create a `.env` file from the `.env.example`.
2. Update `DB_PASSWORD` with your local MySQL password.

Important:

- In `order-service/.env`, ensure `INVENTORY_SERVICE_URL` points to the Inventory Service (default: `http://localhost:5001`).

Frontend (optional): you can override backend URLs via Vite env vars:

- `frontend/.env` (optional)
  - `VITE_INVENTORY_API_BASE_URL=http://localhost:5001`
  - `VITE_ORDER_API_BASE_URL=http://localhost:5002`

### 3. Running the Application

Open three separate terminal windows:

- **Inventory Service:** `cd inventory-service && npm install && npm start`
- **Order Service:** `cd order-service && npm install && npm start`
- **Frontend:** `cd frontend && npm install && npm run dev`

## Core Features

- **Stock Validation:** Real-time stock checks between Order and Inventory services.
- **Microservices Communication:** RESTful API calls using Axios.
- **Persistence:** Relational data management with MySQL.

## API Summary

### Inventory Service (Port 5001)

- `GET /` health check (includes DB check)
- `GET /api/products` list products
- `POST /api/products/validate-stock` validate + deduct stock

### Order Service (Port 5002)

- `GET /` health check (includes DB check)
- `GET /api/orders` order history (orders + items)
- `POST /api/orders` create order (calls Inventory to validate/deduct)

## Assumptions & Decisions

- Database-per-service pattern (separate MySQL databases: `coffee_inventory`, `coffee_orders`).
- Synchronous REST communication from Order Service to Inventory Service.
- Stock updates are done in Inventory Service with an atomic conditional update inside a DB transaction.
- No authentication/authorization (assessment scope).

- Compensating rollback note: The Order Service attempts a compensating rollback by calling
  the Inventory Service endpoint `/api/products/release-stock` if the local database
  transaction fails after inventory was deducted. See the implementation in
  [order-service/server.js](order-service/server.js) for details and logging behavior.

## Project Documents

- [System Design Document](docs/design.md)
- [Reflection Document](docs/reflection.md)
- Postman collection: tools/postman/Coffee Shop Microservices.postman_collection.json

## Known Limitations

- No automated tests yet.
- No Docker Compose yet.

## Branching Strategy

The repository uses clear, descriptive commit prefixes to show progress over time.

- `feat` for new features
- `docs` for documentation updates
- `chore` for maintenance or dependency updates
- `style` for UI or formatting changes

## Commit History

The repository history shows a step-by-step implementation flow:

- Inventory service setup and database connectivity
- Order service creation and inventory validation flow
- Stock validation and deduction in transactions
- Order history retrieval and frontend integration
- Frontend product loading, cart, order placement, and status indicators
- Documentation, seed data, and environment configuration updates

Recent commits also include:

- Added sample orders to the seed data
- Restructured and enhanced the README and design documents
- Added example environment configuration for the inventory service
- Added SQL schema, seed data, and proof-of-work queries

## Smoke Test (End-to-end verification)

- Date: 2026-05-15
- Environment: Local (MySQL via Workbench), Inventory service at http://localhost:5001, Order service at http://localhost:5002, Frontend at http://localhost:5173
- Purpose: Quick end-to-end verification that core requirements work (product listing, stock validation, order placement, order history).

Steps performed:

1. Inventory health: `GET /` → 200 OK
2. Fetch products: `GET /api/products` → returned 5 products (ids 1–5)
3. Place order (valid): `POST /api/orders` with items `[{product_id:1,quantity:1},{product_id:2,quantity:1}]` → 201 Created, order saved
4. Verify stock decrement: `GET /api/products` → Espresso and Latte stock decreased by 1
5. Order history: `GET /api/orders` → new order appears with items
6. Insufficient stock handling: `POST /api/orders` with excessive quantity → 400 Bad Request, no order created
7. Frontend E2E: Place order via UI → success message, cart cleared, UI updates live

Result: PASS — core end-to-end smoke tests performed by Pesandu Wanniarachchi on 2026-05-15.
