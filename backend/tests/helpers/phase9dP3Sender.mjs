import pg from 'pg';
let client;
process.on('message',async input=>{
  if(input.stop){await client?.end();process.disconnect();return;}
  try{
    if(!['custody_export','custody_lineage'].includes(input.schema))throw Error('SCHEMA');
    const uri=new URL(input.uri);if(uri.hostname!=='localhost')throw Error('HOST');
    client=new pg.Client({connectionString:input.uri,connectionTimeoutMillis:2000,statement_timeout:3000});client.on('error',()=>{});await client.connect();
    const actor=(await client.query('SELECT session_user actor')).rows[0].actor;
    const frame=(await client.query('SELECT '+input.schema+'.next() frame')).rows[0].frame;
    process.send({status:'SELECTED',actor,pid:process.pid,frame});
  }catch(error){process.send({status:'FAILED',code:error.code??'P3_SENDER_FAILED'});await client?.end();process.disconnect();}
});
