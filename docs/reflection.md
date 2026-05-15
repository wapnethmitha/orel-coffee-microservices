# Reflection

## Table of Contents

- Design Decisions
- Challenges Faced
- What I Would Do Differently
- What I Learned


## Design Decisions

I used microservices architecture to separate inventory management and order processing, making the system modular and easier to maintain or scale. Each service owns its own MySQL database (database-per-service pattern) to avoid coupling and cross-domain conflicts (databases: `coffee_inventory`, `coffee_orders`; services run by default on ports 5001 and 5002). Both backend services use Node.js + Express for fast development and simple REST APIs; the frontend uses React + Vite for a responsive UI.

To ensure consistent state I perform stock validation and deduction inside the Inventory Service using SQL transactions and conditional UPDATE statements (atomic update where affected rows = 1). The Order Service coordinates call to Inventory (`POST /api/products/validate-stock`) and only persists orders in its own DB after successful inventory confirmation.

## Challenges Faced

- Data consistency: Preventing race conditions during stock updates required atomic DB operations (transaction + conditional UPDATE) in the Inventory Service.

- Fault tolerance: When the Inventory Service is unavailable, the Order Service returns a 503 Service Unavailable error, and the frontend surfaces an appropriate error message to avoid creating “ghost” orders.

- Configuration & environment: Standardizing environment variables and endpoint URLs across services (inventory vs order) required careful `.env` handling and local test runs.

- Integration issues: End-to-end testing exposed small issues with API pathing and error propagation that were fixed before final verification.

## What I Would Do Differently

- Implement Redux for frontend state management
- Add input validation and sanitisation
- Write unit and integration tests for key functions
- Provide a Docker Compose file for one‑command startup
- Add structured logging and monitoring (metrics + alerts)
- Implement inventory reservation during order processing

## What I Learned

I gained hands-on experience with service boundaries, the importance of data ownership, and practical techniques for preventing race conditions in distributed systems. I improved my REST API design skills and learned how small integration issues can surface only during end-to-end testing. Finally, I practiced documenting design decisions and test evidence to make the system easy to verify by reviewers.
