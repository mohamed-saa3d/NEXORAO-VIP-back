-- RLS: 14 tables (users, user_sessions, store_settings, stores, suppliers, products, categories deliberately EXCLUDED — they're either the tenancy root, shared catalog, or handled at app level for super_admin access)

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

-- Direct store_id policies (9 tables)
CREATE POLICY tenant_isolation ON orders
  USING (store_id = current_setting('app.current_store_id', true)::uuid);
CREATE POLICY tenant_isolation ON payments
  USING (store_id = current_setting('app.current_store_id', true)::uuid);
CREATE POLICY tenant_isolation ON refunds
  USING (store_id = current_setting('app.current_store_id', true)::uuid);
CREATE POLICY tenant_isolation ON invoices
  USING (store_id = current_setting('app.current_store_id', true)::uuid);
CREATE POLICY tenant_isolation ON shipments
  USING (store_id = current_setting('app.current_store_id', true)::uuid);
CREATE POLICY tenant_isolation ON supplier_orders
  USING (store_id = current_setting('app.current_store_id', true)::uuid);
CREATE POLICY tenant_isolation ON carts
  USING (store_id = current_setting('app.current_store_id', true)::uuid);
CREATE POLICY tenant_isolation ON addresses
  USING (store_id = current_setting('app.current_store_id', true)::uuid);
CREATE POLICY tenant_isolation ON financial_transactions
  USING (store_id = current_setting('app.current_store_id', true)::uuid);

-- Child-table policies via parent EXISTS (5 tables)
CREATE POLICY tenant_isolation ON order_items USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id
    AND orders.store_id = current_setting('app.current_store_id', true)::uuid)
);
CREATE POLICY tenant_isolation ON payment_events USING (
  EXISTS (SELECT 1 FROM payments WHERE payments.id = payment_events.payment_id
    AND payments.store_id = current_setting('app.current_store_id', true)::uuid)
);
CREATE POLICY tenant_isolation ON shipment_events USING (
  EXISTS (SELECT 1 FROM shipments WHERE shipments.id = shipment_events.shipment_id
    AND shipments.store_id = current_setting('app.current_store_id', true)::uuid)
);
CREATE POLICY tenant_isolation ON supplier_order_items USING (
  EXISTS (SELECT 1 FROM supplier_orders WHERE supplier_orders.id = supplier_order_items.supplier_order_id
    AND supplier_orders.store_id = current_setting('app.current_store_id', true)::uuid)
);
CREATE POLICY tenant_isolation ON cart_items USING (
  EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id
    AND carts.store_id = current_setting('app.current_store_id', true)::uuid)
);

-- NULL-safe uniqueness for supplier_connections (single global or per-store row per supplier)
CREATE UNIQUE INDEX supplier_connections_supplier_global_unique
  ON supplier_connections(supplier_id) WHERE store_id IS NULL;
CREATE UNIQUE INDEX supplier_connections_supplier_store_unique
  ON supplier_connections(supplier_id, store_id) WHERE store_id IS NOT NULL;
