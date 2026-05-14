# Order Service

This service manages the ordering lifecycle, including customer details and transaction history.

## Tech Stack

- Node.js & Express
- MySQL
- Axios (for inter-service communication)

## Key Functionality

This service performs a "stock check" by calling the Inventory Service **before** finalizing any order. If stock is insufficient, it returns a validation error to the frontend. If the Inventory Service is unavailable, it returns a 503.

The Inventory Service base URL is configured via `INVENTORY_SERVICE_URL` (see `.env.example`).

## API Endpoints

- `GET /` - Health check (also verifies DB connectivity)
- `GET /api/orders` - Returns order history including items
- `POST /api/orders` - Validates/deducts inventory stock, then creates an order + order_items rows

### `POST /api/orders`

Request body:

```json
{
  "customer_name": "Anya Fernando",
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 3, "quantity": 1 }
  ]
}
```

Responses:

- `201 Created` on success
- `400 Bad Request` for invalid payload or unknown `product_id`
- `503 Service Unavailable` when Inventory Service cannot be reached

## Database

- **Database Name:** `coffee_orders`
- **Tables:** `orders`, `order_items`

## Environment Variables

Create a `.env` from `.env.example`:

- `PORT` (default: 5002)
- `DB_HOST`, `DB_PORT` (default: 3306), `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `INVENTORY_SERVICE_URL` (example: `http://localhost:5001`)
