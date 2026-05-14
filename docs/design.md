# Coffee Shop Order Management System Design Document

**Date:** May 11, 2026  
**Candidate:** Pesandu Wanniarachchi  
**Position:** Software Engineering Intern Assessment

## Table of Contents

1. System Overview
2. Service Architecture
   - 2.1 Service Definitions
   - 2.2 Service Communication
   - 2.3 Fault Tolerance
3. Database Design
   - 3.1 Inventory Database
   - 3.2 Order Database
4. API Design
   - 4.1 Inventory Service Endpoints
   - 4.2 Order Service Endpoints
5. Data Flow
6. Technical Stack

## 1. System Overview

This system uses a decoupled microservices architecture to manage product browsing, inventory validation, and order processing. By separating logic into independent services, we ensure the system is scalable and easier to maintain.

## 2. Service Architecture

### 2.1 Service Definitions

The system is split into two primary backend services:

- **Inventory Service (Port 5001):** Acts as the "Source of Truth" for product details and stock levels.
- **Order Service (Port 5002):** Manages customer order placement and sales history.

### 2.2 Service Communication

- **Type:** Synchronous Request-Response via REST (HTTP).
- **Flow:** The Order Service coordinates requests by calling the Inventory Service via Axios.
  - **Call 1:** `POST /api/products/validate-stock` to atomically validate and deduct stock.
  - **Call 2:** `GET /api/products` to fetch current prices, ensuring the Inventory Service remains the source of truth for pricing.

### 2.3 Fault Tolerance

- **Service Unavailability:** If the Inventory Service is offline, the Order Service returns a `503 Service Unavailable` error to prevent "ghost orders".
- **Error Propagation:**
  - Returns `404 Not Found` if a product ID does not exist.
  - Returns `400 Bad Request` if requested stock is insufficient.

## 3. Database Design

The system utilizes a Database-per-Service pattern with **MySQL** to ensure loose coupling.

### 3.1 Inventory Database

- **Table:** `products`

| Column         | Type          | Constraints                 |
| -------------- | ------------- | --------------------------- |
| id             | INT           | Primary Key, Auto-increment |
| name           | VARCHAR(100)  | Not Null                    |
| price          | DECIMAL(10,2) | Not Null                    |
| stock_quantity | INT           | Default 0                   |

### 3.2 Order Database

- **Table:** `orders`

| Column        | Type          | Constraints                 |
| ------------- | ------------- | --------------------------- |
| id            | INT           | Primary Key, Auto-increment |
| customer_name | VARCHAR(100)  | Optional                    |
| total_amount  | DECIMAL(10,2) | Not Null                    |
| created_at    | TIMESTAMP     | Default CURRENT_TIMESTAMP   |

- **Table:** `order_items`

| Column     | Type          | Constraints                 |
| ---------- | ------------- | --------------------------- |
| id         | INT           | Primary Key, Auto-increment |
| order_id   | INT           | Not Null                    |
| product_id | INT           | Not Null                    |
| quantity   | INT           | Not Null                    |
| unit_price | DECIMAL(10,2) | Not Null                    |

## 4. API Design

### 4.1 Inventory Service Endpoints

- `GET /`: Health check and DB connectivity verification.
- `GET /api/products`: Retrieve all products and stock levels.
- `POST /api/products/validate-stock`: Receives item IDs and quantities; returns a success flag and message after atomic deduction.

### 4.2 Order Service Endpoints

- `GET /`: Health check and DB connectivity verification.
- `POST /api/orders`: Create a new order after stock validation.
- `GET /api/orders`: Retrieve all past orders for history view.

## 5. Data Flow

- **Viewing Products:** React Frontend calls Inventory `GET /api/products`.
- **Creating an Order:**
  - Frontend sends `POST /api/orders` to the Order Service.
  - Order Service calls Inventory `POST /api/products/validate-stock`.
  - **Success:** Inventory returns `200 OK`; Order Service writes to `orders` table and returns success.
  - **Insufficient Stock:** Inventory returns `400 Bad Request`; Order Service forwards error to UI.
- **Viewing History:** React Frontend calls Order `GET /api/orders` to retrieve sales history.

## 6. Technical Stack

- **Frontend:** React.js.
- **Backend:** Node.js with Express.js.
- **Database:** MySQL.
- **Version Control:** Git (GitHub).
