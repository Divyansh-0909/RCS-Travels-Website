import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function p7Catalog(client,schemas){
  const routines=(await client.query(`SELECT n.nspname schema,p.oid::regprocedure::text signature,l.lanname language,
    pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl,pg_get_functiondef(p.oid) definition,
    EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') extension_member,
    EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') public_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname=ANY($1) ORDER BY signature`,[schemas])).rows.map(r=>({...r,definitionSha256:hash(r.definition)}));
  const tables=(await client.query(`SELECT n.nspname schema,c.relname name,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind IN('r','p') ORDER BY schema,name`,[schemas])).rows;
  const constraints=(await client.query(`SELECT n.nspname schema,c.relname relation,p.conname name,p.contype,pg_get_constraintdef(p.oid) definition
    FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY($1) ORDER BY schema,relation,name`,[schemas])).rows;
  const triggers=(await client.query(`SELECT n.nspname schema,c.relname relation,t.tgname name,t.tgenabled,pg_get_triggerdef(t.oid) definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname=ANY($1) ORDER BY schema,relation,name`,[schemas])).rows;
  const columns=(await client.query(`SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema=ANY($1) ORDER BY table_schema,table_name,ordinal_position`,[schemas])).rows;
  const indexes=(await client.query('SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=ANY($1) ORDER BY schemaname,tablename,indexname',[schemas])).rows;
  const policies=(await client.query('SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=ANY($1) ORDER BY schemaname,tablename,policyname',[schemas])).rows;
  const defaults=(await client.query(`SELECT pg_get_userbyid(d.defaclrole) owner,COALESCE(n.nspname,'GLOBAL') schema,d.defaclobjtype,d.defaclacl::text acl
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    WHERE pg_get_userbyid(d.defaclrole) IN('shadow9d_owner','shadow9d_auditor','broker9d_owner','custody_owner','custody_source_owner') ORDER BY owner,schema,defaclobjtype`)).rows;
  const roles=(await client.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname~'^(shadow9d_|broker9d_|custody_)' ORDER BY rolname")).rows;
  return {routines,tables,constraints,triggers,columns,indexes,policies,defaults,roles};
}
