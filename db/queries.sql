-- Calculate Total Revenue
SELECT SUM(total_amount) AS total_revenue FROM coffee_orders.orders;

-- Join Query: See all items for a specific order
SELECT o.customer_name, oi.product_id, oi.quantity 
FROM coffee_orders.orders o 
JOIN coffee_orders.order_items oi ON o.id = oi.order_id;

-- List Low Stock Products (less than 15 items)
SELECT name, stock_quantity FROM coffee_inventory.products WHERE stock_quantity < 15;