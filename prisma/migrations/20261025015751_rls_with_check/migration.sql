-- Harden the tenant_isolation policies: add WITH CHECK and make an unset GUC fail closed.
--
-- Why: the original policies were written with `USING (...)` only, which leaves
-- `with_check = NULL`. USING is a *visibility* predicate; INSERT/UPDATE need an explicit
-- WITH CHECK to reject writes of rows the session is not entitled to create. Combined with
-- `set_config(..., true)` leaving an empty-string GUC on the pooled backend after commit,
-- this allowed a row to be written under one tenant's id and then read by another.
--
-- NULLIF(current_setting(...), '')::uuid yields NULL when the GUC is unset/empty.
-- `store_id = NULL` is not true, so every policy denies — fail closed rather than erroring.

-- Direct store_id policies (9 tables)
DROP POLICY tenant_isolation ON orders;
CREATE POLICY tenant_isolation ON orders
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

DROP POLICY tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

DROP POLICY tenant_isolation ON refunds;
CREATE POLICY tenant_isolation ON refunds
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

DROP POLICY tenant_isolation ON invoices;
CREATE POLICY tenant_isolation ON invoices
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

DROP POLICY tenant_isolation ON shipments;
CREATE POLICY tenant_isolation ON shipments
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

DROP POLICY tenant_isolation ON supplier_orders;
CREATE POLICY tenant_isolation ON supplier_orders
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

DROP POLICY tenant_isolation ON carts;
CREATE POLICY tenant_isolation ON carts
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

DROP POLICY tenant_isolation ON addresses;
CREATE POLICY tenant_isolation ON addresses
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

DROP POLICY tenant_isolation ON financial_transactions;
CREATE POLICY tenant_isolation ON financial_transactions
  USING (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

-- Child-table policies via parent EXISTS (5 tables)
DROP POLICY tenant_isolation ON order_items;
CREATE POLICY tenant_isolation ON order_items
  USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id
      AND orders.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id
      AND orders.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  );

DROP POLICY tenant_isolation ON payment_events;
CREATE POLICY tenant_isolation ON payment_events
  USING (
    EXISTS (SELECT 1 FROM payments WHERE payments.id = payment_events.payment_id
      AND payments.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM payments WHERE payments.id = payment_events.payment_id
      AND payments.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  );

DROP POLICY tenant_isolation ON shipment_events;
CREATE POLICY tenant_isolation ON shipment_events
  USING (
    EXISTS (SELECT 1 FROM shipments WHERE shipments.id = shipment_events.shipment_id
      AND shipments.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM shipments WHERE shipments.id = shipment_events.shipment_id
      AND shipments.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  );

DROP POLICY tenant_isolation ON supplier_order_items;
CREATE POLICY tenant_isolation ON supplier_order_items
  USING (
    EXISTS (SELECT 1 FROM supplier_orders WHERE supplier_orders.id = supplier_order_items.supplier_order_id
      AND supplier_orders.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM supplier_orders WHERE supplier_orders.id = supplier_order_items.supplier_order_id
      AND supplier_orders.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  );

DROP POLICY tenant_isolation ON cart_items;
CREATE POLICY tenant_isolation ON cart_items
  USING (
    EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id
      AND carts.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id
      AND carts.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
  );
