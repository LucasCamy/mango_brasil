ALTER TABLE shift_reconciliations ALTER COLUMN system_calculated_amount TYPE bigint;
ALTER TABLE shift_reconciliations ALTER COLUMN operator_declared_amount TYPE bigint;
ALTER TABLE shift_reconciliations ALTER COLUMN difference TYPE bigint;
ALTER TABLE shift_reconciliations DROP CONSTRAINT ck_reconciliation_declared_amount;
ALTER TABLE shift_reconciliations ADD CONSTRAINT ck_reconciliation_declared_amount
  CHECK ((method='CASH' AND operator_declared_amount BETWEEN 0 AND 999999999999)
    OR (method IN ('CREDIT_CARD','DEBIT_CARD','PIX') AND operator_declared_amount BETWEEN -999999999999 AND 999999999999));
ALTER TABLE shift_reconciliations ADD CONSTRAINT ck_reconciliation_expected_amount
  CHECK (system_calculated_amount BETWEEN -999999999999 AND 999999999999);
