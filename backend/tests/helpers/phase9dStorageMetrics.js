import assert from 'node:assert/strict';
export async function storageSnapshot(client,label){
  const relations=(await client.query(`SELECT c.oid,n.nspname schema,c.relname relation,
    pg_relation_size(c.oid)::text heap,pg_indexes_size(c.oid)::text indexes,pg_table_size(c.oid)::text table_bytes,pg_total_relation_size(c.oid)::text total,
    CASE WHEN c.reltoastrelid=0 THEN '0' ELSE pg_total_relation_size(c.reltoastrelid)::text END toast_total,
    pg_relation_size(c.oid,'fsm')::text fsm,pg_relation_size(c.oid,'vm')::text vm
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname,c.relname`)).rows;
  for(const r of relations){
    assert.match(r.schema,/^[a-zA-Z_][a-zA-Z_0-9]*$/);assert.match(r.relation,/^[a-zA-Z_][a-zA-Z_0-9]*$/);
    r.rows=(await client.query('SELECT count(*)::text count FROM "'+r.schema+'"."'+r.relation+'"')).rows[0].count;
    assert.equal(BigInt(r.total),BigInt(r.table_bytes)+BigInt(r.indexes));
  }
  const database=(await client.query(`SELECT current_database() name,pg_database_size(current_database())::text bytes,
    pg_current_wal_insert_lsn()::text insert_lsn,(SELECT system_identifier::text FROM pg_control_system()) cluster,
    (SELECT count(*)::int FROM pg_ls_tmpdir()) temp_files,(SELECT COALESCE(sum(size),0)::text FROM pg_ls_tmpdir()) temp_bytes`)).rows[0];
  return {label,at:new Date().toISOString(),database,relations};
}
export async function clusterSnapshot(client,label){
  return {label,at:new Date().toISOString(),...(await client.query(`SELECT (SELECT system_identifier::text FROM pg_control_system()) cluster,
    pg_current_wal_insert_lsn()::text insert_lsn,(SELECT COALESCE(sum(size),0)::text FROM pg_ls_waldir()) physical_wal_bytes,
    (SELECT count(*) FROM pg_replication_slots) slots,(SELECT redo_lsn::text FROM pg_control_checkpoint()) redo_lsn,
    (SELECT jsonb_object_agg(name,setting) FROM pg_settings WHERE name IN('max_wal_size','min_wal_size','wal_keep_size','max_slot_wal_keep_size','archive_mode','wal_segment_size','temp_file_limit','max_connections','shared_buffers')) settings`)).rows[0]};
}
