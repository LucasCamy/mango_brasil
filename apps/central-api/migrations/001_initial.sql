CREATE TABLE roles (name text PRIMARY KEY CHECK (name IN ('OWNER','MANAGER','CASHIER')));
INSERT INTO roles(name) VALUES ('OWNER'),('MANAGER'),('CASHIER');

CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  email text NOT NULL,
  password_hash text NOT NULL,
  supervisor_pin_hash text,
  role text NOT NULL REFERENCES roles(name),
  active boolean NOT NULL DEFAULT true,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_email ON users(lower(email));
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sessions_user ON auth_sessions(user_id,expires_at);
CREATE TABLE supervisor_authorizations (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  requested_by_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL, resource_id text NOT NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE company_settings (
  id integer PRIMARY KEY CHECK (id=1),
  razao_social text NOT NULL DEFAULT '', nome_fantasia text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '', inscricao_estadual text NOT NULL DEFAULT '',
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  regime_tributario text NOT NULL DEFAULT 'SIMPLES_NACIONAL' CHECK (regime_tributario IN ('SIMPLES_NACIONAL','LUCRO_PRESUMIDO','LUCRO_REAL')),
  csc_id text NOT NULL DEFAULT '', csc_token_encrypted text,
  serie_nfce integer NOT NULL DEFAULT 1 CHECK (serie_nfce BETWEEN 1 AND 999),
  proximo_numero_nfce integer NOT NULL DEFAULT 1 CHECK (proximo_numero_nfce>0),
  accepts_cash_on_pdv boolean NOT NULL DEFAULT true,
  inactivity_timeout_seconds integer NOT NULL DEFAULT 45 CHECK (inactivity_timeout_seconds BETWEEN 15 AND 300),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO company_settings(id) VALUES (1);

CREATE TABLE kiosk_terminals (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{2,64}$'), name text NOT NULL,
  type text NOT NULL CHECK (type IN ('PDV','TOTEM')),
  token_hash text UNIQUE, active boolean NOT NULL DEFAULT true,
  ip_address text, app_version text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE','OFFLINE','MAINTENANCE')),
  printer_status text NOT NULL DEFAULT 'READY' CHECK (printer_status IN ('READY','OUT_OF_PAPER','ERROR')),
  pinpad_status text NOT NULL DEFAULT 'DISCONNECTED' CHECK (pinpad_status IN ('CONNECTED','DISCONNECTED')),
  maintenance_message text, last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE categories (
  id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true
);
CREATE TABLE products (
  id uuid PRIMARY KEY, category_id uuid NOT NULL REFERENCES categories(id),
  name text NOT NULL, description text NOT NULL DEFAULT '', image_url text,
  base_price_cents integer NOT NULL CHECK (base_price_cents BETWEEN 0 AND 999999999),
  active boolean NOT NULL DEFAULT true, available_in_kiosk boolean NOT NULL DEFAULT true,
  available_in_pdv boolean NOT NULL DEFAULT true,
  ncm text NOT NULL CHECK (ncm ~ '^[0-9]{8}$'), cest text CHECK (cest IS NULL OR cest ~ '^[0-9]{7}$'),
  cfop text NOT NULL CHECK (cfop ~ '^[0-9]{4}$'), origem integer NOT NULL CHECK (origem BETWEEN 0 AND 8),
  cst_csosn text NOT NULL CHECK (cst_csosn ~ '^[0-9]{2,3}$'),
  aliquota_icms numeric(8,4) NOT NULL DEFAULT 0 CHECK (aliquota_icms BETWEEN 0 AND 100),
  ibs_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK (ibs_rate BETWEEN 0 AND 100),
  cbs_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK (cbs_rate BETWEEN 0 AND 100),
  aliquota_ibpt numeric(8,4) NOT NULL DEFAULT 0 CHECK (aliquota_ibpt BETWEEN 0 AND 100),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_products_catalog ON products(category_id,active,name);
CREATE TABLE product_sizes (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL, price_modifier_cents integer NOT NULL DEFAULT 0,
  price_cents integer CHECK (price_cents BETWEEN 0 AND 999999999),
  UNIQUE(product_id,name)
);
CREATE TABLE product_additions (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL, price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 999999999),
  max_quantity integer NOT NULL CHECK (max_quantity BETWEEN 1 AND 50), UNIQUE(product_id,name)
);
CREATE INDEX ix_sizes_product ON product_sizes(product_id);
CREATE INDEX ix_additions_product ON product_additions(product_id);

CREATE TABLE shifts (
  id uuid PRIMARY KEY, terminal_id text NOT NULL REFERENCES kiosk_terminals(id),
  operator_id uuid NOT NULL REFERENCES users(id), status text NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  initial_cash_cents integer NOT NULL CHECK (initial_cash_cents BETWEEN 0 AND 999999999),
  opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
  closed_by_user_id uuid REFERENCES users(id), authorized_by_user_id uuid REFERENCES users(id),
  close_reason text,
  CHECK ((status='OPEN' AND closed_at IS NULL) OR (status='CLOSED' AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_shifts_open_terminal ON shifts(terminal_id) WHERE status='OPEN';
CREATE INDEX ix_shifts_history ON shifts(opened_at DESC,id);
CREATE TABLE daily_ticket_counters (business_date date PRIMARY KEY, last_number integer NOT NULL CHECK(last_number>0));
CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY, idempotency_key uuid NOT NULL UNIQUE CHECK (substring(idempotency_key::text,15,1)='7'),
  terminal_id text NOT NULL REFERENCES kiosk_terminals(id),
  method text NOT NULL CHECK (method IN ('CREDIT_CARD','DEBIT_CARD','PIX')),
  amount_cents integer NOT NULL CHECK (amount_cents>0),
  status text NOT NULL CHECK (status IN ('INITIALIZING','WAITING_CARD_OR_QR','PROCESSING','AUTHORIZED','CONFIRMED','REVERSED','FAILED')),
  nsu text, authorization_code text, version integer NOT NULL DEFAULT 0,
  error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_payment_pending ON payment_transactions(status,created_at) WHERE status NOT IN ('CONFIRMED','REVERSED','FAILED');
CREATE TABLE orders (
  id uuid PRIMARY KEY, idempotency_key uuid NOT NULL UNIQUE CHECK (substring(idempotency_key::text,15,1)='7'),
  intent_hash text NOT NULL, terminal_id text NOT NULL REFERENCES kiosk_terminals(id),
  operator_id uuid REFERENCES users(id), shift_id uuid REFERENCES shifts(id),
  origin text NOT NULL CHECK (origin IN ('PDV_ASSISTIDO','TOTEM')),
  business_date date NOT NULL, ticket_sequence integer NOT NULL,
  public_ticket_number text NOT NULL,
  status text NOT NULL CHECK (status IN ('RECEIVED','PREPARING','READY','DELIVERED','CANCELLED')),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents>0), total_cents integer NOT NULL CHECK (total_cents>0),
  nfce_status text NOT NULL CHECK (nfce_status IN ('NOT_EMITTED','SIMULATED')),
  offline_created_at timestamptz, contingency_ticket text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_date,ticket_sequence)
);
CREATE INDEX ix_orders_kds ON orders(created_at,id) WHERE status IN ('RECEIVED','PREPARING','READY');
CREATE INDEX ix_orders_shift ON orders(shift_id);
CREATE TABLE order_items (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id),
  product_id uuid NOT NULL REFERENCES products(id), product_name text NOT NULL,
  size_id uuid, size_name text, unit_price_cents integer NOT NULL CHECK (unit_price_cents>=0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99), total_price_cents integer NOT NULL CHECK (total_price_cents>=0),
  notes text NOT NULL DEFAULT '', fiscal jsonb NOT NULL
);
CREATE INDEX ix_items_order ON order_items(order_id);
CREATE TABLE order_item_additions (
  id uuid PRIMARY KEY, order_item_id uuid NOT NULL REFERENCES order_items(id),
  addition_id uuid NOT NULL, name text NOT NULL, price_cents integer NOT NULL CHECK (price_cents>=0),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 50)
);
CREATE INDEX ix_item_additions_item ON order_item_additions(order_item_id);
CREATE TABLE order_payments (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id),
  idempotency_key uuid NOT NULL UNIQUE CHECK (substring(idempotency_key::text,15,1)='7'),
  method text NOT NULL CHECK (method IN ('CASH','CREDIT_CARD','DEBIT_CARD','PIX')),
  amount_cents integer NOT NULL CHECK (amount_cents>0),
  amount_tendered_cents integer, change_amount_cents integer,
  terminal_transaction_id uuid UNIQUE REFERENCES payment_transactions(id),
  status text NOT NULL CHECK(status IN ('AUTHORIZED','CONFIRMED','REVERSED')),
  paid_at timestamptz,
  CHECK ((method='CASH' AND amount_tendered_cents IS NOT NULL AND change_amount_cents IS NOT NULL AND terminal_transaction_id IS NULL AND amount_tendered_cents>=amount_cents AND change_amount_cents=amount_tendered_cents-amount_cents)
    OR (method<>'CASH' AND amount_tendered_cents IS NULL AND change_amount_cents IS NULL AND terminal_transaction_id IS NOT NULL))
);
CREATE INDEX ix_payments_order ON order_payments(order_id);
CREATE TABLE cash_movements (
  id uuid PRIMARY KEY, idempotency_key uuid NOT NULL UNIQUE,
  shift_id uuid NOT NULL REFERENCES shifts(id), order_id uuid REFERENCES orders(id),
  operator_id uuid NOT NULL REFERENCES users(id), authorized_by_user_id uuid REFERENCES users(id),
  type text NOT NULL CHECK(type IN ('INITIAL_SUPPLY','SUPPLY','BLEED_SANGRIA','ORDER_PAYMENT','ORDER_REFUND')),
  amount_cents integer NOT NULL CHECK(amount_cents>=0), reason text NOT NULL CHECK(length(reason)>=3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_movements_shift ON cash_movements(shift_id,created_at,id);
CREATE TABLE shift_reconciliations (
  id uuid PRIMARY KEY, shift_id uuid NOT NULL REFERENCES shifts(id),
  method text NOT NULL CHECK(method IN ('CASH','CREDIT_CARD','DEBIT_CARD','PIX')),
  system_calculated_amount integer NOT NULL, operator_declared_amount integer NOT NULL CHECK(operator_declared_amount>=0),
  difference integer NOT NULL,
  CHECK(difference=operator_declared_amount-system_calculated_amount), UNIQUE(shift_id,method)
);

CREATE TABLE print_jobs (
  id uuid PRIMARY KEY, terminal_id text NOT NULL REFERENCES kiosk_terminals(id), order_id uuid REFERENCES orders(id), shift_id uuid REFERENCES shifts(id),
  kind text NOT NULL CHECK(kind IN ('ORDER_RECEIPT','SHIFT_REPORT')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','CLAIMED','PRINTED','FAILED','SIMULATED')),
  payload jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0,
  claim_token uuid, claimed_at timestamptz, completed_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_print_queue ON print_jobs(terminal_id,created_at) WHERE status IN ('QUEUED','CLAIMED');
CREATE UNIQUE INDEX uq_print_initial_receipt ON print_jobs(order_id) WHERE kind='ORDER_RECEIPT' AND (payload->>'reprint') IS DISTINCT FROM 'true';
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY, user_id uuid REFERENCES users(id), terminal_id text REFERENCES kiosk_terminals(id),
  authorized_by_user_id uuid REFERENCES users(id), action text NOT NULL, resource_id text NOT NULL,
  reason text NOT NULL CHECK(length(reason)>=3), before_payload jsonb, after_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_time ON audit_logs(created_at DESC,id);
CREATE FUNCTION protect_audit_logs() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_logs are immutable' USING ERRCODE='42501'; END; $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION protect_audit_logs();
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY, routing_key text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text
);
CREATE INDEX ix_outbox_pending ON outbox_events(next_attempt_at,created_at) WHERE published_at IS NULL;
CREATE TABLE inbox_messages (consumer text NOT NULL, message_id uuid NOT NULL, processed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(consumer,message_id));
CREATE TABLE offline_sync_requests (
  id uuid PRIMARY KEY, idempotency_key uuid NOT NULL UNIQUE,
  terminal_id text NOT NULL REFERENCES kiosk_terminals(id), payload jsonb NOT NULL,
  intent_hash text NOT NULL, status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSED','REJECTED')),
  order_id uuid REFERENCES orders(id), error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE TABLE terminal_receipt_resolutions (
  idempotency_key uuid PRIMARY KEY,
  terminal_id text NOT NULL REFERENCES kiosk_terminals(id),
  printed boolean NOT NULL,
  printed_at timestamptz,
  contingency_ticket text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
