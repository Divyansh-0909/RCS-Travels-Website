import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recoverySession} from './recovery-session.mjs';
import {recoveryOperation} from './recovery-operations.mjs';
// Credentials only through stdin. No runtime dotenv or credential arguments.
let bytes='';for await(const chunk of process.stdin){bytes+=chunk;assert.ok(Buffer.byteLength(bytes)<=16384);}
let client;
try{
  const input=JSON.parse(bytes);assert.deepEqual(Object.keys(input).sort(),['command','connectionString']);
  if(input.command.receiptFile){const {receiptFile,...command}=input.command;input.command={...command,receipt:JSON.parse(await readFile(receiptFile,'utf8'))};}
  client=await recoverySession(input.connectionString,'broker9d_ops');
  console.log(JSON.stringify(await recoveryOperation(client,input.command)));
}catch{console.error('RECOVERY_OPERATION_FAILED_CLOSED');process.exitCode=1;}
finally{await client?.end();}
