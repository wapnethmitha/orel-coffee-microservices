const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Create a connection pool to the MySQL database.
// Using a pool improves performance under concurrent requests.
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Health check endpoint
// - Returns 200 when the service and DB are reachable
// - Useful for manual verification
app.get('/', async (req, res) => {
    try {
        await db.query('SELECT 1');
        return res.status(200).json({
            status: 'ok',
            service: 'inventory-service',
            db: 'ok',
            time: new Date().toISOString()
        });
    } catch (err) {
        return res.status(500).json({
            status: 'error',
            service: 'inventory-service',
            db: 'error',
            message: err.message
        });
    }
});

// ROUTE: Get the coffee product list
// Returns all products with their price and current stock
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM products');
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Validates that requested items are in stock, and deducts stock if they are.
 *
 * - If any item is out of stock, nothing deducted.
 * - Prevents race conditions when multiple orders happen at the same time.
 */
app.post('/api/products/validate-stock', async (req, res) => {
    const { items } = req.body;

    // Validate request body: expect a non-empty array of items
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'items must be a non-empty array.'
        });
    }

    // Combine quantities for the same product id so callers may send
    // duplicate product ids and we still process them correctly.
    const requestedQtyById = new Map();
    for (const item of items) {
        if (!item || typeof item !== 'object') {
            return res.status(400).json({ success: false, message: 'Each item must be an object.' });
        }

        const id = Number(item.id);
        const quantity = Number(item.quantity);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: 'Each item.id must be a positive integer.' });
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({ success: false, message: 'Each item.quantity must be a positive integer.' });
        }

        requestedQtyById.set(id, (requestedQtyById.get(id) || 0) + quantity);
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Attempt an atomic stock decrement per product.
        // The conditional UPDATE ensures we only deduct when enough stock exists.
        // If any UPDATE affects 0 rows, we inspect the current stock and abort.
        for (const [productId, requestedQty] of requestedQtyById.entries()) {
            const [updateResult] = await connection.query(
                'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?',
                [requestedQty, productId, requestedQty]
            );

            if (updateResult.affectedRows === 0) {
                // UPDATE did not change any row: either the product does not exist
                // or the available stock is less than requested. Query the row
                // to determine the correct error to return to the caller.
                const [rows] = await connection.query(
                    'SELECT id, name, stock_quantity FROM products WHERE id = ?',
                    [productId]
                );

                // Roll back the transaction and return an explanatory error.
                await connection.rollback();

                if (rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: `Product not found: id=${productId}`
                    });
                }

                const product = rows[0];
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name} (id=${productId}). Requested=${requestedQty}, Available=${product.stock_quantity}.`
                });
            }
        }

        await connection.commit();
        return res.status(200).json({
            success: true,
            message: 'Stock validated and deducted successfully.'
        });
    } catch (err) {
        // If an error occurs, attempt to roll back the transaction.
        // If rollback itself fails we cannot do much in this handler but
        // we swallow the rollback error to avoid masking the original error.
        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {
                // ignore rollback failure
            }
        }

        return res.status(500).json({
            success: false,
            message: 'Inventory service failed while validating stock.',
            error: err.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// Start the server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`✅ Inventory Service is running on http://localhost:${PORT}`);
});

// Consistent JSON 404 for unknown routes
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: 'Route not found.'
    });
});