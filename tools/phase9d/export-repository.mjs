export function createShadowExportRepository(client) {
  const call=async(sql,args=[]) =>(await client.query(sql,args)).rows[0].value;
  return {
    scan:()=>call('SELECT outbox9d.scan() value'),
    claim:()=>call('SELECT outbox9d.claim() value'),
    stage:(work,payload)=>call('SELECT outbox9d.stage($1,$2,$3) value',[work.id,work.token,JSON.stringify(payload)]),
    deliver:work=>call('SELECT outbox9d.deliver($1,$2) value',[work.id,work.token]),
    fail:(work,retryable,category)=>call('SELECT outbox9d.fail($1,$2,$3,$4) value',[work.id,work.token,retryable,category]),
  };
}
