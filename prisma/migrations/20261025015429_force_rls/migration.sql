-- FORCE ROW LEVEL SECURITY on the 14 tenant-scoped tables.
--
-- Why this exists: the connecting role `neondb_owner` owns these tables AND has
-- BYPASSRLS, and it is the table owner. PostgreSQL skips RLS policies for
--   (a) superusers, (b) roles with BYPASSRLS, and (c) the table owner unless FORCE is set.
-- Without FORCE, `ENABLE ROW LEVEL SECURITY` alone is silently a no-op for this role —
-- the isolation test proved it: HELPMEY could read a NEXORA order.
--
-- NOTE: BYPASSRLS is not overridable by FORCE. See docs/13-migration-report.md for the
-- required follow-up (dedicated non-BYPASSRLS application role) before production.

ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE shipments FORCE ROW LEVEL SECURITY;
ALTER TABLE shipment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE carts FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions FORCE ROW LEVEL SECURITY;
