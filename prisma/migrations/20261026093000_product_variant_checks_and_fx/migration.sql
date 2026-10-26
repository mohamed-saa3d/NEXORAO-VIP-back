-- Safety constraints on stock counters.
ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_available_non_negative
    CHECK (available_quantity >= 0);

ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_reserved_non_negative
    CHECK (reserved_quantity >= 0);

-- Reserved cannot exceed available (prevent overselling via reservation)
ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_reserved_le_available
    CHECK (reserved_quantity <= available_quantity);

-- Replace ambiguous exchangeRateAtSync with structured fx fields.
ALTER TABLE product_variants DROP COLUMN IF EXISTS exchange_rate_at_sync;
ALTER TABLE product_variants
  ADD COLUMN exchange_rate DECIMAL(10, 4) NULL;
ALTER TABLE product_variants
  ADD COLUMN exchange_rate_source VARCHAR(20) NULL;
ALTER TABLE product_variants
  ADD COLUMN exchange_rate_fetched_at TIMESTAMPTZ(6) NULL;