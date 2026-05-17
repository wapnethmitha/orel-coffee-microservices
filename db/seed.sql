USE coffee_inventory;

INSERT INTO products (name, price, stock_quantity) VALUES 
('Espresso', 350.00, 50),       -- ID 1
('Latte', 550.00, 30),          -- ID 2
('Cappuccino', 500.00, 20),     -- ID 3
('Chocolate Muffin', 400.00, 15),-- ID 4
('Croissant', 300.00, 10);      -- ID 5

USE coffee_orders;

-- Order 1: 1 Espresso (350) + 1 Latte (550) = 900.00 
INSERT INTO orders (customer_name, total_amount) VALUES ('First Test Customer', 900.00);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES 
(1, 1, 1, 350.00), 
(1, 2, 1, 550.00);

-- Order 2: 2 Chocolate Muffins (ID 4) at 400.00 each = 800.00
INSERT INTO orders (customer_name, total_amount) VALUES ('Walk-in', 800.00);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES 
(2, 4, 2, 400.00); 

-- Order 3: 2 Lattes (2 x 550 = 1100) + 1 Croissant (1 x 300 = 300) = 1400.00
INSERT INTO orders (customer_name, total_amount) VALUES ('Nimal Perera', 1400.00); -- Changed total to 1400.00
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES 
(3, 2, 2, 550.00), 
(3, 5, 1, 300.00); 