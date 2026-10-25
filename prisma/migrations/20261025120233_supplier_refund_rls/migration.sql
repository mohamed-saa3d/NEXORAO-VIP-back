-- Close last RLS gap: supplier_refunds inherits tenancy via supplier_orders.

ALTER TABLE supplier_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_refunds FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON supplier_refunds
USING (
  EXISTS (
    SELECT 1 FROM supplier_orders
    WHERE supplier_orders.id = supplier_refunds.supplier_order_id
      AND supplier_orders.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM supplier_orders
    WHERE supplier_orders.id = supplier_refunds.supplier_order_id
      AND supplier_orders.store_id = NULLIF(current_setting('app.current_store_id', true), '')::uuid
  )
);
