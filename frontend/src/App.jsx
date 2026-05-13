import { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';
import logo from './assets/logo.png';

const INVENTORY_API_BASE_URL = import.meta.env.VITE_INVENTORY_API_BASE_URL || 'http://localhost:5001';

const sampleHistory = [
  { id: '#001', customer: 'Postman Test', date: 'May 12, 2026', total: 'Rs. 700.00' },
  { id: '#002', customer: 'Walk-in', date: 'May 12, 2026', total: 'Rs. 1,250.00' },
];

function App() {
  const [activePage, setActivePage] = useState('pos');

  const renderPage = () => {
    switch (activePage) {
      case 'pos':
        return <PointOfSalePage />;
      case 'history':
        return <OrderHistoryPage />;
      default:
        return <PointOfSalePage />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

function Sidebar({ activePage, setActivePage }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logo} alt="Orel Logo" className="brand-logo" />
        <h1>COFEE SHOP</h1>
      </div>
      <nav className="nav">
        <div
          className={`nav-item ${activePage === 'pos' ? 'active' : ''}`}
          onClick={() => setActivePage('pos')}
        >
          Point of Sale
        </div>
        <div
          className={`nav-item ${activePage === 'history' ? 'active' : ''}`}
          onClick={() => setActivePage('history')}
        >
          Order History
        </div>
      </nav>
      <div className="status-bar">
        <div className="status-pill online">
          <span className="dot" /> Inventory API
        </div>
        <div className="status-pill online">
          <span className="dot" /> Orders API
        </div>
      </div>
    </aside>
  );
}

function PointOfSalePage() {
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState('');

  const [cartItems, setCartItems] = useState([]);
  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      try {
        setIsLoadingProducts(true);
        setProductsError('');

        const response = await axios.get(`${INVENTORY_API_BASE_URL}/api/products`, {
          timeout: 8000,
        });

        const rows = Array.isArray(response.data) ? response.data : [];
        const mapped = rows.map((row) => ({
          id: Number(row.id),
          name: String(row.name ?? ''),
          price: Number(row.price),
          stock: Number(row.stock_quantity ?? row.stock ?? 0),
        }));

        if (!cancelled) setProducts(mapped);
      } catch (err) {
        if (cancelled) return;
        const message = err?.response?.data?.error || err?.message || 'Failed to load products.';
        setProductsError(String(message));
        setProducts([]);
      } finally {
        if (!cancelled) setIsLoadingProducts(false);
      }
    };

    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  const addToCart = (product) => {
    if (!product || product.stock <= 0) return;

    setCartItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (!existing) {
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            maxQuantity: product.stock,
          },
        ];
      }

      return prev.map((item) => {
        if (item.productId !== product.id) return item;
        const nextQty = Math.min(item.quantity + 1, item.maxQuantity);
        return { ...item, quantity: nextQty };
      });
    });
  };

  const incrementCartItem = (productId) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const nextQty = Math.min(item.quantity + 1, item.maxQuantity);
        return { ...item, quantity: nextQty };
      })
    );
  };

  const decrementCartItem = (productId) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          return { ...item, quantity: item.quantity - 1 };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const removeCartItem = (productId) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <>
      <div className="page-header">
        <h2>Point of Sale</h2>
        <p>Create new orders by adding products from the catalog to the cart.</p>
      </div>
      <div className="pos-layout">
        <section className="product-catalog">
          <div className="product-grid">
            {isLoadingProducts && <div className="empty-cart">Loading products…</div>}

            {!isLoadingProducts && productsError && (
              <div className="empty-cart">{productsError}</div>
            )}

            {!isLoadingProducts && !productsError && products.length === 0 && (
              <div className="empty-cart">No products found.</div>
            )}

            {!isLoadingProducts && !productsError && products.map((p) => (
              <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
            ))}
          </div>
        </section>
        <Cart
          items={cartItems}
          customerName={customerName}
          setCustomerName={setCustomerName}
          onIncrement={incrementCartItem}
          onDecrement={decrementCartItem}
          onRemove={removeCartItem}
          total={cartTotal}
        />
      </div>
    </>
  );
}

function ProductCard({ product, onAddToCart }) {
  const getStockClass = (stock) => {
    if (stock === 0) return 'zero';
    if (stock < 10) return 'low';
    return 'available';
  };

  return (
    <article className="product-card">
      <h3>{product.name}</h3>
      <div className="product-details">
        <span className="price">Rs. {product.price.toFixed(2)}</span>
        <span className={`stock ${getStockClass(product.stock)}`}>
          {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
        </span>
      </div>
      <button
        className="action-button"
        disabled={product.stock === 0}
        onClick={() => onAddToCart?.(product)}
      >
        Add to Cart
      </button>
    </article>
  );
}

function Cart({ items, customerName, setCustomerName, onIncrement, onDecrement, onRemove, total }) {
  return (
    <aside className="cart-section">
      <h3>Current Order</h3>
      <div className="cart-items">
        {items.length === 0 ? (
          <div className="empty-cart">Cart is empty</div>
        ) : (
          <div className="cart-list">
            {items.map((item) => (
              <div key={item.productId} className="cart-item">
                <div className="cart-item-main">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-meta">
                    Rs. {item.price.toFixed(2)} × {item.quantity}
                  </div>
                </div>
                <div className="cart-item-actions">
                  <div className="qty-controls">
                    <button
                      type="button"
                      className="qty-button"
                      onClick={() => onDecrement?.(item.productId)}
                      aria-label={`Decrease ${item.name}`}
                    >
                      −
                    </button>
                    <div className="qty-value">{item.quantity}</div>
                    <button
                      type="button"
                      className="qty-button"
                      onClick={() => onIncrement?.(item.productId)}
                      disabled={item.quantity >= item.maxQuantity}
                      aria-label={`Increase ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onRemove?.(item.productId)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="cart-total-row">
              <span>Total</span>
              <span className="cart-total">Rs. {Number(total).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="customer-name">Customer Name</label>
        <input
          id="customer-name"
          type="text"
          placeholder="e.g. Anya Fernando"
          value={customerName}
          onChange={(e) => setCustomerName?.(e.target.value)}
        />
      </div>
      <button className="primary-button" disabled>
        Place Order
      </button>
    </aside>
  );
}

function OrderHistoryPage() {
  return (
    <>
      <div className="page-header">
        <h2>Order History</h2>
        <p>Browse all past transactions from the Order Service.</p>
      </div>
      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sampleHistory.map(order => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{order.customer}</td>
                <td>{order.date}</td>
                <td>{order.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default App;
