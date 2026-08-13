-- סכימת D1 להזמנות החנות. הרצה: wrangler d1 execute pashutlitzor-orders --file=./shop-worker/schema.sql

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_session_id TEXT UNIQUE NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  items_json TEXT NOT NULL,       -- JSON array: [{name, variantLabel, qty, lineTotal}]
  total_agorot INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',  -- paid | preparing | ready | shipped | completed | cancelled | refunded
  fulfillment_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
