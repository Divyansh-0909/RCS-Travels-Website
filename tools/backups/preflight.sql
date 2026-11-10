-- READ ONLY. Run only against an explicitly authorized development/verification project.
-- No credentials, row payloads, role passwords, grants, DDL or settings changed.
BEGIN READ ONLY;
SELECT version(), current_database(), current_user;
SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls
FROM pg_roles WHERE rolname=current_user;
SELECT e.extname,e.extversion,n.nspname AS extension_schema
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1;
SELECT name,default_version,installed_version
FROM pg_available_extensions
WHERE name IN ('postgis','vector','pgcrypto','plpgsql_check') ORDER BY 1;
SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl
FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY 1;
SELECT required, CASE WHEN to_regnamespace(split_part(required,'.',1)) IS NULL THEN false
                      ELSE to_regprocedure(required) IS NOT NULL END AS installed
FROM (VALUES ('outbox9d.hmac(text,text,text)'),
             ('transport9d.hmac(text,text,text)'),
             ('custody.hmac(text,text,text)')) r(required);
SELECT rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls
FROM pg_roles WHERE rolname ~ '^(shadow9d_|broker9d_|custody_)' ORDER BY 1;
SELECT a.rolname AS granted_role,b.rolname AS member,m.admin_option
FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.roleid JOIN pg_roles b ON b.oid=m.member
WHERE a.rolname ~ '^(shadow9d_|broker9d_|custody_)' ORDER BY 1,2;
ROLLBACK;
