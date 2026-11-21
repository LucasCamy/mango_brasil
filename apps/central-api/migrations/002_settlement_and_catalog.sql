ALTER TABLE payment_transactions ADD COLUMN initiated_by_user_id uuid REFERENCES users(id);
CREATE INDEX ix_payment_initiator ON payment_transactions(initiated_by_user_id);

CREATE TABLE payment_reversals (
  id uuid PRIMARY KEY,
  order_payment_id uuid NOT NULL UNIQUE REFERENCES order_payments(id),
  original_shift_id uuid REFERENCES shifts(id),
  settlement_shift_id uuid REFERENCES shifts(id),
  amount_cents integer NOT NULL CHECK(amount_cents>0),
  method text NOT NULL CHECK(method IN ('CREDIT_CARD','DEBIT_CARD','PIX')),
  user_id uuid REFERENCES users(id),
  authorized_by_user_id uuid REFERENCES users(id),
  reason text NOT NULL CHECK(length(reason)>=3),
  reversed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_reversals_settlement ON payment_reversals(settlement_shift_id);
CREATE TABLE catalog_state (id integer PRIMARY KEY CHECK(id=1),version bigint NOT NULL DEFAULT 1);
INSERT INTO catalog_state(id) VALUES(1);
CREATE FUNCTION advance_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; RETURN NULL; END;
$$;
CREATE TRIGGER products_catalog_version AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH STATEMENT EXECUTE FUNCTION advance_catalog_version();
CREATE TRIGGER categories_catalog_version AFTER INSERT OR UPDATE OR DELETE ON categories FOR EACH STATEMENT EXECUTE FUNCTION advance_catalog_version();
CREATE TRIGGER sizes_catalog_version AFTER INSERT OR UPDATE OR DELETE ON product_sizes FOR EACH STATEMENT EXECUTE FUNCTION advance_catalog_version();
CREATE TRIGGER additions_catalog_version AFTER INSERT OR UPDATE OR DELETE ON product_additions FOR EACH STATEMENT EXECUTE FUNCTION advance_catalog_version();
