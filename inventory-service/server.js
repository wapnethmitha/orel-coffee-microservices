const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Connect to MySQL Database 
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

// Health check
// - Confirms the service is running
// - Verifies DB connectivity with a lightweight query
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

// ROUTE 1: Get the Coffee Menu
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

    // Basic input validation (kept simple for assessment)
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'items must be a non-empty array.'
        });
    }

    // If the same product appears twice, treat it as one combined request.
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

        // For each product, attempt an atomic decrement
        for (const [productId, requestedQty] of requestedQtyById.entries()) {
            const [updateResult] = await connection.query(
                'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?',
                [requestedQty, productId, requestedQty]
            );

            if (updateResult.affectedRows === 0) {
                // Find out WHY it failed to give a helpful message.
                const [rows] = await connection.query(
                    'SELECT id, name, stock_quantity FROM products WHERE id = ?',
                    [productId]
                );

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