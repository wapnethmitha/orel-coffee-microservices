USE coffee_inventory;
INSERT INTO products (name, price, stock_quantity) VALUES 
('Espresso', 350.00, 50),
('Latte', 550.00, 30),
('Cappuccino', 500.00, 20),
('Chocolate Muffin', 400.00, 15),
('Croissant', 300.00, 10);

USE coffee_orders;

-- Order 1
INSERT INTO orders (customer_name, total_amount) VALUES ('First Test Customer', 900.00);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (1, 1, 1, 350.00), (1, 2, 1, 550.00);

-- Order 2
INSERT INTO orders (customer_name, total_amount) VALUES ('Walk-in', 800.00);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (2, 3, 2, 400.00);

-- Order 3
INSERT INTO orders (customer_name, total_amount) VALUES ('Nimal Perera', 1300.00);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (3, 2, 2, 550.00), (3, 5, 1, 200.00);