const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const axios = require('axios');

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = Number(process.env.PORT || 5002);


const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL;

if (!INVENTORY_SERVICE_URL) {
    console.warn('⚠️  INVENTORY_SERVICE_URL is not set. POST /api/orders will fail until configured.');
}

// Database connection (MySQL) using mysql2/promise (async/await)
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);


function validateCreateOrderPayload(body) {
    if (!body || typeof body !== 'object') {
        return { ok: false, message: 'Request body must be a JSON object.' };
    }

    const { items, customer_name } = body;

    if (customer_name !== undefined && customer_name !== null && typeof customer_name !== 'string') {
        return { ok: false, message: 'customer_name must be a string when provided.' };
    }

    if (!Array.isArray(items) || items.length === 0) {
        return { ok: false, message: 'items must be a non-empty array.' };
    }

    for (const item of items) {
        if (!item || typeof item !== 'object') {
            return { ok: false, message: 'Each item must be an object.' };
        }

        const { product_id, quantity } = item;

        if (!Number.isInteger(product_id) || product_id <= 0) {
            return { ok: false, message: 'Each item.product_id must be a positive integer.' };
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            return { ok: false, message: 'Each item.quantity must be a positive integer.' };
        }
    }

    return { ok: true };
}

// Health check
// - Confirms the service is running
// - Verifies DB connectivity via a lightweight query
app.get('/', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.status(200).json({
            status: 'ok',
            service: 'order-service',
            db: 'ok',
            time: new Date().toISOString()
        });
    } catch (err) {
        return res.status(500).json({
            status: 'error',
            service: 'order-service',
            db: 'error',
            message: err.message
        });
    }
});


app.post('/api/orders', async (req, res) => {
    const validation = validateCreateOrderPayload(req.body);
    if (!validation.ok) {
        return res.status(400).json({
            success: false,
            message: validation.message
        });
    }

    if (!INVENTORY_SERVICE_URL) {
        return res.status(500).json({
            success: false,
            message: 'Order Service misconfiguration: INVENTORY_SERVICE_URL is missing.'
        });
    }

    // Convert order items into the Inventory Service contract.
    // We keep the payload minimal: only product id + quantity.
    const inventoryItems = req.body.items.map((item) => ({
        id: item.product_id,
        quantity: item.quantity
    }));

    try {
        const response = await axios.post(
            `${INVENTORY_SERVICE_URL}/api/products/validate-stock`,
            { items: inventoryItems },
            { timeout: 5000 }
        );

        // Inventory validated (and later will deduct). For Part 2, we stop here.
        return res.status(200).json({
            success: true,
            message: 'Stock validated successfully. (Order persistence will be added in Part 3.)',
            inventory: response.data
        });
    } catch (err) {
        // Axios error shape:
        // - err.response exists if Inventory returned a non-2xx HTTP response
        // - err.request exists if Inventory is unreachable / timed out

        if (err.response) {
            return res.status(err.response.status).json({
                success: false,
                message: 'Inventory check failed.',
                inventory: err.response.data
            });
        }

        // Treat timeouts / DNS / connection refusal as service unavailable
        return res.status(503).json({
            success: false,
            message: 'Inventory Service is unavailable. Please try again later.'
        });
    }
});

// Graceful shutdown
async function shutdown(signal) {
    try {
        console.log(`\n${signal} received: closing DB pool...`);
        await pool.end();
        console.log('DB pool closed. Exiting.');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

app.listen(PORT, () => {
    console.log(`✅ Order Service is running on http://localhost:${PORT}`);
});
