const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const axios = require('axios');

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Service port
const PORT = Number(process.env.PORT || 5002);

// Inventory service base URL (Order Service depends on Inventory for stock checks and prices)
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL;

if (!INVENTORY_SERVICE_URL) {
    // Warn during startup so the developer knows the service is misconfigured locally
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

// Fetch product list from the Inventory Service.
// Used to read current prices (Inventory is the source of truth for catalog data).
async function fetchInventoryProducts() {
    const response = await axios.get(`${INVENTORY_SERVICE_URL}/api/products`, { timeout: 5000 });
    return Array.isArray(response.data) ? response.data : [];
}

function roundTo2(amount) {
    // Round to 2 decimal places for display/total calculations.
    // Note: in production prefer integer cents or a decimal library to avoid floating point issues.
    return Math.round(Number(amount) * 100) / 100;
}

// Health check endpoint
// - Returns 200 when the service and DB are reachable
// - Useful for load-balancers and basic manual verification
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

/**
 * GET /api/orders
 * Return order history (orders and their items) from the Order Service database.
 * The SQL produces a flat join result which we reshape into a nested JSON structure.
 */
app.get('/api/orders', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT
                o.id AS order_id,
                o.customer_name,
                o.total_amount,
                o.created_at,
                oi.id AS order_item_id,
                oi.product_id,
                oi.quantity,
                oi.unit_price
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            ORDER BY o.created_at DESC, oi.id ASC`
        );

        // Convert the flat JOIN result into a nested JSON structure:
        // [ { id, customer_name, total_amount, created_at, items: [...] }, ... ]
        const ordersById = new Map();

        for (const row of rows) {
            if (!ordersById.has(row.order_id)) {
                ordersById.set(row.order_id, {
                    id: row.order_id,
                    customer_name: row.customer_name,
                    total_amount: Number(row.total_amount),
                    created_at: row.created_at,
                    items: []
                });
            }

            // If there are no items for an order ,
            // LEFT JOIN will return nulls
            if (row.order_item_id) {
                ordersById.get(row.order_id).items.push({
                    id: row.order_item_id,
                    product_id: row.product_id,
                    quantity: row.quantity,
                    unit_price: Number(row.unit_price)
                });
            }
        }

        return res.status(200).json({
            success: true,
            orders: Array.from(ordersById.values())
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch order history.',
            error: err.message
        });
    }
});


/**
 * POST /api/orders
 * Create a new order.
 * Steps:
 *  1) Validate request payload
 *  2) Call Inventory Service to validate and deduct stock (atomic operation in Inventory)
 *  3) Fetch product prices from Inventory and compute totals
 *  4) Persist order and order_items in a DB transaction local to Order Service
 * If any step fails we avoid partial commits and return a clear error to the client.
 */
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

    // Convert incoming order items into the Inventory Service expected shape:
    // { id, quantity } — Inventory only needs ids and quantities to validate/deduct stock.
    const inventoryItems = req.body.items.map((item) => ({
        id: item.product_id,
        quantity: item.quantity
    }));

    try {
        // 1) Validate/deduct stock first (core scenario).
        // Inventory performs the atomic updates; if it fails we do not proceed.
        const stockResponse = await axios.post(
            `${INVENTORY_SERVICE_URL}/api/products/validate-stock`,
            { items: inventoryItems },
            { timeout: 5000 }
        );

        // 2) Query Inventory for product details (prices) so Order Service can compute total_amount.
        // Keeping pricing in Inventory ensures a single source of truth for product data.
        const products = await fetchInventoryProducts();
        const productById = new Map(products.map((p) => [Number(p.id), p]));

        const enrichedItems = req.body.items.map((item) => {
            const product = productById.get(item.product_id);
            const unitPrice = product ? Number(product.price) : NaN;

            return {
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: unitPrice,
                line_total: roundTo2(unitPrice * item.quantity)
            };
        });

        // If any product is missing a price, fail early to avoid creating incorrect orders.
        const missingPrice = enrichedItems.find((i) => !Number.isFinite(i.unit_price));
        if (missingPrice) {
            return res.status(400).json({
                success: false,
                message: `Unknown product_id or missing price for product_id=${missingPrice.product_id}.`
            });
        }

        const totalAmount = roundTo2(enrichedItems.reduce((sum, i) => sum + i.line_total, 0));

        // 3) Persist the order in a local DB transaction.
        // This transaction ensures atomicity of order creation and its items within Order Service.
        let connection;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const customerName = req.body.customer_name || null;

            const [orderResult] = await connection.query(
                'INSERT INTO orders (customer_name, total_amount) VALUES (?, ?)',
                [customerName, totalAmount]
            );

            const orderId = orderResult.insertId;

            for (const item of enrichedItems) {
                // Insert each order item associated with the new order.
                await connection.query(
                    'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
                    [orderId, item.product_id, item.quantity, item.unit_price]
                );
            }

            await connection.commit();

            return res.status(201).json({
                success: true,
                message: 'Order created successfully.',
                order: {
                    id: orderId,
                    customer_name: customerName,
                    total_amount: totalAmount,
                    items: enrichedItems.map(({ product_id, quantity, unit_price }) => ({
                        product_id,
                        quantity,
                        unit_price
                    }))
                },
                inventory: stockResponse.data
            });
        } catch (dbErr) {
            // Attempt to roll back the transaction on error. If rollback fails we log/ignore
            // the rollback error but still return the original DB error to the caller.
            if (connection) {
                try {
                    await connection.rollback();
                } catch (_) {
                    // ignore rollback failure
                }
            }

            return res.status(500).json({
                success: false,
                message: 'Failed to create order due to a database error.',
                error: dbErr.message
            });
        } finally {
            if (connection) connection.release();
        }
    } catch (err) {
        // Axios error handling:
        // - err.response exists when Inventory returned a non-2xx status (we forward it)
        // - err.request exists when the request was made but no response received (timeout, network error)
        if (err.response) {
            return res.status(err.response.status).json({
                success: false,
                message: 'Inventory check failed.',
                inventory: err.response.data
            });
        }

        // For connectivity issues treat inventory as temporarily unavailable.
        return res.status(503).json({
            success: false,
            message: 'Inventory Service is unavailable. Please try again later.'
        });
    }
});

// Return JSON 404 for unknown routes
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: 'Route not found.'
    });
});

// Graceful shutdown handler
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
