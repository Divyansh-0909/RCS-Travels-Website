import assert from 'node:assert/strict'

const NativeDate = Date

/** Test-only wall clock for legacy services that do not yet accept a clock parameter. */
export function installPhase9ControlledTime(clock) {
  assert.equal(process.env.PHASE9_ISOLATED, '1')
  assert.equal(globalThis.Date, NativeDate, 'controlled lifecycles must run sequentially')
  function ControlledDate(...args) {
    if (!new.target) return new NativeDate(clock.now().getTime()).toString()
    return Reflect.construct(NativeDate, args.length ? args : [clock.now().getTime()])
  }
  Object.setPrototypeOf(ControlledDate, NativeDate)
  ControlledDate.prototype = NativeDate.prototype
  ControlledDate.now = () => clock.now().getTime()
  globalThis.Date = ControlledDate
  return () => { globalThis.Date = NativeDate }
}

/** Fix only schema-generated audit timestamps, never externally observed/captured timestamps. */
export async function installPhase9DatabaseTime(db, clock) {
  const [identity] = await db.$queryRaw`SELECT current_database() AS name`
  assert.match(identity.name, /^rcs_verify_[a-f0-9]{32}$/)
  await db.$executeRawUnsafe('CREATE TABLE phase9_clock (id boolean PRIMARY KEY CHECK (id), instant timestamptz NOT NULL)')
  await db.$executeRaw`INSERT INTO phase9_clock VALUES (true, ${clock.now()})`
  await db.$executeRawUnsafe(`CREATE FUNCTION phase9_audit_clock() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE stamp timestamptz; patch jsonb := '{}'::jsonb;
    BEGIN
      SELECT instant INTO STRICT stamp FROM phase9_clock WHERE id;
      IF to_jsonb(NEW) ? 'created_at' AND TG_OP = 'INSERT' THEN patch := patch || jsonb_build_object('created_at', stamp); END IF;
      IF to_jsonb(NEW) ? 'updated_at' THEN patch := patch || jsonb_build_object('updated_at', stamp); END IF;
      NEW := jsonb_populate_record(NEW, patch); RETURN NEW;
    END $$`)
  const tables = await db.$queryRaw`SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('created_at', 'updated_at')
      AND table_name NOT LIKE '_prisma%' GROUP BY table_name ORDER BY table_name`
  for (const { table_name: table } of tables) {
    assert.match(table, /^[a-z_]+$/)
    await db.$executeRawUnsafe(`CREATE TRIGGER phase9_audit_clock BEFORE INSERT OR UPDATE ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION phase9_audit_clock()`)
  }
  return async () => db.$executeRaw`UPDATE phase9_clock SET instant = ${clock.now()} WHERE id`
}
