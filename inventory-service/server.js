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

app.post('/api/products/validate-stock', async (req, res) => {
    const { items } = req.body;

    // STEP 1: INITIAL INPUT STRUCTURE VALIDATION
    // Ensure the incoming 'items' parameter is a valid, non-empty array
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'items must be a non-empty array.'
        });
    }

    // STEP 2: INDIVIDUAL ITEM DATA TYPE VALIDATION
    // Before doing any math, looping through the cart to verify that 
    // every single item is safe, has a valid ID, and a positive quantity.
    for (const item of items) {
        // Check A: Verify the item itself is a valid JavaScript object
        if (!item || typeof item !== 'object') {
            return res.status(400).json({ success: false, message: 'Each item must be an object.' });
        }

        // Force convert the values to primitive numbers to prevent string concatenation issues
        const id = Number(item.id);
        const quantity = Number(item.quantity);

        // Check B: Enforce that the product ID is a positive whole number
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: 'Each item.id must be a positive integer.' });
        }

        // Check C: Enforce that the order quantity is a positive whole number (stops negative hacks)
        if (!Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({ success: false, message: 'Each item.quantity must be a positive integer.' });
        }
    }

    // STEP 3: CONSOLIDATING DUPLICATE CART ITEMS
    // Since all data is guaranteed clean, compress duplicates into a Map.
    // Example: [{id:1, quantity:1}, {id:1, quantity:2}] becomes Map { 1 => 3 }
    const requestedQtyById = new Map();
    
    for (const item of items) {
        const id = Number(item.id);
        const quantity = Number(item.quantity);

        // Check if this product ID is already registered in the Map dictionary
        const existingQuantity = requestedQtyById.get(id) || 0;
        
        // Add the current item's quantity to whatever recorded previously
        requestedQtyById.set(id, existingQuantity + quantity);
    }

    //reserve a dedicated, private database connection from the pool 
    // and initialize a Transaction Shield.
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // SCENARIO 1: READ & LOCK ALL ITEMS (Prevents Race Conditions)
        // lock all requested products upfront. If another user is trying 
        // to buy the same items simultaneously, MySQL forces them to wait 
        // until the transaction finishes.
        const productIds = Array.from(requestedQtyById.keys());
        
        // This creates an SQL query like: SELECT * FROM products WHERE id IN (1, 2) FOR UPDATE
        const [currentProducts] = await connection.query(
            'SELECT id, name, stock_quantity FROM products WHERE id IN (?) FOR UPDATE',
            [productIds]
        );

        // Create a quick lookup map of what is currently sitting on the database disk
        const dbProductMap = new Map(currentProducts.map(p => [p.id, p]));

        // SCENARIO 2: VALIDATE STOCK VALUES SEPARATELY (Clear Error Handling)
        // Now that the rows are locked and safe, we loop through our cart 
        // and check for missing products or insufficient stock BEFORE making changes.
        for (const [productId, requestedQty] of requestedQtyById.entries()) {
            const dbProduct = dbProductMap.get(productId);

            // Case A: The product ID doesn't exist in our database at all
            if (!dbProduct) {
                await connection.rollback(); // Undo everything
                return res.status(404).json({
                    success: false,
                    message: `Product not found: id=${productId}`
                });
            }

            // Case B: The product exists, but we don't have enough stock left
            if (dbProduct.stock_quantity < requestedQty) {
                await connection.rollback(); // Undo everything
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${dbProduct.name} (id=${productId}). Requested=${requestedQty}, Available=${dbProduct.stock_quantity}.`
                });
            }
        }

        // SCENARIO 3: EXECUTE DEDUCTION (Only runs if all checks pass!)
        // Because we verified everything above, we know it is 100% safe to 
        // deduct the stock numbers now.
        for (const [productId, requestedQty] of requestedQtyById.entries()) {
            await connection.query(
                'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
                [requestedQty, productId]
            );
        }

        // Lock everything permanently onto the hard drive
        await connection.commit();
        return res.status(200).json({
            success: true,
            message: 'Stock validated and deducted successfully.'
        });

    } catch (err) {
        // Emergency fallback if the database server disconnects or crashes mid-way
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        return res.status(500).json({
            success: false,
            message: 'Inventory service failed while validating stock.',
            error: err.message
        });
    } finally {
        if (connection) connection.release(); // Return line back to pool
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