CREATE FUNCTION prevent_responsibility_financial_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER responsibility_liabilities_append_only
BEFORE UPDATE OR DELETE ON "responsibility_liabilities"
FOR EACH ROW EXECUTE FUNCTION prevent_responsibility_financial_mutation();

CREATE TRIGGER responsibility_liabilities_prevent_truncate
BEFORE TRUNCATE ON "responsibility_liabilities"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_responsibility_financial_mutation();

CREATE TRIGGER responsibility_liability_entries_append_only
BEFORE UPDATE OR DELETE ON "responsibility_liability_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_responsibility_financial_mutation();

CREATE TRIGGER responsibility_liability_entries_prevent_truncate
BEFORE TRUNCATE ON "responsibility_liability_entries"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_responsibility_financial_mutation();

CREATE TRIGGER responsibility_compensations_append_only
BEFORE UPDATE OR DELETE ON "responsibility_compensations"
FOR EACH ROW EXECUTE FUNCTION prevent_responsibility_financial_mutation();

CREATE TRIGGER responsibility_compensations_prevent_truncate
BEFORE TRUNCATE ON "responsibility_compensations"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_responsibility_financial_mutation();

CREATE UNIQUE INDEX "responsibility_liability_entries_one_created_per_liability_key"
ON "responsibility_liability_entries" ("liability_id")
WHERE "kind" = 'CREATED';

ALTER TABLE "responsibility_liability_entries"
ADD CONSTRAINT "responsibility_liability_entries_created_earning_booking_id_check"
CHECK ("kind" <> 'CREATED' OR "earning_booking_id" IS NULL);
