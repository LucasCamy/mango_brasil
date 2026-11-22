ALTER TABLE shift_reconciliations DROP CONSTRAINT shift_reconciliations_operator_declared_amount_check;
ALTER TABLE shift_reconciliations ADD CONSTRAINT ck_reconciliation_declared_amount
  CHECK ((method='CASH' AND operator_declared_amount>=0)
    OR (method IN ('CREDIT_CARD','DEBIT_CARD','PIX') AND operator_declared_amount BETWEEN -999999999 AND 999999999));
