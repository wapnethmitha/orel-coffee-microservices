# Inventory Service

This service is responsible for managing the coffee shop's product list and current stock levels.

## Tech Stack

- Node.js & Express
- MySQL
- mysql2 (promise)
- cors + dotenv

## API Endpoints

- `GET /` - Health check (also verifies DB connectivity)
- `GET /api/products` - Returns all coffee items with current stock and price
- `POST /api/products/validate-stock` - Validates requested quantities and atomically deducts stock

### `POST /api/products/validate-stock`

Request body:

```json
{
  "items": [
    { "id": 1, "quantity": 2 },
    { "id": 3, "quantity": 1 }
  ]
}
```

Responses:

- `200 OK` when stock is sufficient (stock is deducted)
- `400 Bad Request` when any item is insufficient (nothing deducted)
- `404 Not Found` when a product id does not exist

## Database

- **Database Name:** `coffee_inventory`
- **Table:** `products`

## Environment Variables

Create a `.env` from `.env.example`:

- `PORT` (default: 5001)
- `DB_HOST`, `DB_PORT` (default: 3306), `DB_USER`, `DB_PASSWORD`, `DB_NAME`
