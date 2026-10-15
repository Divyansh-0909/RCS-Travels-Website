import assert from 'node:assert/strict';
import {brokerCall} from './broker-execution.mjs';
export async function recoveryOperation(client,command){
  assert.ok(command&&typeof command==='object'&&!Array.isArray(command));
  const {action}=command;assert.ok(['INSPECT','ACCOUNTING','RECONCILE','STOP','RESUME','TERMINATE','CLEAN'].includes(action));
  const fields=action==='INSPECT'?['action','target']:action==='ACCOUNTING'?['action']:action==='RECONCILE'?['action','receipt']:['action','id','target','expected','reason'];
  assert.deepEqual(Object.keys(command).sort(),fields.sort());
  if(action==='INSPECT')return brokerCall(client,'inspect',[command.target]);
  if(action==='ACCOUNTING')return brokerCall(client,'accounting',[]);
  if(action==='RECONCILE')return brokerCall(client,'reconcile',[JSON.stringify(command.receipt)]);
  assert.match(command.id,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.ok(Number.isSafeInteger(command.expected)&&command.expected>=0);
  return brokerCall(client,'operate',[command.id,command.target,action,command.expected,command.reason]);
}
